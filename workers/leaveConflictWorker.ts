import { Job, Worker } from "bullmq";
import { AppointmentStatus, LeaveStatus, NotificationType } from "@prisma/client";
import { getRedisConnection } from "../lib/queue/connection";
import { QUEUE_NAMES, getNotificationQueue } from "../lib/queue/queues";
import type { LeaveConflictJobData } from "../lib/queue/types";
import { prisma } from "../lib/prisma";

// Detects appointments displaced by a doctor's leave, cancels them, and queues
// a notification to each affected patient. Idempotent and safe to re-run: the
// `leaveConflicts: { none: { leaveId } }` filter below means any appointment
// already recorded as a conflict for this leave is skipped, so a retried job
// (or a second manual trigger) never double-cancels or double-notifies.
async function processLeaveConflictJob(job: Job<LeaveConflictJobData>): Promise<void> {
  const leave = await prisma.doctorLeave.findUnique({ where: { id: job.data.leaveId } });
  if (!leave || leave.status !== LeaveStatus.ACTIVE) return;

  // endDate is inclusive and date-only; conflicts run through the end of that day.
  const endExclusive = new Date(leave.endDate.getTime() + 24 * 60 * 60_000);

  const conflicting = await prisma.appointment.findMany({
    where: {
      doctorId: leave.doctorId,
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      slotStart: { gte: leave.startDate, lt: endExclusive },
      leaveConflicts: { none: { leaveId: leave.id } },
    },
    include: { patient: { include: { user: true } } },
  });

  const reason = leave.reason ? `Doctor on leave: ${leave.reason}` : "Doctor on leave";

  for (const appointment of conflicting) {
    const { notificationLogId } = await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: leave.createdById,
          cancellationReason: reason,
        },
      });

      await tx.appointmentLeaveConflict.create({
        data: { leaveId: leave.id, appointmentId: appointment.id },
      });

      const log = await tx.notificationLog.create({
        data: {
          appointmentId: appointment.id,
          recipientUserId: appointment.patient.user.id,
          type: NotificationType.LEAVE_CONFLICT,
        },
      });

      return { notificationLogId: log.id };
    });

    await getNotificationQueue().add("send-notification", { notificationLogId });

    // "Notified" here means the send was durably queued, not confirmed
    // delivered — actual delivery status lives on NotificationLog, updated
    // independently (with its own retry) by the notification worker.
    await prisma.appointmentLeaveConflict.updateMany({
      where: { leaveId: leave.id, appointmentId: appointment.id },
      data: { notifiedAt: new Date() },
    });
  }
}

export function startLeaveConflictWorker(): Worker {
  return new Worker<LeaveConflictJobData>(QUEUE_NAMES.leaveConflicts, processLeaveConflictJob, {
    connection: getRedisConnection(),
    concurrency: 3,
  });
}
