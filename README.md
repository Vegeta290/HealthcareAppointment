# Healthcare Appointment & Follow-up Manager

A clinic appointment platform with separate patient, doctor, and admin portals: symptom-aware
booking with race-safe double-booking prevention, AI pre-visit and post-visit summaries, doctor
leave conflict handling, and email + Google Calendar notifications.

See [PLAN.md](PLAN.md) for the original schema design rationale and [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
for the write-up on concurrency, leave conflicts, and failure handling.

## Contents

- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database schema logic](#database-schema-logic)
- [API docs](#api-docs)
- [Gemini LLM prompts](#gemini-llm-prompts)
- [Google Calendar OAuth setup](#google-calendar-oauth-setup)
- [Background workers](#background-workers)
- [Deployment](#deployment)

## Local setup

**Prerequisites**: Node.js 18+, a PostgreSQL server, a Redis server (BullMQ backend).

```bash
npm install
cp .env.example .env   # then fill in real values — see below
```

Create the database schema. Prisma can't express the two partial unique indexes that guarantee
double-booking prevention (see [Database schema logic](#database-schema-logic)), so they're
appended by hand after the initial migration is generated:

```bash
npx prisma migrate dev --name init
cat prisma/sql/partial_unique_indexes.sql >> prisma/migrations/*_init/migration.sql
npx prisma migrate dev
```

Seed one Admin, one Doctor, and one Patient account (all password `ChangeMe123!`):

```bash
npx prisma db seed
```

Run the app and the background workers — **both are required**; the app accepts bookings without
the workers running, but no confirmation emails, reminders, calendar sync, or LLM summaries will
ever be processed:

```bash
npm run dev       # Next.js app — http://localhost:3000
npm run workers    # separate terminal — BullMQ workers, needs Redis reachable
```

No local Postgres/Redis? The fastest path is Docker:

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
docker run -d -p 6379:6379 redis:7-alpine
```

### Smoke test

1. `/register` → create a patient account.
2. Log in as the seeded admin (`admin@clinic.test`) → `/admin/doctors` → add a doctor + working
   hours.
3. Log in as the patient → `/patient/doctors` → book a slot → submit symptoms.
4. Log in as that doctor → `/doctor/schedule` → open the appointment → see the AI pre-visit
   summary (requires `GEMINI_API_KEY` and the `workers` process running) → submit clinical notes
   + prescription.
5. Back as the patient → the appointment detail page shows the post-visit summary once the LLM
   job completes.

## Environment variables

All defined with placeholders in [.env.example](.env.example). **Never commit a real `.env`** —
`.gitignore` excludes it.

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Postgres connection string |
| `JWT_SECRET` | Everything | Signs session cookies and the short-lived Google OAuth `state` token. Generate with `openssl rand -base64 48` |
| `GEMINI_API_KEY` | Pre/post-visit AI summaries | From [Google AI Studio](https://aistudio.google.com/apikey). Without it, LLM jobs fail gracefully (`SymptomAnalysis`/`VisitNote` status `FAILED`, UI falls back to raw text) |
| `REDIS_URL` | Background jobs | BullMQ connection. Without it, booking still works but no notifications/reminders/calendar sync ever fire |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Email delivery | Nodemailer transport. A [Mailtrap](https://mailtrap.io) sandbox inbox is the easiest way to test without sending real email |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Calendar sync | See [Google Calendar OAuth setup](#google-calendar-oauth-setup). Without it, calendar sync silently no-ops per user |
| `APP_BASE_URL` | Calendar sync | Used to build the redirect target after the Google consent screen. `http://localhost:3000` locally |

## Database schema logic

Full schema: [prisma/schema.prisma](prisma/schema.prisma). Full rationale: [PLAN.md](PLAN.md).

**Double-booking prevention** — two layers:
1. `SlotHold` — a 10-minute advisory reservation created the moment a patient picks a slot,
   before the symptom form is filled in. A partial unique index allows only one `ACTIVE` hold per
   `(doctorId, slotStart)`.
2. `Appointment` — the actual booking, and the real guarantee. A partial unique index allows only
   one non-cancelled appointment per `(doctorId, slotStart)`. Even if the hold layer is buggy or
   bypassed, Postgres physically cannot store two live appointments for the same slot. Both
   indexes are in [prisma/sql/partial_unique_indexes.sql](prisma/sql/partial_unique_indexes.sql)
   (Prisma's schema DSL can't express a filtered/partial unique index).

`POST /api/appointments/book` wraps the write in a transaction and catches the Postgres unique
violation (Prisma error `P2002`), returning a clean `409` instead of a `500` — see the inline
comments in [app/api/appointments/book/route.ts](app/api/appointments/book/route.ts).

**Doctor leave conflicts** — `DoctorLeave` doesn't touch `Appointment` directly. Filing leave
(`POST /api/doctor-leave`) enqueues a job; `workers/leaveConflictWorker.ts` scans for
`PENDING`/`CONFIRMED` appointments in the leave's date range, cancels each one, records it in
`AppointmentLeaveConflict` (an audit/join table), and queues a patient notification. The scan is
idempotent — safe to re-run without double-cancelling.

**LLM output storage** — `SymptomAnalysis` (pre-visit) and `VisitNote` (post-visit) each carry a
`status` (`PENDING`/`COMPLETED`/`FAILED`) and `errorMessage`, so a Gemini failure never blocks
booking or the post-visit flow — the UI falls back to raw text.

**Notifications & calendar** — `NotificationLog` and `CalendarEvent` are durable, retryable
records rather than fire-and-forget calls: every email attempt and every calendar sync attempt is
a row with its own status/attempts/lastError, processed by a background worker independently of
the request that triggered it.

## API docs

All routes are under `/api`. Auth is a JWT in an httpOnly `session` cookie (set by
`/api/auth/login` or `/api/auth/register`) or an `Authorization: Bearer <token>` header. Every
route enforces role-based access via `requireRole()` — see
[lib/auth.ts](lib/auth.ts).

### Auth

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/api/auth/register` | none (public) | `{ email, password, fullName, phone? }` | Patient self-registration only. Sets session cookie. |
| POST | `/api/auth/login` | none (public) | `{ email, password }` | Sets session cookie. |
| POST | `/api/auth/logout` | any | — | Clears session cookie. |

### Doctors

| Method | Path | Role | Body / Query | Notes |
|---|---|---|---|---|
| GET | `/api/doctors` | PATIENT, DOCTOR, ADMIN | `?specialisation=` | Directory search. |
| POST | `/api/doctors` | ADMIN | `{ email, password, specialisation, bio?, slotDurationMinutes?, workingHours?: [{weekday, startTime, endTime}] }` | Provisions a doctor account + profile in one call. |
| GET | `/api/doctors/[doctorId]/slots` | PATIENT, DOCTOR, ADMIN | `?date=YYYY-MM-DD` | Computed availability: working hours minus leave minus taken slots/holds. Returns `{ slots: string[] }` (ISO timestamps). |

### Appointments (booking flow)

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/api/appointments/hold` | PATIENT | `{ doctorId, slotStart }` | `201` → `{ hold: { id, slotStart, slotEnd, expiresAt } }`. `409` if the slot is already held. |
| POST | `/api/appointments/book` | PATIENT | `{ holdId, symptomText? }` | `201` → `{ appointment }`, status `CONFIRMED`. `410` if the hold expired, `409` if the slot was taken (the double-booking guard — see above). |
| POST | `/api/appointments/[id]/visit-notes` | DOCTOR (own appointment only) | `{ clinicalNotes, prescriptions?: [{medicationName, dosage, frequency, durationDays?, instructions?}] }` | Marks the appointment `COMPLETED`, schedules medication reminders, queues the post-visit LLM summary. |

### Doctor leave

| Method | Path | Role | Body / Query | Notes |
|---|---|---|---|---|
| POST | `/api/doctor-leave` | DOCTOR (self only), ADMIN (any doctor) | `{ doctorId?, startDate, endDate, reason? }` | `doctorId` required for ADMIN, ignored/must-match-own for DOCTOR. Queues conflict detection — see above. |
| GET | `/api/doctor-leave` | DOCTOR (own only), ADMIN | `?doctorId=` | Returns `{ leaves: DoctorLeave[] }`. |

### Google Calendar integration

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/integrations/google-calendar/authorize` | any authenticated | Redirects to Google's consent screen. |
| GET | `/api/integrations/google-calendar/callback` | none (Google redirects here) | Identity comes from a signed `state` param, not a session cookie. Persists tokens, redirects to `/settings/calendar`. |

Common error shape: `{ "error": "..." }` with a 4xx/5xx status. Row-level scoping (a patient only
sees their own appointments, a doctor only their own) is enforced server-side from the session,
never from a client-supplied id.

## Gemini LLM prompts

Implemented in [lib/llm/gemini.ts](lib/llm/gemini.ts), model `gemini-1.5-flash`. Both prompts
append a strict-JSON-only instruction to the base prompt from the requirements doc, and the
response is parsed/validated before being stored — a parse failure or API error is caught and
recorded as `status: FAILED` rather than thrown, so it never breaks booking or the visit flow.

**Pre-visit symptom analysis** (`generateSymptomAnalysis`, run when a patient submits symptoms at
booking time):

```
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor.
Symptoms: <symptomText>

Respond with ONLY a JSON object matching exactly this shape, no prose, no markdown fences:
{"urgencyLevel": "LOW" | "MEDIUM" | "HIGH", "chiefComplaint": string, "suggestedQuestions": [string, string, string]}
```

Stored on `SymptomAnalysis`, shown on the doctor's appointment detail page.

**Post-visit summary** (`generatePostVisitSummary`, run when a doctor submits clinical notes):

```
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps.
Notes: <clinicalNotes>

Respond with ONLY a JSON object matching exactly this shape, no prose, no markdown fences:
{"patientSummary": string, "followUpSteps": string}
```

Stored on `VisitNote`, shown on the patient's appointment detail page.

## Google Calendar OAuth setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create (or
   select) a project, then **APIs & Services → Library** → enable the **Google Calendar API**.
2. **APIs & Services → OAuth consent screen** — configure it (External is fine for testing; add
   your own Google account as a test user while the app is unverified).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type **Web
   application**. Add an authorized redirect URI matching `GOOGLE_REDIRECT_URI`, e.g.
   `http://localhost:3000/api/integrations/google-calendar/callback` for local dev (or your
   deployed domain's equivalent).
4. Copy the generated **Client ID** and **Client Secret** into `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.
5. A signed-in patient or doctor connects their calendar by visiting
   `/api/integrations/google-calendar/authorize`, which redirects to Google's consent screen and,
   on approval, stores the access/refresh token on `GoogleCalendarCredential`.
6. From then on, `workers/calendarSyncWorker.ts` creates/updates/deletes a Google Calendar event
   for that user on every booking, reschedule, and cancellation. A user who hasn't connected their
   calendar simply gets no sync — not an error.

## Background workers

`npm run workers` starts six BullMQ workers (`workers/index.ts`): notification sending, a
failed-notification retry sweep, calendar sync, LLM jobs (pre/post-visit), medication-reminder
sweep, and leave-conflict detection. This is a separate long-running Node process from the
Next.js app — see [Deployment](#deployment) for why it can't run on Vercel itself.

## Deployment

The Next.js app deploys to Vercel (see [vercel.json](vercel.json)) — Prisma Client is generated
as part of the build. **The background workers cannot run on Vercel**: BullMQ workers are a
long-running process, and Vercel's serverless functions are request-scoped and time out. Deploy
`npm run workers` separately as a long-running service (Railway, Render, Fly.io, a small VPS,
etc.), pointed at the same `DATABASE_URL` and `REDIS_URL` as the Vercel deployment. Use a managed
Postgres (Vercel Postgres, Supabase, Neon, Railway) and managed Redis (Upstash, Redis Cloud) — a
local Docker Postgres/Redis obviously isn't reachable from either.

Environment variables must be set in the Vercel project settings (and in whatever service runs
the workers) — `.env` is never deployed; only `.env.example` is committed.
