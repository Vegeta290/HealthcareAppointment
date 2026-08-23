import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same generic error for "no such user" and "wrong password" — don't leak
  // which one it was.
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({
    user: { id: user.id, email: user.email, role: user.role },
  });
  setSessionCookie(response, { sub: user.id, role: user.role });
  return response;
}
