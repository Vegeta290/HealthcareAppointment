import { google } from "googleapis";
import { prisma } from "../prisma";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI are not configured"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Step 1 of OAuth 2.0: build the Google consent-screen URL. `state` should be a
// signed/opaque token identifying which User is connecting (e.g. their id),
// verified again in the callback — see
// app/api/integrations/google-calendar/authorize/route.ts.
export function getGoogleAuthUrl(state: string): string {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // forces refresh_token on every connect, not just the first
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state,
  });
}

// Step 2: exchange the authorization code Google redirected back with for
// tokens. Called from the callback route, which persists the result onto
// GoogleCalendarCredential.
export async function exchangeCodeForTokens(code: string) {
  const { tokens } = await getOAuthClient().getToken(code);
  return tokens;
}

async function getAuthorizedClientForUser(
  userId: string
): Promise<{ auth: InstanceType<typeof google.auth.OAuth2>; calendarId: string } | null> {
  const credential = await prisma.googleCalendarCredential.findUnique({ where: { userId } });
  if (!credential) {
    return null; // user hasn't connected Google Calendar — callers treat this as a no-op, not an error
  }

  const client = getOAuthClient();
  client.setCredentials({
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken,
    expiry_date: credential.expiryDate.getTime(),
  });

  // googleapis refreshes the access token transparently when it's expired; this
  // listener persists the rotated token (and a new refresh token, if Google
  // issued one) so the next call doesn't have to refresh again.
  client.on("tokens", (tokens) => {
    prisma.googleCalendarCredential
      .update({
        where: { userId },
        data: {
          accessToken: tokens.access_token ?? credential.accessToken,
          refreshToken: tokens.refresh_token ?? credential.refreshToken,
          expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : credential.expiryDate,
        },
      })
      .catch(() => {
        // Best-effort persistence; the in-memory client still has a valid token
        // for this call, so we don't fail the calendar operation over this.
      });
  });

  return { auth: client, calendarId: credential.calendarId };
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendeeEmails?: string[];
}

export interface CalendarEventRef {
  googleEventId: string;
  calendarId: string;
}

// Returns null (not an error) if the user hasn't connected Google Calendar —
// calendar sync is a best-effort enhancement, not a booking requirement.
export async function createGoogleCalendarEvent(
  userId: string,
  input: CalendarEventInput
): Promise<CalendarEventRef | null> {
  const authorized = await getAuthorizedClientForUser(userId);
  if (!authorized) return null;

  const calendar = google.calendar({ version: "v3", auth: authorized.auth });
  const res = await calendar.events.insert({
    calendarId: authorized.calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
      attendees: input.attendeeEmails?.map((email) => ({ email })),
    },
  });

  if (!res.data.id) {
    throw new Error("Google Calendar API did not return an event id");
  }
  return { googleEventId: res.data.id, calendarId: authorized.calendarId };
}

export async function updateGoogleCalendarEvent(
  userId: string,
  ref: CalendarEventRef,
  input: CalendarEventInput
): Promise<void> {
  const authorized = await getAuthorizedClientForUser(userId);
  if (!authorized) return;

  const calendar = google.calendar({ version: "v3", auth: authorized.auth });
  await calendar.events.update({
    calendarId: ref.calendarId,
    eventId: ref.googleEventId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    },
  });
}

export async function deleteGoogleCalendarEvent(
  userId: string,
  ref: CalendarEventRef
): Promise<void> {
  const authorized = await getAuthorizedClientForUser(userId);
  if (!authorized) return;

  const calendar = google.calendar({ version: "v3", auth: authorized.auth });
  try {
    await calendar.events.delete({ calendarId: ref.calendarId, eventId: ref.googleEventId });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    // Already gone (deleted directly in Google Calendar, or double-processed) —
    // treat as success so the caller's cleanup is idempotent.
    if (code === 404 || code === 410) return;
    throw err;
  }
}
