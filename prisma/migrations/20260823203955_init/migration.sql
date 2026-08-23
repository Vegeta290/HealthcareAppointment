-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SlotHoldStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LlmJobStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'APPOINTMENT_REMINDER', 'CANCELLATION', 'LEAVE_CONFLICT', 'MEDICATION_REMINDER', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "CalendarEventStatus" AS ENUM ('PENDING', 'CREATED', 'UPDATED', 'DELETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialisation" TEXT NOT NULL,
    "bio" TEXT,
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorWorkingHours" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "DoctorWorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "status" "SlotHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "convertedAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "symptomText" TEXT,
    "symptomSubmittedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancellationReason" TEXT,
    "rescheduledFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorLeave" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorLeave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentLeaveConflict" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "notificationFailedAt" TIMESTAMP(3),
    "notificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentLeaveConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymptomAnalysis" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "LlmJobStatus" NOT NULL DEFAULT 'PENDING',
    "urgencyLevel" "UrgencyLevel",
    "chiefComplaint" TEXT,
    "suggestedQuestions" TEXT[],
    "rawModelResponse" JSONB,
    "model" TEXT,
    "promptVersion" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SymptomAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitNote" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "clinicalNotes" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LlmJobStatus" NOT NULL DEFAULT 'PENDING',
    "patientSummary" TEXT,
    "followUpSteps" TEXT,
    "rawModelResponse" JSONB,
    "model" TEXT,
    "promptVersion" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationReminder" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT,
    "recipientUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "googleEventId" TEXT,
    "calendarId" TEXT,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE INDEX "DoctorProfile_specialisation_idx" ON "DoctorProfile"("specialisation");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorWorkingHours_doctorId_weekday_key" ON "DoctorWorkingHours"("doctorId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotHold_convertedAppointmentId_key" ON "SlotHold"("convertedAppointmentId");

-- CreateIndex
CREATE INDEX "SlotHold_doctorId_slotStart_idx" ON "SlotHold"("doctorId", "slotStart");

-- CreateIndex
CREATE INDEX "SlotHold_expiresAt_idx" ON "SlotHold"("expiresAt");

-- CreateIndex
CREATE INDEX "SlotHold_patientId_idx" ON "SlotHold"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_rescheduledFromId_key" ON "Appointment"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_slotStart_idx" ON "Appointment"("doctorId", "slotStart");

-- CreateIndex
CREATE INDEX "Appointment_patientId_slotStart_idx" ON "Appointment"("patientId", "slotStart");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "DoctorLeave_doctorId_startDate_endDate_idx" ON "DoctorLeave"("doctorId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "DoctorLeave_status_idx" ON "DoctorLeave"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentLeaveConflict_leaveId_appointmentId_key" ON "AppointmentLeaveConflict"("leaveId", "appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SymptomAnalysis_appointmentId_key" ON "SymptomAnalysis"("appointmentId");

-- CreateIndex
CREATE INDEX "SymptomAnalysis_status_idx" ON "SymptomAnalysis"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VisitNote_appointmentId_key" ON "VisitNote"("appointmentId");

-- CreateIndex
CREATE INDEX "VisitNote_status_idx" ON "VisitNote"("status");

-- CreateIndex
CREATE INDEX "Prescription_appointmentId_idx" ON "Prescription"("appointmentId");

-- CreateIndex
CREATE INDEX "MedicationReminder_status_scheduledAt_idx" ON "MedicationReminder"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MedicationReminder_prescriptionId_idx" ON "MedicationReminder"("prescriptionId");

-- CreateIndex
CREATE INDEX "NotificationLog_status_type_idx" ON "NotificationLog"("status", "type");

-- CreateIndex
CREATE INDEX "NotificationLog_appointmentId_idx" ON "NotificationLog"("appointmentId");

-- CreateIndex
CREATE INDEX "NotificationLog_recipientUserId_idx" ON "NotificationLog"("recipientUserId");

-- CreateIndex
CREATE INDEX "CalendarEvent_status_idx" ON "CalendarEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_appointmentId_ownerUserId_key" ON "CalendarEvent"("appointmentId", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarCredential_userId_key" ON "GoogleCalendarCredential"("userId");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorWorkingHours" ADD CONSTRAINT "DoctorWorkingHours_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_convertedAppointmentId_fkey" FOREIGN KEY ("convertedAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorLeave" ADD CONSTRAINT "DoctorLeave_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLeaveConflict" ADD CONSTRAINT "AppointmentLeaveConflict_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "DoctorLeave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentLeaveConflict" ADD CONSTRAINT "AppointmentLeaveConflict_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SymptomAnalysis" ADD CONSTRAINT "SymptomAnalysis_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitNote" ADD CONSTRAINT "VisitNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationReminder" ADD CONSTRAINT "MedicationReminder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarCredential" ADD CONSTRAINT "GoogleCalendarCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
