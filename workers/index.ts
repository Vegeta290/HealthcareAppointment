// Entry point for the background worker process — run separately from the
// Next.js server (`npm run workers`). Not deployed as part of the Next.js
// build; BullMQ Workers need a long-running process, which serverless/edge
// API routes are not.

import { getMedicationReminderQueue, getNotificationSweepQueue } from "../lib/queue/queues";
import { startNotificationWorker, startNotificationSweepWorker } from "./notificationWorker";
import { startCalendarSyncWorker } from "./calendarSyncWorker";
import { startLeaveConflictWorker } from "./leaveConflictWorker";
import { startLlmWorker } from "./llmWorker";
import { startMedicationReminderWorker } from "./medicationReminderWorker";

async function main() {
  const workers = [
    startNotificationWorker(),
    startNotificationSweepWorker(),
    startCalendarSyncWorker(),
    startLeaveConflictWorker(),
    startLlmWorker(),
    startMedicationReminderWorker(),
  ];

  // Repeatable jobs, registered with a fixed jobId so re-running this bootstrap
  // (e.g. redeploying the worker process) doesn't create duplicate schedules.
  await getNotificationSweepQueue().add(
    "sweep-failed-notifications",
    {},
    { repeat: { every: 5 * 60_000 }, jobId: "sweep-failed-notifications" }
  );
  await getMedicationReminderQueue().add(
    "sweep-due-reminders",
    {},
    { repeat: { every: 60_000 }, jobId: "sweep-due-reminders" }
  );

  console.log(`Started ${workers.length} background workers.`);

  const shutdown = async () => {
    console.log("Shutting down workers...");
    await Promise.all(workers.map((worker) => worker.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start workers", err);
  process.exit(1);
});
