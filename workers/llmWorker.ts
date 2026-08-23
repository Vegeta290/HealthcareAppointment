import { Job, Worker } from "bullmq";
import { getRedisConnection } from "../lib/queue/connection";
import { QUEUE_NAMES } from "../lib/queue/queues";
import type { LlmJobData } from "../lib/queue/types";
import { generatePostVisitSummary, generateSymptomAnalysis } from "../lib/llm/gemini";

// Both generate* functions catch their own errors and persist a terminal
// COMPLETED/FAILED status (see lib/llm/gemini.ts) — they never throw. So this
// worker doesn't need its own try/catch or rely on BullMQ retries: a failed LLM
// call is already "handled gracefully" by the time this processor returns.
async function processLlmJob(job: Job<LlmJobData>): Promise<void> {
  if (job.data.kind === "PRE_VISIT_ANALYSIS") {
    await generateSymptomAnalysis(job.data.appointmentId);
    return;
  }
  await generatePostVisitSummary(job.data.appointmentId);
}

export function startLlmWorker(): Worker {
  return new Worker<LlmJobData>(QUEUE_NAMES.llmJobs, processLlmJob, {
    connection: getRedisConnection(),
    concurrency: 3,
  });
}
