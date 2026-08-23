import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { generateAvailableSlots } from "@/lib/scheduling";

// GET /api/doctors/[doctorId]/slots?date=YYYY-MM-DD
// Used by the patient-facing slot picker (client component) to interactively
// fetch open slots as the patient changes the date. Read-only directory-style
// data, so any authenticated role may call it (same as GET /api/doctors).
export async function GET(
  request: NextRequest,
  { params }: { params: { doctorId: string } }
) {
  const auth = requireRole(request, [Role.PATIENT, Role.DOCTOR, Role.ADMIN]);
  if (!auth.ok) return auth.response;

  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "date query param is required" }, { status: 400 });
  }
  const date = new Date(dateParam);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "date is not a valid date" }, { status: 400 });
  }

  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: params.doctorId },
    select: { id: true },
  });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const slots = await generateAvailableSlots(prisma, doctor.id, date);
  return NextResponse.json({ slots: slots.map((s) => s.toISOString()) });
}
