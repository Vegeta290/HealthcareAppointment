import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

// GET /api/doctors?specialisation=...
// Any authenticated user (patients browsing, doctors, admins) may list/search
// doctors — this is directory data, not something that needs row-level scoping.
export async function GET(request: NextRequest) {
  const auth = requireRole(request, [Role.PATIENT, Role.DOCTOR, Role.ADMIN]);
  if (!auth.ok) return auth.response;

  const specialisation = request.nextUrl.searchParams.get("specialisation") ?? undefined;

  const doctors = await prisma.doctorProfile.findMany({
    where: specialisation
      ? { specialisation: { contains: specialisation, mode: "insensitive" } }
      : undefined,
    include: { user: { select: { email: true } } },
    orderBy: { specialisation: "asc" },
  });

  return NextResponse.json({ doctors });
}

interface CreateDoctorBody {
  fullName?: string;
  email?: string;
  password?: string;
  specialisation?: string;
  bio?: string;
  slotDurationMinutes?: number;
  workingHours?: { weekday: number; startTime: string; endTime: string }[];
}

// POST /api/doctors
// Admin-only: provisions a new doctor account + profile + working hours in one
// call. Doctors don't self-register (see app/api/auth/register/route.ts).
export async function POST(request: NextRequest) {
  const auth = requireRole(request, [Role.ADMIN]);
  if (!auth.ok) return auth.response;

  let body: CreateDoctorBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fullName, email, password, specialisation } = body;
  if (!fullName || !email || !password || !specialisation) {
    return NextResponse.json(
      { error: "fullName, email, password, and specialisation are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const invalidWindow = (body.workingHours ?? []).find(
    (w) =>
      typeof w.weekday !== "number" ||
      w.weekday < 0 ||
      w.weekday > 6 ||
      !/^\d{2}:\d{2}$/.test(w.startTime) ||
      !/^\d{2}:\d{2}$/.test(w.endTime)
  );
  if (invalidWindow) {
    return NextResponse.json({ error: "One or more working-hours windows are invalid" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const doctorUser = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.DOCTOR,
      doctorProfile: {
        create: {
          fullName: fullName.trim(),
          specialisation,
          bio: body.bio,
          slotDurationMinutes: body.slotDurationMinutes ?? 30,
          workingHours: body.workingHours?.length
            ? { create: body.workingHours }
            : undefined,
        },
      },
    },
    include: { doctorProfile: { include: { workingHours: true } } },
  });

  return NextResponse.json({ doctor: doctorUser.doctorProfile }, { status: 201 });
}
