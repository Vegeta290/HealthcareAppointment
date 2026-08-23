import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";

export interface SessionPayload {
  sub: string; // User.id
  role: Role;
}

export const SESSION_COOKIE_NAME = "session";
const SESSION_TOKEN_TTL = "7d";
const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

// Signs a session JWT and attaches it to `response` as an httpOnly cookie.
// Centralised here (rather than duplicated in login/register routes) so the
// cookie name/flags/TTL used to set the cookie always match what
// verifySessionToken/getSession expect when reading it back.
export function setSessionCookie(response: NextResponse, payload: SessionPayload): void {
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_TOKEN_TTL });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

// Reads the session from either an `Authorization: Bearer <token>` header or a
// `session` cookie, whichever is present. Returns null if absent/invalid — callers
// decide whether that's a 401.
function getSession(request: NextRequest): SessionPayload | null {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const token = bearerToken ?? request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  return verifySessionToken(token);
}

export type AuthResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

// Central RBAC gate for API routes: verifies the caller is authenticated AND holds
// one of `allowedRoles`. Every route handling Appointment/SlotHold/DoctorLeave data
// must call this first and use `session.sub`/`session.role` for row-level scoping —
// never trust a role or user id supplied in the request body.
export function requireRole(request: NextRequest, allowedRoles: Role[]): AuthResult {
  const session = getSession(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
