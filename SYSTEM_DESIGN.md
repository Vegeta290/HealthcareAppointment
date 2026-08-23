# System Design Write-Up: Healthcare Appointment & Follow-up Manager

**Submitted for:** Healthcare Appointment & Follow-up Manager — Project Evaluation
**Author:** [Student Name]
**Word count:** ~790

## 1. Introduction

This document describes the design decisions made to satisfy the four reliability
requirements identified as the primary evaluation criteria for this project: prevention
of double-booking, correct handling of doctor-leave conflicts, a slot-hold mechanism
for concurrent booking attempts, and graceful degradation when notification or LLM
services fail. The design is implemented in `prisma/schema.prisma` and referenced
throughout this write-up by model name.

## 2. Double-Booking Prevention

The core risk is two patients successfully reserving the same doctor at the same time.
Rather than rely on a single mechanism, the system enforces this guarantee at the
database layer, since application-level checks alone (e.g. "query for a conflict, then
insert") are inherently race-prone under concurrent requests: two requests can both pass
the availability check before either commits its write.

The `Appointment` table therefore carries a **partial unique index** on
`(doctorId, slotStart)`, restricted to rows whose status is `PENDING` or `CONFIRMED`:

```sql
CREATE UNIQUE INDEX appointment_live_slot_uq
  ON "Appointment" ("doctorId", "slotStart")
  WHERE "status" IN ('PENDING', 'CONFIRMED');
```

The `WHERE` clause is essential: without it, a cancelled appointment would permanently
occupy the slot and prevent any future booking. Because Prisma's schema DSL cannot
express filtered indexes, this index is added as raw SQL appended to the initial
migration (see `prisma/sql/partial_unique_indexes.sql`), applied in the same
transaction as table creation.

With this constraint in place, the booking write is wrapped in a database transaction.
If two concurrent requests attempt to insert an `Appointment` for the same doctor and
slot, Postgres allows exactly one to succeed; the second raises a unique-constraint
violation, which the application layer catches and translates into a
"slot no longer available" response rather than a server error. This makes the database
itself the final arbiter of correctness, independent of any race condition in the
request-handling code above it.

Slot times are always generated from the doctor's configured `slotDurationMinutes`
(stored on `DoctorProfile`) rather than accepted as arbitrary input, so conflict
detection reduces to equality comparison on a single `slotStart` timestamp instead of
a more complex interval-overlap check.

## 3. Slot Hold Mechanism

The unique-index guarantee above only fires at the moment of final booking. Without an
earlier signal, two patients could both fill out the multi-step symptom form for the
same slot and only discover the conflict at the last step — a poor user experience even
though data integrity is preserved.

To address this, the `SlotHold` model reserves a slot the moment a patient selects it,
before the symptom form is completed. It carries a `status` (`ACTIVE`, `EXPIRED`,
`CONVERTED`, `RELEASED`) and an `expiresAt` timestamp set ten minutes from creation. A
second partial unique index, `slothold_active_slot_uq` on `(doctorId, slotStart)` where
`status = 'ACTIVE'`, prevents two active holds on the same slot, giving immediate
feedback to the second patient rather than a failure at final submission. A background
sweeper transitions holds past `expiresAt` to `EXPIRED`, freeing the slot; on successful
booking, the hold transitions to `CONVERTED` and is linked to the resulting
`Appointment` via `convertedAppointmentId`.

Critically, the hold is treated as **advisory**, not authoritative — it improves user
experience but is not the source of truth. The `Appointment` table's own unique index
remains the enforced guarantee, so a bug or bypass in the hold logic cannot result in an
actual double-booking.

## 4. Doctor Leave Conflict Handling

When an admin or doctor records leave via `DoctorLeave` (a date range with `status`
`ACTIVE`), the write path checks for existing `PENDING`/`CONFIRMED` appointments falling
within that range. Each affected appointment is recorded in
`AppointmentLeaveConflict`, a join/audit table linking the leave and the appointment,
with fields tracking notification outcome (`notifiedAt`, `notificationFailedAt`,
`notificationAttempts`). Keeping this as a separate table — rather than adding
leave-specific columns to `Appointment` — keeps the hot booking table lean and gives the
notification job a durable, retryable queue of exactly which patients still need to be
informed, independent of the leave record's own lifecycle.

## 5. Notification and LLM Failure Handling

Both external dependencies (email delivery, LLM calls) are treated as unreliable by
design. `NotificationLog` records every send attempt with a `status`
(`PENDING`/`SENT`/`FAILED`/`RETRYING`), an `attempts` counter, and `lastError`, allowing
a background job to retry failed sends without re-triggering the original business
event. LLM outputs (`SymptomAnalysis`, `VisitNote`) use the same pattern: a
`status`/`errorMessage`/`attempts` triad means a failed pre-visit or post-visit summary
never blocks the appointment itself — the UI falls back to the doctor's or patient's raw
input while the summary is marked `FAILED` and can be retried, satisfying the
requirement that LLM failures must not break the system.
