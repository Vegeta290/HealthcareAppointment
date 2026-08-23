# Healthcare Appointment Platform — Database Schema Proposal

Status: **DRAFT — awaiting review**
Scope of this pass: Prisma schema for `Appointment`, `DoctorLeave`, `SlotHold`, plus the minimum
supporting models (`User`, `DoctorProfile`, `PatientProfile`) needed for these three to make sense
and for role-based access control to be enforceable. No frontend code included per instructions.
Other models implied by the requirements doc (symptom summaries, prescriptions, notifications,
calendar sync, medication reminders) are stubbed at the bottom as placeholders only, to be fleshed
out in a later pass.

---

## 1. Concurrency strategy (why the schema looks like this)

Double-booking has two race windows to close:

1. **Booking-flow race**: two patients open the same slot at the same time and both reach the
   "confirm" step before either commits.
2. **Write race**: two confirmed writes hit the same slot at the same instant (e.g. two tabs, or a
   retried request).

This schema closes both with **two independent guards**, not one:

- **`SlotHold`** — a short-lived reservation (TTL, e.g. 5–10 minutes) created the moment a patient
  selects a slot and starts the symptom form, *before* the appointment is confirmed. A partial
  unique index allows only one `ACTIVE` hold per `(doctorId, slotStart)`. This gives good UX (fast
  "this slot is taken" feedback) but is **not** the source of truth for booking — it's advisory.
- **`Appointment`** — the actual booking. A partial unique index allows only one
  non-cancelled appointment per `(doctorId, slotStart)`. This is the **hard guarantee**: even if the
  hold layer has a bug, expires early, or is bypassed, the database itself physically cannot store
  two live appointments for the same doctor/slot. The insert is wrapped in a transaction; a unique
  violation is caught and surfaced to the client as "slot no longer available," not a 500.

Both guards use **partial unique indexes** (`WHERE status IN (...)`) rather than a plain
`@@unique`, because a cancelled appointment or expired hold must free the slot for reuse. Prisma's
schema DSL doesn't express partial/filtered unique indexes directly, so those two indexes are added
via a raw-SQL migration step (noted inline below) after `prisma migrate dev` generates the base
table — this is called out explicitly so it isn't missed during implementation.

Slot times are always aligned to the doctor's configured `slotDurationMinutes` and stored as an
exact `startTime`/`endTime` pair (not just a start), so overlap checks reduce to equality on
`startTime` rather than needing a range-overlap exclusion constraint — simpler and index-friendly,
valid as long as all bookings go through the slot-generation logic (never arbitrary free-text
times).

`DoctorLeave` doesn't need its own concurrency guard (leave is admin/doctor-only, low contention),
but it's the thing `Appointment` and `SlotHold` creation must check against: no hold or booking may
be created for a `(doctorId, date)` that falls inside an active leave row.

---

## 2. Enums

```prisma
enum Role {
  PATIENT
  DOCTOR
  ADMIN
}

enum AppointmentStatus {
  PENDING     // created, awaiting doctor/system confirmation (if applicable)
  CONFIRMED   // active, holds the slot
  CANCELLED   // slot freed
  COMPLETED   // visit happened
  NO_SHOW     // slot freed, tracked for record
}

enum SlotHoldStatus {
  ACTIVE      // currently blocking the slot
  EXPIRED     // TTL passed, never converted
  CONVERTED   // turned into a real Appointment
  RELEASED    // patient backed out / abandoned the flow
}

enum LeaveStatus {
  ACTIVE
  CANCELLED   // admin/doctor reverted the leave
}
```

---

## 3. Core identity & RBAC

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  role          Role
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  doctorProfile   DoctorProfile?
  patientProfile  PatientProfile?

  @@index([role])
}
```

RBAC enforcement notes (application layer, not just schema):

- `role` is set once at signup and is **not** user-editable via any patient/doctor-facing endpoint —
  only an `ADMIN`-scoped route may change it (e.g. promoting staff), and that action should be
  audit-logged.
- Every API route derives its authorization scope from the authenticated `User.role` server-side
  (session/JWT claim), never from a client-supplied role field.
- Row-level scoping: a `PATIENT` may only read/write `Appointment`/`SlotHold` rows where
  `patientId == session.userId`; a `DOCTOR` only rows where `doctorId == session.doctorProfile.id`;
  `ADMIN` has full read, and write access limited to `DoctorProfile`, `DoctorLeave`, and
  moderation actions (not fabricating appointments on a patient's behalf).

```prisma
model DoctorProfile {
  id                   String   @id @default(cuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  specialisation       String
  bio                  String?
  slotDurationMinutes  Int      @default(30)

  workingHours         DoctorWorkingHours[]
  leaves               DoctorLeave[]
  appointments         Appointment[]
  slotHolds            SlotHold[]

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@index([specialisation])
}

// One row per weekday the doctor works, e.g. MON 09:00–17:00.
// Kept separate from DoctorProfile so hours can vary per day.
model DoctorWorkingHours {
  id            String        @id @default(cuid())
  doctorId      String
  doctor        DoctorProfile @relation(fields: [doctorId], references: [id], onDelete: Cascade)

  weekday       Int           // 0 = Sunday .. 6 = Saturday
  startTime     String        // "09:00" (local clinic time, stored as HH:mm)
  endTime       String        // "17:00"

  @@unique([doctorId, weekday])
}

model PatientProfile {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  fullName      String
  dateOfBirth   DateTime?
  phone         String?

  appointments  Appointment[]
  slotHolds     SlotHold[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

---

## 4. The three focus models

```prisma
model SlotHold {
  id            String         @id @default(cuid())

  doctorId      String
  doctor        DoctorProfile  @relation(fields: [doctorId], references: [id], onDelete: Cascade)

  patientId     String
  patient       PatientProfile @relation(fields: [patientId], references: [id], onDelete: Cascade)

  slotStart     DateTime       // exact appointment start, UTC
  slotEnd       DateTime       // = slotStart + doctor.slotDurationMinutes, denormalised for fast reads

  status        SlotHoldStatus @default(ACTIVE)
  expiresAt     DateTime       // slotStart selection time + hold TTL (e.g. now() + 10 min)

  convertedAppointmentId String?     @unique
  convertedAppointment   Appointment? @relation(fields: [convertedAppointmentId], references: [id])

  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  // One ACTIVE hold per doctor/slot — added as a raw-SQL partial unique index
  // in migration (see §5), Prisma DSL can't express the WHERE clause:
  //   CREATE UNIQUE INDEX slothold_active_slot_uq
  //     ON "SlotHold" ("doctorId", "slotStart")
  //     WHERE "status" = 'ACTIVE';

  @@index([doctorId, slotStart])
  @@index([expiresAt])   // for the background sweeper that flips ACTIVE -> EXPIRED
  @@index([patientId])
}

model Appointment {
  id            String             @id @default(cuid())

  doctorId      String
  doctor        DoctorProfile      @relation(fields: [doctorId], references: [id], onDelete: Restrict)

  patientId     String
  patient       PatientProfile     @relation(fields: [patientId], references: [id], onDelete: Restrict)

  slotStart     DateTime           // exact start, UTC
  slotEnd       DateTime

  status        AppointmentStatus  @default(PENDING)

  // Pre-visit intake
  symptomText       String?
  symptomSubmittedAt DateTime?

  // Cancellation / reschedule audit trail
  cancelledAt       DateTime?
  cancelledBy       String?        // userId of the actor (patient, doctor, or admin via leave conflict)
  cancellationReason String?

  rescheduledFromId String?        @unique
  rescheduledFrom   Appointment?   @relation("Reschedule", fields: [rescheduledFromId], references: [id])
  rescheduledTo     Appointment?   @relation("Reschedule")

  originatingHold   SlotHold?

  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  // One live (non-cancelled) appointment per doctor/slot — raw-SQL partial
  // unique index added in migration (see §5):
  //   CREATE UNIQUE INDEX appointment_live_slot_uq
  //     ON "Appointment" ("doctorId", "slotStart")
  //     WHERE "status" IN ('PENDING', 'CONFIRMED');

  @@index([doctorId, slotStart])
  @@index([patientId, slotStart])
  @@index([status])
}

model DoctorLeave {
  id            String         @id @default(cuid())

  doctorId      String
  doctor        DoctorProfile  @relation(fields: [doctorId], references: [id], onDelete: Cascade)

  startDate     DateTime       // inclusive, date-only (00:00 UTC)
  endDate       DateTime       // inclusive, date-only

  reason        String?
  status        LeaveStatus    @default(ACTIVE)

  createdById   String         // userId of admin or doctor who filed it
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  // Appointments displaced by this leave being filed, for the notification job to
  // read on retry / for audit ("who was told, when"). Populated by app logic when
  // a leave is created over a date range with existing CONFIRMED appointments.
  displacedAppointments AppointmentLeaveConflict[]

  @@index([doctorId, startDate, endDate])
  @@index([status])
}

// Join/audit table: which appointments were caught by which leave, and whether
// the patient notification succeeded. Kept separate from Appointment so leave
// conflicts don't require adding leave-specific columns to the hot Appointment table.
model AppointmentLeaveConflict {
  id              String       @id @default(cuid())

  leaveId         String
  leave           DoctorLeave  @relation(fields: [leaveId], references: [id], onDelete: Cascade)

  appointmentId   String
  appointment     Appointment  @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  notifiedAt      DateTime?
  notificationFailedAt DateTime?
  notificationAttempts Int     @default(0)

  createdAt       DateTime     @default(now())

  @@unique([leaveId, appointmentId])
}
```

Add the reverse relation field on `Appointment` for the conflict join table:

```prisma
model Appointment {
  // ...fields above...
  leaveConflicts  AppointmentLeaveConflict[]
}
```

---

## 5. Migration notes (raw SQL required alongside `prisma migrate dev`)

Prisma's schema DSL cannot express filtered/partial unique indexes, so after generating the base
migration, append:

```sql
CREATE UNIQUE INDEX slothold_active_slot_uq
  ON "SlotHold" ("doctorId", "slotStart")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX appointment_live_slot_uq
  ON "Appointment" ("doctorId", "slotStart")
  WHERE "status" IN ('PENDING', 'CONFIRMED');
```

Application code must catch the resulting Postgres unique-violation error (`P2010`/`23505` via
Prisma) on both hold creation and appointment confirmation and translate it into a clean
"slot no longer available, please pick another" response — this is the actual double-booking
prevention mechanism, the index is just what makes it airtight under concurrent writes.

---

## 6. Stubbed models (referenced by the requirements doc, not detailed in this pass)

Present only as forward-looking placeholders so relation names above stay valid; will be fully
designed in a follow-up pass:

- `SymptomAnalysis` (LLM pre-visit output: urgency, chief complaint, suggested questions) — 1:1 with `Appointment`
- `VisitNote` / `Prescription` (doctor's post-visit notes + LLM patient-friendly summary) — 1:1 with `Appointment`
- `MedicationReminder` (derived from `Prescription` frequency, background job target)
- `NotificationLog` (email send attempts/retries for confirmation, reminder, cancellation)
- `CalendarEvent` (Google Calendar event id + OAuth token refs, per appointment per party)

---

## Open questions for you

1. **Hold TTL**: is 10 minutes reasonable, or should it be configurable per clinic?
2. **Reschedule modeling**: I modeled reschedule as cancel-old + create-new linked via
   `rescheduledFromId`/`rescheduledTo`, rather than mutating `slotStart` in place — keeps the audit
   trail and notification history clean. Confirm this matches intent.
3. **Leave granularity**: `DoctorLeave` is date-range (whole days). If doctors need partial-day
   leave (e.g. leave only 2pm–5pm), the model needs `startTime`/`endTime` fields added.
4. Should `Appointment.slotEnd` truly be denormalised (computed from `slotStart +
   doctor.slotDurationMinutes` at write time), or would you rather it always be derived at read
   time to avoid drift if `slotDurationMinutes` changes later? I defaulted to denormalised for
   simpler indexing/notification-window queries.

Once you confirm direction, next step is the full `schema.prisma` file plus the stubbed models,
followed by the system design write-up.
