-- Partial unique indexes for double-booking prevention.
--
-- WHY THIS FILE EXISTS SEPARATELY: Prisma's schema DSL (`@@unique`) cannot express a
-- filtered/partial index (a `WHERE` clause on the index). These two indexes are the
-- actual hard guarantee against double-booking described in PLAN.md §1 and in the
-- inline comments on SlotHold / Appointment in prisma/schema.prisma — everything else
-- (SlotHold TTLs, app-level slot-availability checks) is advisory UX on top of these.
--
-- HOW TO APPLY:
--   1. Run `npx prisma migrate dev --name init` against a real database. Prisma will
--      generate prisma/migrations/<timestamp>_init/migration.sql from schema.prisma.
--   2. Append the two CREATE UNIQUE INDEX statements below to the bottom of that
--      generated migration.sql file (do NOT create a second separate migration for
--      them — they must land in the same transaction as the table creation, or there
--      is a window between steps where concurrent inserts aren't guarded).
--   3. Re-run `npx prisma migrate dev` (or `prisma migrate deploy` in CI/prod) to
--      apply. Prisma will not touch these indexes on subsequent `migrate dev` runs
--      because they're outside what schema.prisma can express — any future schema
--      change that alters SlotHold/Appointment should double check these indexes
--      weren't dropped by a generated migration.

-- One ACTIVE hold per (doctorId, slotStart). EXPIRED/RELEASED/CONVERTED holds are
-- excluded so the slot frees up once a hold lapses or converts.
CREATE UNIQUE INDEX slothold_active_slot_uq
  ON "SlotHold" ("doctorId", "slotStart")
  WHERE "status" = 'ACTIVE';

-- One live (non-cancelled) appointment per (doctorId, slotStart). CANCELLED rows are
-- excluded so a freed slot can be rebooked; COMPLETED/NO_SHOW are historical and
-- shouldn't occur at a future slotStart in practice, but are excluded too since they
-- represent a slot that already happened, not a live claim on it.
CREATE UNIQUE INDEX appointment_live_slot_uq
  ON "Appointment" ("doctorId", "slotStart")
  WHERE "status" IN ('PENDING', 'CONFIRMED');

-- Down-migration reference, for a manually written `down.sql` if the project adopts
-- reversible migrations:
--
-- DROP INDEX IF EXISTS slothold_active_slot_uq;
-- DROP INDEX IF EXISTS appointment_live_slot_uq;
