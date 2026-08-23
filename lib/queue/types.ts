// Job payload shapes shared between producers (API routes / service modules) and
// the workers in /workers that consume them. Kept intentionally thin: every job
// carries an id and the worker re-reads current state from the database, rather
// than trusting a snapshot passed at enqueue time (state may have changed by the
// time the job runs, e.g. an appointment cancelled after a reminder was queued).

export interface NotificationJobData {
  notificationLogId: string;
}

export interface CalendarSyncJobData {
  calendarEventId: string;
  action: "create" | "update" | "delete";
}

export interface LeaveConflictJobData {
  leaveId: string;
}

export interface PreVisitAnalysisJobData {
  appointmentId: string;
}

export interface PostVisitSummaryJobData {
  appointmentId: string;
}

export type LlmJobData =
  | ({ kind: "PRE_VISIT_ANALYSIS" } & PreVisitAnalysisJobData)
  | ({ kind: "POST_VISIT_SUMMARY" } & PostVisitSummaryJobData);
