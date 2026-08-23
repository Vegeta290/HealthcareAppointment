import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { computeSlotEnd, isDoctorOnLeave } from "@/lib/scheduling";

const HOLD_TTL_MINUTES = 10;

interface HoldRequestBody {
  doctorId?: string;
  slotStart?: string; // ISO 8601
}

// POST /api/appointments/hold
// Reserves a slot for a short window while the patient fills out the symptom form,
// before the booking is finalised. Advisory, not authoritative — see PLAN.md §1 and
// the comment on the Appointment model's partial unique index in schema.prisma for
// why the /book route is the real double-booking guard.
export async function POST(request: NextRequest) {
  const auth = requireRole(request, [Role.PATIENT]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: HoldRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { doctorId, slotStart: slotStartRaw } = body;
  if (!doctorId || !slotStartRaw) {
    return NextResponse.json(
      { error: "doctorId and slotStart are required" },
      { status: 400 }
    );
  }

  const slotStart = new Date(slotStartRaw);
  if (Number.isNaN(slotStart.getTime())) {
    return NextResponse.json({ error: "slotStart is not a valid date" }, { status: 400 });
  }
  if (slotStart.getTime() <= Date.now()) {
    return NextResponse.json({ error: "slotStart must be in the future" }, { status: 400 });
  }

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!patientProfile) {
    return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
  }

  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { id: true, slotDurationMinutes: true },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  if (await isDoctorOnLeave(prisma, doctor.id, slotStart)) {
    return NextResponse.json(
      { error: "Doctor is on leave for the selected date" },
      { status: 409 }
    );
  }

  const slotEnd = computeSlotEnd(slotStart, doctor.slotDurationMinutes);
  const expiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60_000);

  try {
    const hold = await prisma.slotHold.create({
      data: {
        doctorId: doctor.id,
        patientId: patientProfile.id,
        slotStart,
        slotEnd,
        expiresAt,
      },
      select: { id: true, slotStart: true, slotEnd: true, expiresAt: true },
    });

    return NextResponse.json({ hold }, { status: 201 });
  } catch (err) {
    // Raised by the slothold_active_slot_uq partial unique index (see
    // prisma/sql/partial_unique_indexes.sql) when another ACTIVE hold already
    // exists for this doctor/slot.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Slot is currently held by another patient. Please choose another slot." },
        { status: 409 }
      );
    }
    throw err;
  }
}
