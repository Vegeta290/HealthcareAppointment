import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

// POST /api/integrations/google-calendar/disconnect
// Removes the caller's own stored Google OAuth tokens. Deliberately doesn't
// try to revoke the token with Google — deleting the local credential is
// enough to stop this app from syncing; the user can revoke app access from
// their Google account settings if they want that too.
export async function POST(request: NextRequest) {
  const auth = requireRole(request, [Role.PATIENT, Role.DOCTOR, Role.ADMIN]);
  if (!auth.ok) return auth.response;

  await prisma.googleCalendarCredential.deleteMany({ where: { userId: auth.session.sub } });

  return NextResponse.json({ ok: true });
}
