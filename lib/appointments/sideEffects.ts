import { Appointment, DoctorProfile, NotificationType, PatientProfile, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCalendarSyncQueue, getLlmQueue, getNotificationQueue } from "@/lib/queue/queues";

export type AppointmentWithParties = Appointment & {
  doctor: DoctorProfile & { user: User };
  patient: PatientProfile & { user: User };
};

// Runs after a booking (or reschedule) transaction commits. Deliberately
// outside that transaction (see the comment in app/api/appointments/book/route.ts):
// none of this — email, Google Calendar, LLM — may roll back a successful
// booking, and each piece has its own durable-record + retry story
// (NotificationLog, CalendarEvent, SymptomAnalysis) rather than needing to
// succeed synchronously here. This function only creates the DB rows and
// enqueues the jobs that do the actual work; if enqueueing itself throws
// (e.g. Redis unreachable), the caller catches it and still returns the
// successful booking to the client.
export async function enqueueBookingSideEffects(
  appointment: AppointmentWithParties,
  notificationType: typeof NotificationType.BOOKING_CONFIRMATION | typeof NotificationType.RESCHEDULE = NotificationType.BOOKING_CONFIRMATION
): Promise<void> {
  const patientNotification = await prisma.notificationLog.create({
    data: {
      appointmentId: appointment.id,
      recipientUserId: appointment.patient.user.id,
      type: notificationType,
    },
  });
  const doctorNotification = await prisma.notificationLog.create({
    data: {
      appointmentId: appointment.id,
      recipientUserId: appointment.doctor.user.id,
      type: notificationType,
    },
  });
  const notificationQueue = getNotificationQueue();
  await Promise.all([
    notificationQueue.add("send-notification", { notificationLogId: patientNotification.id }),
    notificationQueue.add("send-notification", { notificationLogId: doctorNotification.id }),
  ]);

  const patientCalendarEvent = await prisma.calendarEvent.create({
    data: { appointmentId: appointment.id, ownerUserId: appointment.patient.user.id },
  });
  const doctorCalendarEvent = await prisma.calendarEvent.create({
    data: { appointmentId: appointment.id, ownerUserId: appointment.doctor.user.id },
  });
  const calendarSyncQueue = getCalendarSyncQueue();
  await Promise.all([
    calendarSyncQueue.add("sync-event", {
      calendarEventId: patientCalendarEvent.id,
      action: "create",
    }),
    calendarSyncQueue.add("sync-event", {
      calendarEventId: doctorCalendarEvent.id,
      action: "create",
    }),
  ]);

  if (appointment.symptomText) {
    await getLlmQueue().add("llm-job", {
      kind: "PRE_VISIT_ANALYSIS",
      appointmentId: appointment.id,
    });
  }
}

// Used when an appointment is superseded (rescheduled to a new row — see
// app/api/appointments/[id]/reschedule/route.ts): removes any Google Calendar
// events that were synced for the OLD appointment, since it's now cancelled
// and a fresh CalendarEvent gets created for the new one via
// enqueueBookingSideEffects above.
export async function enqueueCalendarCleanup(appointmentId: string): Promise<void> {
  const staleEvents = await prisma.calendarEvent.findMany({
    where: { appointmentId, status: { in: ["PENDING", "CREATED", "UPDATED"] } },
  });
  if (staleEvents.length === 0) return;

  const calendarSyncQueue = getCalendarSyncQueue();
  await Promise.all(
    staleEvents.map((event) =>
      calendarSyncQueue.add("sync-event", { calendarEventId: event.id, action: "delete" })
    )
  );
}
