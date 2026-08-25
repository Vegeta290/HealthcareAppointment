import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, NotificationType, Prisma, Role, SlotHoldStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isDoctorOnLeave } from "@/lib/scheduling";
import { enqueueBookingSideEffects, enqueueCalendarCleanup } from "@/lib/appointments/sideEffects";

interface RescheduleBody {
  holdId?: string;
}

class HoldNotAvailableError extends Error {}
class AppointmentNotReschedulableError extends Error {}

// POST /api/appointments/[id]/reschedule
// Patient-initiated reschedule: cancels the existing appointment and creates
// a new one from an already-held slot (same hold/book flow as
// app/api/appointments/hold and .../book — the patient must call
// POST /api/appointments/hold first to reserve the new slot, then this
// route). Modeled as cancel-old + create-new rather than mutating slotStart
// in place — keeps the audit trail and
// notification history intact, and the new row goes through the exact same
// partial-unique-index guarantee as a fresh booking.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(request, [Role.PATIENT]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: RescheduleBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.holdId) {
    return NextResponse.json({ error: "holdId is required" }, { status: 400 });
  }

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!patientProfile) {
    return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
  }

  const original = await prisma.appointment.findUnique({ where: { id: params.id } });
  if (!original || original.patientId !== patientProfile.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (original.status !== AppointmentStatus.PENDING && original.status !== AppointmentStatus.CONFIRMED) {
    return NextResponse.json(
      { error: "Only pending or confirmed appointments can be rescheduled" },
      { status: 400 }
    );
  }

  const hold = await prisma.slotHold.findUnique({ where: { id: body.holdId } });
  if (!hold || hold.patientId !== patientProfile.id) {
    return NextResponse.json({ error: "Hold not found" }, { status: 404 });
  }
  if (hold.doctorId !== original.doctorId) {
    return NextResponse.json(
      { error: "Reschedule must be to a slot with the same doctor" },
      { status: 400 }
    );
  }
  if (hold.status !== SlotHoldStatus.ACTIVE || hold.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Hold has expired. Please select the slot again." },
      { status: 410 }
    );
  }
  if (await isDoctorOnLeave(prisma, hold.doctorId, hold.slotStart)) {
    return NextResponse.json(
      { error: "Doctor is on leave for the selected date" },
      { status: 409 }
    );
  }

  try {
    const newAppointment = await prisma.$transaction(async (tx) => {
      const freshOriginal = await tx.appointment.findUnique({ where: { id: original.id } });
      if (
        !freshOriginal ||
        (freshOriginal.status !== AppointmentStatus.PENDING &&
          freshOriginal.status !== AppointmentStatus.CONFIRMED)
      ) {
        throw new AppointmentNotReschedulableError("Appointment is no longer reschedulable");
      }

      const freshHold = await tx.slotHold.findUnique({ where: { id: hold.id } });
      if (
        !freshHold ||
        freshHold.status !== SlotHoldStatus.ACTIVE ||
        freshHold.expiresAt.getTime() <= Date.now()
      ) {
        throw new HoldNotAvailableError("Hold is no longer active");
      }

      const created = await tx.appointment.create({
        data: {
          doctorId: freshHold.doctorId,
          patientId: freshHold.patientId,
          slotStart: freshHold.slotStart,
          slotEnd: freshHold.slotEnd,
          status: AppointmentStatus.CONFIRMED,
          symptomText: freshOriginal.symptomText,
          symptomSubmittedAt: freshOriginal.symptomText ? new Date() : null,
          rescheduledFromId: freshOriginal.id,
        },
        include: {
          doctor: { include: { user: true } },
          patient: { include: { user: true } },
        },
      });

      await tx.appointment.update({
        where: { id: freshOriginal.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: session.sub,
          cancellationReason: "Rescheduled to a new time",
        },
      });

      await tx.slotHold.update({
        where: { id: freshHold.id },
        data: { status: SlotHoldStatus.CONVERTED, convertedAppointmentId: created.id },
      });

      return created;
    });

    try {
      await enqueueBookingSideEffects(newAppointment, NotificationType.RESCHEDULE);
      await enqueueCalendarCleanup(original.id);
    } catch (sideEffectErr) {
      // Same reasoning as app/api/appointments/book/route.ts: the reschedule
      // itself already committed successfully, so a queueing hiccup must not
      // turn this into a 500.
      console.error("Failed to enqueue reschedule side effects", sideEffectErr);
    }

    return NextResponse.json({ appointment: newAppointment }, { status: 201 });
  } catch (err) {
    if (err instanceof HoldNotAvailableError) {
      return NextResponse.json(
        { error: "Hold has expired. Please select the slot again." },
        { status: 410 }
      );
    }
    if (err instanceof AppointmentNotReschedulableError) {
      return NextResponse.json(
        { error: "This appointment can no longer be rescheduled" },
        { status: 409 }
      );
    }
    // Raised by the appointment_live_slot_uq partial unique index — the same
    // double-booking guard as the initial booking flow (see book/route.ts).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Slot no longer available. Please choose another slot." },
        { status: 409 }
      );
    }
    throw err;
  }
}
