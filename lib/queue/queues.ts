import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import type {
  CalendarSyncJobData,
  LeaveConflictJobData,
  LlmJobData,
  NotificationJobData,
} from "./types";

// Queue names are the wire identifiers BullMQ uses in Redis — keep them stable
// once deployed, since renaming orphans any jobs already queued under the old name.
export const QUEUE_NAMES = {
  notifications: "notifications",
  notificationSweep: "notification-retry-sweep",
  calendarSync: "calendar-sync",
  leaveConflicts: "leave-conflicts",
  llmJobs: "llm-jobs",
  medicationReminders: "medication-reminders",
} as const;

// Retryable, externally-facing jobs (email, calendar, LLM) get exponential
// backoff and several attempts, since the failure is usually transient (rate
// limit, network blip). Terminal failure after all attempts is recorded on the
// owning DB row (NotificationLog.status = FAILED, etc.) by each worker's
// 'failed' listener, so it surfaces to admins instead of vanishing silently.
const retryableJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};

// Queues are constructed lazily (one singleton per queue, cached across hot
// reloads like lib/prisma.ts) rather than as top-level `new Queue(...)`
// exports. A top-level instantiation opens a Redis connection as soon as this
// module is imported — which happens during `next build`'s page-data
// collection for every route that imports it, long before any request runs,
// and fails the build if REDIS_URL isn't set at build time. Deferring
// construction to first use means the module can be imported freely; only
// actually enqueueing/consuming a job requires Redis to be reachable.
type QueueCache = {
  notifications?: Queue<NotificationJobData>;
  notificationSweep?: Queue;
  calendarSync?: Queue<CalendarSyncJobData>;
  leaveConflicts?: Queue<LeaveConflictJobData>;
  llmJobs?: Queue<LlmJobData>;
  medicationReminders?: Queue;
};
const globalForQueues = globalThis as unknown as { queueCache?: QueueCache };
const cache: QueueCache = globalForQueues.queueCache ?? (globalForQueues.queueCache = {});

export function getNotificationQueue(): Queue<NotificationJobData> {
  return (cache.notifications ??= new Queue<NotificationJobData>(QUEUE_NAMES.notifications, {
    connection: getRedisConnection(),
    defaultJobOptions: retryableJobOptions,
  }));
}

// Separate queue (rather than a differently-shaped job on the notifications
// queue) so the "send one email" job data type stays honest — no producer
// enqueues a real send-notification job without a notificationLogId. Only
// workers/index.ts registers a job here, a single repeatable
// "sweep-failed-notifications" tick.
export function getNotificationSweepQueue(): Queue {
  return (cache.notificationSweep ??= new Queue(QUEUE_NAMES.notificationSweep, {
    connection: getRedisConnection(),
    defaultJobOptions: { removeOnComplete: 50, removeOnFail: 200 },
  }));
}

export function getCalendarSyncQueue(): Queue<CalendarSyncJobData> {
  return (cache.calendarSync ??= new Queue<CalendarSyncJobData>(QUEUE_NAMES.calendarSync, {
    connection: getRedisConnection(),
    defaultJobOptions: retryableJobOptions,
  }));
}

export function getLlmQueue(): Queue<LlmJobData> {
  return (cache.llmJobs ??= new Queue<LlmJobData>(QUEUE_NAMES.llmJobs, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  }));
}

// Leave-conflict detection is idempotent scan-and-reconcile work (see
// workers/leaveConflictWorker.ts), so fewer retries are needed — a failed run
// will simply re-detect the same conflicts next time it's triggered.
export function getLeaveConflictQueue(): Queue<LeaveConflictJobData> {
  return (cache.leaveConflicts ??= new Queue<LeaveConflictJobData>(QUEUE_NAMES.leaveConflicts, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  }));
}

// No producer enqueues individual jobs on this queue — it exists so
// workers/medicationReminderWorker.ts can register a single repeatable
// "sweep-due-reminders" job at startup (see workers/index.ts).
export function getMedicationReminderQueue(): Queue {
  return (cache.medicationReminders ??= new Queue(QUEUE_NAMES.medicationReminders, {
    connection: getRedisConnection(),
    defaultJobOptions: { removeOnComplete: 50, removeOnFail: 200 },
  }));
}
