import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { SESSION_COOKIE_NAME, SessionPayload, verifySessionToken } from "./auth";

// Server Component / layout equivalent of lib/auth.ts's requireRole for API
// routes: reads the same httpOnly session cookie, but via next/headers instead
// of a NextRequest. Used by every portal's root layout (app/patient/layout.tsx
// etc.) to gate access before any page in that segment renders.
export function getServerSession(): SessionPayload | null {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Redirects to /login if there's no session, or to /403 if the session's role
// isn't allowed here — this is the strict SSR RBAC gate: unauthorized users
// never receive server-rendered markup for a portal they can't access, unlike
// a client-side check that would briefly flash protected content.
export function requireServerSession(allowedRoles: Role[]): SessionPayload {
  const session = getServerSession();
  if (!session) {
    redirect("/login");
  }
  if (!allowedRoles.includes(session.role)) {
    redirect("/403");
  }
  return session;
}
