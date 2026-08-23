import { Job, Worker } from "bullmq";
import { CalendarEventStatus } from "@prisma/client";
import { getRedisConnection } from "../lib/queue/connection";
import { QUEUE_NAMES } from "../lib/queue/queues";
import type { CalendarSyncJobData } from "../lib/queue/types";
import { prisma } from "../lib/prisma";
import {
  CalendarEventInput,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "../lib/calendar/google";

async function processCalendarSyncJob(job: Job<CalendarSyncJobData>): Promise<void> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: job.data.calendarEventId },
    include: {
      appointment: {
        include: {
          doctor: { include: { user: true } },
          patient: { include: { user: true } },
        },
      },
    },
  });
  if (!event) return; // row deleted — nothing to sync

  const { appointment } = event;
  const isPatientOwner = appointment.patient.user.id === event.ownerUserId;
  const input: CalendarEventInput = {
    summary: isPatientOwner
      ? `Appointment with Dr. ${appointment.doctor.user.email}`
      : `Appointment with patient ${appointment.patient.fullName}`,
    description: appointment.symptomText ?? undefined,
    start: appointment.slotStart,
    end: appointment.slotEnd,
    attendeeEmails: [appointment.patient.user.email, appointment.doctor.user.email],
  };

  try {
    if (job.data.action === "delete") {
      if (event.googleEventId && event.calendarId) {
        await deleteGoogleCalendarEvent(event.ownerUserId, {
          googleEventId: event.googleEventId,
          calendarId: event.calendarId,
        });
      }
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { status: CalendarEventStatus.DELETED, lastSyncedAt: new Date(), lastError: null },
      });
      return;
    }

    if (job.data.action === "update" && event.googleEventId && event.calendarId) {
      await updateGoogleCalendarEvent(
        event.ownerUserId,
        { googleEventId: event.googleEventId, calendarId: event.calendarId },
        input
      );
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { status: CalendarEventStatus.UPDATED, lastSyncedAt: new Date(), lastError: null },
      });
      return;
    }

    // "create", or an "update" job that arrived before any event was ever
    // created (e.g. the initial create job failed) — (re)create it.
    const ref = await createGoogleCalendarEvent(event.ownerUserId, input);
    if (!ref) {
      // Owner hasn't connected Google Calendar via OAuth — not an error, just
      // nothing to sync yet. Leaves status at its current value (PENDING) so a
      // later sync attempt (e.g. after connecting) can pick it up.
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          lastSyncedAt: new Date(),
          lastError: "Google Calendar not connected for this user",
        },
      });
      return;
    }

    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        status: CalendarEventStatus.CREATED,
        googleEventId: ref.googleEventId,
        calendarId: ref.calendarId,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });
  } catch (err) {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        status: CalendarEventStatus.FAILED,
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
    throw err; // allow BullMQ retry/backoff for transient Google API errors
  }
}

export function startCalendarSyncWorker(): Worker {
  return new Worker<CalendarSyncJobData>(QUEUE_NAMES.calendarSync, processCalendarSyncJob, {
    connection: getRedisConnection(),
    concurrency: 5,
  });
}
