import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

interface UpdateDoctorBody {
  fullName?: string;
}

// PATCH /api/doctors/[doctorId]
// Admin-only. Exists mainly to backfill DoctorProfile.fullName on doctors
// created before that field existed (see prisma/migrations/20260824122115_*)
// — new doctors set it at creation time via POST /api/doctors instead.
export async function PATCH(request: NextRequest, { params }: { params: { doctorId: string } }) {
  const auth = requireRole(request, [Role.ADMIN]);
  if (!auth.ok) return auth.response;

  let body: UpdateDoctorBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.fullName || !body.fullName.trim()) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }

  const doctor = await prisma.doctorProfile.findUnique({ where: { id: params.doctorId } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const updated = await prisma.doctorProfile.update({
    where: { id: params.doctorId },
    data: { fullName: body.fullName.trim() },
  });

  return NextResponse.json({ doctor: updated });
}
