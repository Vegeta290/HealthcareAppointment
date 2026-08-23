import { NextRequest, NextResponse } from "next/server";
import { LeaveStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getLeaveConflictQueue } from "@/lib/queue/queues";

interface CreateLeaveBody {
  doctorId?: string; // required for ADMIN; ignored/must-match for DOCTOR
  startDate?: string; // ISO date, e.g. "2026-09-01"
  endDate?: string;
  reason?: string;
}

function toDateOnlyUtc(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

// POST /api/doctor-leave
// Creates a leave record and hands conflict detection off to a background
// worker (see workers/leaveConflictWorker.ts) rather than scanning for and
// cancelling affected appointments inline — keeps this request fast and gives
// the detection step a durable, retryable job instead of a one-shot inline scan.
export async function POST(request: NextRequest) {
  const auth = requireRole(request, [Role.DOCTOR, Role.ADMIN]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: CreateLeaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let doctorId: string;
  if (session.role === Role.DOCTOR) {
    const own = await prisma.doctorProfile.findUnique({
      where: { userId: session.sub },
      select: { id: true },
    });
    if (!own) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
    }
    // A doctor may only file leave for themselves — a body.doctorId for someone
    // else is rejected rather than silently overridden, so a client bug doesn't
    // quietly file leave for the wrong doctor.
    if (body.doctorId && body.doctorId !== own.id) {
      return NextResponse.json(
        { error: "Doctors may only file leave for their own profile" },
        { status: 403 }
      );
    }
    doctorId = own.id;
  } else {
    if (!body.doctorId) {
      return NextResponse.json({ error: "doctorId is required" }, { status: 400 });
    }
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: body.doctorId },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }
    doctorId = doctor.id;
  }

  if (!body.startDate || !body.endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
  }

  const startDate = toDateOnlyUtc(body.startDate);
  const endDate = toDateOnlyUtc(body.endDate);
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate/endDate are not valid dates" }, { status: 400 });
  }
  if (startDate.getTime() > endDate.getTime()) {
    return NextResponse.json({ error: "startDate must be on or before endDate" }, { status: 400 });
  }

  const leave = await prisma.doctorLeave.create({
    data: {
      doctorId,
      startDate,
      endDate,
      reason: body.reason,
      createdById: session.sub,
    },
  });

  await getLeaveConflictQueue().add("detect-conflicts", { leaveId: leave.id });

  return NextResponse.json({ leave }, { status: 201 });
}

// GET /api/doctor-leave?doctorId=...
// Doctors only ever see their own leave; admins may query any doctor (or all,
// with no doctorId filter).
export async function GET(request: NextRequest) {
  const auth = requireRole(request, [Role.DOCTOR, Role.ADMIN]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const requestedDoctorId = request.nextUrl.searchParams.get("doctorId") ?? undefined;

  let doctorId: string | undefined;
  if (session.role === Role.DOCTOR) {
    const own = await prisma.doctorProfile.findUnique({
      where: { userId: session.sub },
      select: { id: true },
    });
    if (!own) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
    }
    if (requestedDoctorId && requestedDoctorId !== own.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    doctorId = own.id;
  } else {
    doctorId = requestedDoctorId;
  }

  const leaves = await prisma.doctorLeave.findMany({
    where: { doctorId, status: LeaveStatus.ACTIVE },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json({ leaves });
}
