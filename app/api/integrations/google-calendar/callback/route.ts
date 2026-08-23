import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForTokens } from "@/lib/calendar/google";

// GET /api/integrations/google-calendar/callback
// Google redirects here after the user grants (or denies) consent. No session
// cookie/header is available on this request — the caller's identity comes from
// `state`, the short-lived JWT minted in the /authorize route, so it must be
// verified before trusting it.
export async function GET(request: NextRequest) {
  const appBaseUrl = process.env.APP_BASE_URL ?? request.nextUrl.origin;
  const params = request.nextUrl.searchParams;

  const error = params.get("error");
  if (error) {
    return NextResponse.redirect(`${appBaseUrl}/settings/calendar?status=denied`);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JWT_SECRET is not configured" }, { status: 500 });
  }

  let userId: string;
  try {
    const decoded = jwt.verify(state, secret) as { userId: string };
    userId = decoded.userId;
  } catch {
    return NextResponse.json({ error: "Invalid or expired state" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      // Missing refresh_token typically means the user had already granted
      // consent before and Google didn't re-issue one; access_type=offline +
      // prompt=consent on the authorize step (see lib/calendar/google.ts) is
      // meant to prevent this, but surface it clearly if it happens anyway.
      return NextResponse.json(
        { error: "Google did not return a complete token set. Please try connecting again." },
        { status: 502 }
      );
    }

    await prisma.googleCalendarCredential.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date),
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: new Date(tokens.expiry_date),
      },
    });

    return NextResponse.redirect(`${appBaseUrl}/settings/calendar?status=connected`);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to complete Google OAuth" },
      { status: 500 }
    );
  }
}
