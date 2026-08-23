import { Worker } from "bullmq";
import { NotificationStatus, NotificationType, ReminderStatus } from "@prisma/client";
import { getRedisConnection } from "../lib/queue/connection";
import { QUEUE_NAMES } from "../lib/queue/queues";
import { prisma } from "../lib/prisma";
import { sendEmail } from "../lib/email/mailer";
import { buildMedicationReminderEmail } from "../lib/email/templates";

const SWEEP_BATCH_SIZE = 100;

// Polls for MedicationReminder rows whose scheduledAt has passed and sends
// each one directly (rather than fanning out to per-reminder delayed BullMQ
// jobs) — a periodic sweep is simpler to reason about at this volume and
// avoids scheduling thousands of individual delayed jobs. Rows are created
// upstream when a Prescription is recorded (frequency -> a set of scheduledAt
// rows); that route is out of scope here but this worker is ready for it.
async function sweepDueReminders(): Promise<void> {
  const due = await prisma.medicationReminder.findMany({
    where: { status: ReminderStatus.PENDING, scheduledAt: { lte: new Date() } },
    include: {
      prescription: {
        include: { appointment: { include: { patient: { include: { user: true } } } } },
      },
    },
    take: SWEEP_BATCH_SIZE,
  });

  for (const reminder of due) {
    const { prescription } = reminder;
    const patient = prescription.appointment.patient;

    const notificationLog = await prisma.notificationLog.create({
      data: {
        appointmentId: prescription.appointmentId,
        recipientUserId: patient.user.id,
        type: NotificationType.MEDICATION_REMINDER,
      },
    });

    try {
      const { subject, html, text } = buildMedicationReminderEmail({
        patientName: patient.fullName,
        medicationName: prescription.medicationName,
        dosage: prescription.dosage,
        instructions: prescription.instructions,
      });
      await sendEmail({ to: patient.user.email, subject, html, text });

      await prisma.$transaction([
        prisma.medicationReminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.SENT, sentAt: new Date() },
        }),
        prisma.notificationLog.update({
          where: { id: notificationLog.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      // One reminder failing (bad address, transient SMTP error) must not stop
      // the rest of the batch — caught and recorded per-row, not rethrown.
      const message = err instanceof Error ? err.message : String(err);
      await prisma.$transaction([
        prisma.medicationReminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.FAILED, attempts: { increment: 1 }, lastError: message },
        }),
        prisma.notificationLog.update({
          where: { id: notificationLog.id },
          data: { status: NotificationStatus.FAILED, attempts: { increment: 1 }, lastError: message },
        }),
      ]);
    }
  }
}

export function startMedicationReminderWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.medicationReminders,
    async (job) => {
      if (job.name === "sweep-due-reminders") {
        await sweepDueReminders();
      }
    },
    { connection: getRedisConnection(), concurrency: 1 }
  );
}
