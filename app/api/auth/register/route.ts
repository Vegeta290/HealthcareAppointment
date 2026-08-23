import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

interface RegisterBody {
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  dateOfBirth?: string; // ISO date, e.g. "1990-01-01"
}

// POST /api/auth/register
// Self-service registration is patient-only, per the requirements doc ("Patient
// can register, log in..."). Doctor and admin accounts are provisioned by an
// admin (see app/api/admin/doctors/route.ts) rather than self-registered, since
// granting DOCTOR/ADMIN access needs to be an admin decision, not something an
// anonymous signup form can hand out.
export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password, fullName } = body;
  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: "email, password, and fullName are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 }
    );
  }

  let dateOfBirth: Date | undefined;
  if (body.dateOfBirth) {
    const parsed = new Date(body.dateOfBirth);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "dateOfBirth is not a valid date" }, { status: 400 });
    }
    if (parsed.getTime() > Date.now()) {
      return NextResponse.json({ error: "dateOfBirth cannot be in the future" }, { status: 400 });
    }
    dateOfBirth = parsed;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.PATIENT,
      patientProfile: {
        create: { fullName, phone: body.phone, dateOfBirth },
      },
    },
  });

  const response = NextResponse.json(
    { user: { id: user.id, email: user.email, role: user.role } },
    { status: 201 }
  );
  setSessionCookie(response, { sub: user.id, role: user.role });
  return response;
}
