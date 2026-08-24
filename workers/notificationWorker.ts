import { Job, Worker } from "bullmq";
import { NotificationStatus, NotificationType } from "@prisma/client";
import { getRedisConnection } from "../lib/queue/connection";
import { QUEUE_NAMES, getNotificationQueue } from "../lib/queue/queues";
import type { NotificationJobData } from "../lib/queue/types";
import { prisma } from "../lib/prisma";
import { getDoctorDisplayName } from "../lib/doctors";
import { sendEmail } from "../lib/email/mailer";
import {
  buildAppointmentReminderEmail,
  buildBookingConfirmationEmail,
  buildCancellationEmail,
  buildLeaveConflictEmail,
  EmailContent,
} from "../lib/email/templates";

// Failed rows older than this are eligible for the periodic retry sweep below,
// on top of BullMQ's own per-job attempts/backoff — this catches the case where
// the outage (e.g. SMTP down) outlasted the job's own retry window.
const RETRY_SWEEP_MIN_AGE_MS = 15 * 60_000;
const RETRY_SWEEP_MAX_ATTEMPTS = 10;

async function buildEmailForLog(
  logId: string,
  type: NotificationType,
  recipientUserId: string,
  appointmentId: string | null
): Promise<{ content: EmailContent; to: string } | null> {
  const recipient = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { email: true },
  });
  if (!recipient) return null;

  if (!appointmentId) {
    return null; // no non-appointment notification types exist yet
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: { include: { user: true } }, patient: { include: { user: true } } },
  });
  if (!appointment) return null;

  const isPatientRecipient = appointment.patient.user.id === recipientUserId;
  const recipientRole: "PATIENT" | "DOCTOR" = isPatientRecipient ? "PATIENT" : "DOCTOR";
  const ctx = {
    patientName: appointment.patient.fullName,
    doctorName: getDoctorDisplayName(appointment.doctor),
    specialisation: appointment.doctor.specialisation,
    slotStart: appointment.slotStart,
    slotEnd: appointment.slotEnd,
  };

  switch (type) {
    case NotificationType.BOOKING_CONFIRMATION:
      return { content: buildBookingConfirmationEmail(ctx, recipientRole), to: recipient.email };
    case NotificationType.CANCELLATION:
      return {
        content: buildCancellationEmail({ ...ctx, reason: appointment.cancellationReason }, recipientRole),
        to: recipient.email,
      };
    case NotificationType.APPOINTMENT_REMINDER:
    case NotificationType.RESCHEDULE:
      return { content: buildAppointmentReminderEmail(ctx, recipientRole), to: recipient.email };
    case NotificationType.LEAVE_CONFLICT:
      return {
        content: buildLeaveConflictEmail({ ...ctx, leaveReason: appointment.cancellationReason }),
        to: recipient.email,
      };
    default:
      return null;
  }
}

async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const log = await prisma.notificationLog.findUnique({ where: { id: job.data.notificationLogId } });
  if (!log) return; // log row was deleted — nothing to do
  if (log.status === NotificationStatus.SENT) return; // idempotency guard against duplicate delivery

  const built = await buildEmailForLog(log.id, log.type, log.recipientUserId, log.appointmentId);
  if (!built) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.FAILED,
        lastError: "Could not resolve recipient/appointment for this notification",
      },
    });
    return;
  }

  try {
    await sendEmail({ to: built.to, ...built.content });
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: { increment: 1 } },
    });
  } catch (err) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.RETRYING,
        attempts: { increment: 1 },
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
    throw err; // let BullMQ retry with backoff; 'failed' listener below handles exhaustion
  }
}

// Periodic reconciliation: re-enqueues FAILED notifications that are still
// under the retry cap and have sat long enough that a fresh attempt is worth
// it. This is the "email retries" background job — distinct from BullMQ's
// per-job backoff, which only covers retries within a single job's lifetime.
async function sweepFailedNotifications(): Promise<void> {
  const cutoff = new Date(Date.now() - RETRY_SWEEP_MIN_AGE_MS);
  const stale = await prisma.notificationLog.findMany({
    where: {
      status: NotificationStatus.FAILED,
      attempts: { lt: RETRY_SWEEP_MAX_ATTEMPTS },
      updatedAt: { lte: cutoff },
    },
    select: { id: true },
    take: 100,
  });

  for (const row of stale) {
    await prisma.notificationLog.update({
      where: { id: row.id },
      data: { status: NotificationStatus.RETRYING },
    });
    await getNotificationQueue().add("send-notification", { notificationLogId: row.id });
  }
}

export function startNotificationWorker(): Worker {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.notifications,
    processNotificationJob,
    { connection: getRedisConnection(), concurrency: 5 }
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!attemptsExhausted) return;
    // BullMQ has given up on this job — record the terminal failure so it's
    // visible to an admin instead of disappearing.
    prisma.notificationLog
      .update({
        where: { id: job.data.notificationLogId },
        data: { status: NotificationStatus.FAILED, lastError: err.message },
      })
      .catch(() => {});
  });

  return worker;
}

// Separate worker on the dedicated notificationSweepQueue — see the comment on
// that queue in lib/queue/queues.ts for why this isn't just another job shape
// on the main notifications queue.
export function startNotificationSweepWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.notificationSweep,
    async () => {
      await sweepFailedNotifications();
    },
    { connection: getRedisConnection(), concurrency: 1 }
  );
}
