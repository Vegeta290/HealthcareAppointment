import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import { requireRole } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/calendar/google";

// GET /api/integrations/google-calendar/authorize
// Any authenticated patient or doctor may connect their own calendar. Redirects
// to Google's consent screen with `state` set to a short-lived JWT carrying the
// caller's userId, verified again in the callback route so the token exchange
// can't be replayed against a different account.
export async function GET(request: NextRequest) {
  const auth = requireRole(request, [Role.PATIENT, Role.DOCTOR, Role.ADMIN]);
  if (!auth.ok) return auth.response;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET is not configured" }, { status: 500 });
  }

  const state = jwt.sign({ userId: auth.session.sub }, secret, { expiresIn: "10m" });

  try {
    const url = getGoogleAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build Google auth URL" },
      { status: 500 }
    );
  }
}
