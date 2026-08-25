# Healthcare Appointment & Follow-up Manager

A clinic appointment platform with separate patient, doctor, and admin portals: symptom-aware
booking with race-safe double-booking prevention, AI pre-visit and post-visit summaries, doctor
leave conflict handling (filed by the doctor themselves or an admin), patient-initiated
rescheduling, and email + Google Calendar notifications.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for the write-up on concurrency, leave conflicts, and
failure handling, and [Database schema logic](#database-schema-logic) below for the schema
rationale.

## Contents

- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database schema logic](#database-schema-logic)
- [API docs](#api-docs)
- [Gemini LLM prompts](#gemini-llm-prompts)
- [Google Calendar OAuth setup](#google-calendar-oauth-setup)
- [Display timezone](#display-timezone)
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

Seed one Admin, three Doctors (Cardiology, General Practice, Dermatology — each with real names
and Mon–Fri working hours), and one Patient account (all password `ChangeMe123!`):

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

1. `/register` → create a patient account (name, email, password, optional phone/date of birth).
2. Log in as the seeded admin (`admin@clinic.test`) → `/admin/doctors` → add a doctor + working
   hours (or use one of the three seeded doctors).
3. Log in as the patient → `/patient/doctors` → book a slot → submit symptoms.
4. Log in as that doctor → `/doctor/schedule` → open the appointment → see the AI pre-visit
   summary (requires `GEMINI_API_KEY` and the `workers` process running). If it's stuck or failed,
   use the **Retry/Regenerate AI summary** button on that page. → submit clinical notes +
   prescription.
5. Back as the patient → the appointment detail page shows the post-visit summary once the LLM
   job completes → try **Reschedule** on a pending/confirmed appointment to pick a new slot.
6. As the doctor → `/doctor/leave` → file leave for yourself (no admin needed) covering a date
   with a booked appointment → confirm it auto-cancels within a few seconds and the patient is
   notified.
7. Either role → `/settings/calendar` → connect Google Calendar (see
   [OAuth setup](#google-calendar-oauth-setup)) and confirm new bookings sync as events.

## Environment variables

All defined with placeholders in [.env.example](.env.example). **Never commit a real `.env`** —
`.gitignore` excludes it.

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Postgres connection string. If using a pooled connection (e.g. Supabase's pgbouncer URL), Prisma migrations need `DIRECT_URL` too |
| `DIRECT_URL` | Migrations against a pooled DB | A non-pooled direct connection string. Only needed if `DATABASE_URL` goes through a connection pooler; omit otherwise |
| `JWT_SECRET` | Everything | Signs session cookies and the short-lived Google OAuth `state` token. Generate with `openssl rand -base64 48` |
| `GEMINI_API_KEY` | Pre/post-visit AI summaries | From [Google AI Studio](https://aistudio.google.com/apikey). Without it, LLM jobs fail gracefully (`SymptomAnalysis`/`VisitNote` status `FAILED`, UI falls back to raw text). See [Gemini LLM prompts](#gemini-llm-prompts) for a note on model naming — Google retires model versions periodically |
| `REDIS_URL` | Background jobs | BullMQ connection. Without it, booking still works but no notifications/reminders/calendar sync ever fire |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Email delivery | Nodemailer transport, consumed only by the **worker** process (`workers/notificationWorker.ts`) — setting these on Vercel does nothing, they must be set wherever `npm run workers` actually runs. For real sends without owning a domain, Gmail SMTP with an [App Password](https://myaccount.google.com/apppasswords) works well; `SMTP_FROM` must match `SMTP_USER` exactly for Gmail |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Calendar sync | See [Google Calendar OAuth setup](#google-calendar-oauth-setup). Needed on **both** the web app and the worker (the worker's calendar-sync code shares the same OAuth client construction) — `GOOGLE_REDIRECT_URI` must be identical in both places and must point at the **web app's** domain, since that's the only place with an actual callback route |
| `APP_BASE_URL` | Calendar sync | Used to build the redirect target after the Google consent screen. `http://localhost:3000` locally |
| `PORT` | Render/Fly deploys only | Set automatically by the platform; `workers/keepAliveServer.ts` opens a tiny HTTP health-check endpoint on it if present, otherwise stays inert. Don't set this locally |

## Database schema logic

Full schema: [prisma/schema.prisma](prisma/schema.prisma).

**Double-booking prevention** — two layers:
1. `SlotHold` — a 10-minute advisory reservation created the moment a patient picks a slot,
   before the symptom form is filled in. A partial unique index allows only one `ACTIVE` hold per
   `(doctorId, slotStart)`.
2. `Appointment` — the actual booking, and the real guarantee. A partial unique index allows only
   one non-cancelled appointment per `(doctorId, slotStart)`. Even if the hold layer is buggy or
   bypassed, Postgres physically cannot store two live appointments for the same slot. Both
   indexes are in [prisma/sql/partial_unique_indexes.sql](prisma/sql/partial_unique_indexes.sql)
   (Prisma's schema DSL can't express a filtered/partial unique index).

`POST /api/appointments/book` (and `.../reschedule`, which reuses the same guard) wraps the write
in a transaction and catches the Postgres unique violation (Prisma error `P2002`), returning a
clean `409` instead of a `500` — see the inline comments in
[app/api/appointments/book/route.ts](app/api/appointments/book/route.ts).

**Reschedule** — modeled as cancel-old + create-new (linked via `Appointment.rescheduledFromId`)
rather than mutating `slotStart` in place, so the audit trail and notification history stay
intact. See [app/api/appointments/[id]/reschedule/route.ts](<app/api/appointments/[id]/reschedule/route.ts>).

**Doctor leave conflicts** — `DoctorLeave` doesn't touch `Appointment` directly. Filing leave
(`POST /api/doctor-leave` — a doctor may file for themselves, an admin for any doctor) enqueues a
job; `workers/leaveConflictWorker.ts` scans for `PENDING`/`CONFIRMED` appointments in the leave's
date range, cancels each one, records it in `AppointmentLeaveConflict` (an audit/join table), and
queues a patient notification. The scan is idempotent — safe to re-run without double-cancelling.

**LLM output storage** — `SymptomAnalysis` (pre-visit) and `VisitNote` (post-visit) each carry a
`status` (`PENDING`/`COMPLETED`/`FAILED`) and `errorMessage`, so a Gemini failure never blocks
booking or the post-visit flow — the UI falls back to raw text, and a doctor can manually
re-trigger either one via `POST /api/appointments/[id]/regenerate-summary`.

**Notifications & calendar** — `NotificationLog` and `CalendarEvent` are durable, retryable
records rather than fire-and-forget calls: every email attempt and every calendar sync attempt is
a row with its own status/attempts/lastError, processed by a background worker independently of
the request that triggered it.

**Doctor display names** — `DoctorProfile.fullName` is nullable (doctors created before this
field existed have no value) with display code falling back to their account email (see
[lib/doctors.ts](lib/doctors.ts)). Admins can backfill an existing doctor's name inline from
`/admin/doctors`, or new doctors set it at creation time.

## API docs

All routes are under `/api`. Auth is a JWT in an httpOnly `session` cookie (set by
`/api/auth/login` or `/api/auth/register`) or an `Authorization: Bearer <token>` header. Every
route enforces role-based access via `requireRole()` — see
[lib/auth.ts](lib/auth.ts).

### Auth

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/api/auth/register` | none (public) | `{ email, password, fullName, phone?, dateOfBirth? }` | Patient self-registration only. Sets session cookie. |
| POST | `/api/auth/login` | none (public) | `{ email, password }` | Sets session cookie. |
| POST | `/api/auth/logout` | any | — | Clears session cookie. |

### Doctors

| Method | Path | Role | Body / Query | Notes |
|---|---|---|---|---|
| GET | `/api/doctors` | PATIENT, DOCTOR, ADMIN | `?specialisation=` | Directory search. |
| POST | `/api/doctors` | ADMIN | `{ fullName, email, password, specialisation, bio?, slotDurationMinutes?, workingHours?: [{weekday, startTime, endTime}] }` | Provisions a doctor account + profile in one call. |
| PATCH | `/api/doctors/[doctorId]` | ADMIN | `{ fullName }` | Backfills/updates a doctor's display name — used by the inline "Edit name" control on `/admin/doctors`. |
| GET | `/api/doctors/[doctorId]/slots` | PATIENT, DOCTOR, ADMIN | `?date=YYYY-MM-DD` | Computed availability: working hours minus leave minus taken slots/holds. Returns `{ slots: string[] }` (ISO timestamps, UTC). |

### Appointments (booking flow)

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/api/appointments/hold` | PATIENT | `{ doctorId, slotStart }` | `201` → `{ hold: { id, slotStart, slotEnd, expiresAt } }`. `409` if the slot is already held. |
| POST | `/api/appointments/book` | PATIENT | `{ holdId, symptomText? }` | `201` → `{ appointment }`, status `CONFIRMED`. `410` if the hold expired, `409` if the slot was taken (the double-booking guard — see above). |
| POST | `/api/appointments/[id]/reschedule` | PATIENT (own appointment) | `{ holdId }` | Hold must be for the **same doctor** as the original appointment. `201` → `{ appointment }` (the new one, linked via `rescheduledFromId`); the original is cancelled. Same `410`/`409` semantics as `.../book`. |
| POST | `/api/appointments/[id]/visit-notes` | DOCTOR (own appointment only) | `{ clinicalNotes, prescriptions?: [{medicationName, dosage, frequency, durationDays?, instructions?}] }` | Marks the appointment `COMPLETED`, schedules medication reminders, queues the post-visit LLM summary. |
| POST | `/api/appointments/[id]/regenerate-summary` | DOCTOR (own appointment only) | `{ type: "PRE_VISIT" \| "POST_VISIT" }` | Manually re-triggers the corresponding LLM job — for when it's stuck `PENDING` (no worker was running at the time) or `FAILED`. |

### Doctor leave

| Method | Path | Role | Body / Query | Notes |
|---|---|---|---|---|
| POST | `/api/doctor-leave` | DOCTOR (self only), ADMIN (any doctor) | `{ doctorId?, startDate, endDate, reason? }` | `doctorId` required for ADMIN, ignored/must-match-own for DOCTOR. Queues conflict detection — see above. Reachable from `/doctor/leave` (doctor-filed) or `/admin/doctors/[doctorId]/leave` (admin-filed). |
| GET | `/api/doctor-leave` | DOCTOR (own only), ADMIN | `?doctorId=` | Returns `{ leaves: DoctorLeave[] }`. |

### Google Calendar integration

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/integrations/google-calendar/authorize` | any authenticated | Redirects to Google's consent screen. Reachable from `/settings/calendar`. |
| GET | `/api/integrations/google-calendar/callback` | none (Google redirects here) | Identity comes from a signed `state` param, not a session cookie. Persists tokens, redirects to `/settings/calendar?status=connected`. |
| POST | `/api/integrations/google-calendar/disconnect` | any authenticated | Deletes the caller's stored `GoogleCalendarCredential`. Does not revoke the token with Google — that's the user's job in their Google account settings, if desired. |

Common error shape: `{ "error": "..." }` with a 4xx/5xx status. Row-level scoping (a patient only
sees their own appointments, a doctor only their own) is enforced server-side from the session,
never from a client-supplied id.

## Gemini LLM prompts

Implemented in [lib/llm/gemini.ts](lib/llm/gemini.ts). Both prompts append a strict-JSON-only
instruction to the base prompt from the requirements doc, and the response is parsed/validated
before being stored — a parse failure or API error is caught and recorded as `status: FAILED`
rather than thrown, so it never breaks booking or the visit flow.

**A note on the model name**: Google periodically retires specific Gemini model versions.
`gemini-1.5-flash` (the original choice) returned a hard `404` when this was tested; the
currently-pinned model is `gemini-3.6-flash`, found by querying
`https://generativelanguage.googleapis.com/v1beta/models?key=<GEMINI_API_KEY>` for what's actually
available to your key and following Google's own "use X instead" hint in the 404 error body. If
summaries start failing with a 404, that endpoint is the fastest way to find the current model
name and update `MODEL_NAME` in `lib/llm/gemini.ts`.

**Pre-visit symptom analysis** (`generateSymptomAnalysis`, run when a patient submits symptoms at
booking time, or re-run via `POST /api/appointments/[id]/regenerate-summary`):

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
   your own Google account as a test user while the app is unverified — an unverified app can only
   be used by accounts explicitly added as test users).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type **Web
   application**. Add an authorized redirect URI matching `GOOGLE_REDIRECT_URI` exactly (no
   trailing slash or extra characters), e.g.
   `http://localhost:3000/api/integrations/google-calendar/callback` for local dev, or your
   deployed **web app's** domain for production — this route only exists on the Next.js app, never
   on the worker service, so use that domain even when setting `GOOGLE_REDIRECT_URI` on the worker
   host too.
4. Copy the generated **Client ID** and **Client Secret** into `.env` as `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` — and into whatever hosts the worker process, since its calendar-sync
   code shares the same OAuth client construction.
5. A signed-in patient or doctor connects their calendar from **`/settings/calendar`** (linked
   from both the patient and doctor nav bars), which redirects to Google's consent screen and, on
   approval, stores the access/refresh token on `GoogleCalendarCredential`. The same page shows
   connection status and lets them disconnect.
6. From then on, `workers/calendarSyncWorker.ts` creates/updates/deletes a Google Calendar event
   for that user on every booking, reschedule, and cancellation. A user who hasn't connected their
   calendar simply gets no sync — not an error.

## Display timezone

All timestamps are stored in the database as UTC. Display formatting is
centralized in [lib/dateTime.ts](lib/dateTime.ts), currently hardcoded to **India Standard Time**
(`Asia/Kolkata`) — every page imports its formatters from there rather than each having its own
ad-hoc `toLocaleString` call, so changing the displayed timezone only requires editing
`DISPLAY_TIME_ZONE` in that one file.

**Known limitation**: `DoctorWorkingHours.startTime`/`endTime` ("09:00"–"17:00") are still
interpreted as UTC when generating bookable slots (`lib/scheduling.ts`), not IST. If a doctor's
hours are meant to represent their local (IST) working hours, slot generation needs a
corresponding fix — not yet made, since it changes booking behavior rather than just display.

## Background workers

`npm run workers` starts six BullMQ workers (`workers/index.ts`): notification sending, a
failed-notification retry sweep, calendar sync, LLM jobs (pre/post-visit), medication-reminder
sweep, and leave-conflict detection. This is a separate long-running Node process from the
Next.js app — see [Deployment](#deployment) for why it can't run on Vercel itself.

`workers/keepAliveServer.ts` optionally opens a tiny HTTP endpoint (only if a `PORT` env var is
present) that responds `200` to any request — purely so the worker process can run as a **free**
Render Web Service (see [Deployment](#deployment)); it has no relation to the actual job
processing.

## Deployment

The Next.js app deploys to Vercel (see [vercel.json](vercel.json)) — Prisma Client is generated
as part of the build. **The background workers cannot run on Vercel**: BullMQ workers are a
long-running process, and Vercel's serverless functions are request-scoped and time out. Use a
managed Postgres (Supabase, Neon, Vercel Postgres, Railway) and managed Redis (Upstash, Redis
Cloud) — a local Docker Postgres/Redis obviously isn't reachable from either host below.

### Running the workers persistently — two options

**Render, free tier, no credit card** (recommended if you don't want to pay): Render's free tier
only exists for their "Web Service" type — the "Background Worker" type requires a paid plan.
[render.yaml](render.yaml) works around this by deploying the worker *as* a free Web Service,
relying on `workers/keepAliveServer.ts` to give it something to respond to a health check with.
Render's free tier sleeps a service after 15 minutes with no HTTP traffic, so this only stays
running continuously if something pings it more often than that — set up a free external cron
pinger (e.g. [cron-job.org](https://cron-job.org)) hitting the deployed service's URL every ~10
minutes. Deploy via Render dashboard → **New → Blueprint** → point at this repo → it reads
`render.yaml` and prompts for each env var.

**Fly.io** (no free tier without a card as of writing, but a small worker like this fits well
within their paid usage-based pricing): [fly.toml](fly.toml) + [Dockerfile.workers](Dockerfile.workers)
build and run just the worker process, with no HTTP service block (it doesn't need one — Fly
doesn't require a service to answer HTTP to stay running, unlike Render's free tier). See the
comments at the top of `fly.toml` for the exact `flyctl` commands.

Either way, apply pending Prisma migrations to the production database separately —
`prisma migrate deploy` (Vercel's build only runs `prisma generate`, not `migrate deploy`) — and
remember the partial unique indexes need to be appended to the migration file by hand (see
[Local setup](#local-setup)) before they're ever applied anywhere, including production.

Environment variables must be set in the Vercel project settings **and** in whatever service runs
the workers (they're separate deployments with separate env var stores) — `.env` is never
deployed; only `.env.example` is committed.
