// Turns a Prescription's free-text `frequency` into a set of daily reminder
// times. `frequency` is deliberately a free-text field on the schema (to allow
// dosing patterns beyond a fixed enum) — this is a best-effort mapping of the
// common cases a doctor is likely to type, with a safe once-daily fallback for
// anything unrecognised, rather than rejecting the prescription.
const FREQUENCY_TIMES: Record<string, string[]> = {
  "ONCE DAILY": ["09:00"],
  "ONCE A DAY": ["09:00"],
  "TWICE DAILY": ["09:00", "21:00"],
  "TWICE A DAY": ["09:00", "21:00"],
  "THREE TIMES DAILY": ["08:00", "14:00", "20:00"],
  "THREE TIMES A DAY": ["08:00", "14:00", "20:00"],
  "EVERY 8 HOURS": ["06:00", "14:00", "22:00"],
  "EVERY 12 HOURS": ["09:00", "21:00"],
  "FOUR TIMES DAILY": ["08:00", "12:00", "16:00", "20:00"],
};

const DEFAULT_TIMES = ["09:00"];
const DEFAULT_DURATION_DAYS = 7;

function timesForFrequency(frequency: string): string[] {
  return FREQUENCY_TIMES[frequency.trim().toUpperCase()] ?? DEFAULT_TIMES;
}

// Returns the Date[] of scheduledAt values a MedicationReminder should be
// created for, starting the day after `startDate` (the appointment date) for
// `durationDays` days.
export function computeReminderSchedule(
  startDate: Date,
  frequency: string,
  durationDays: number | null | undefined
): Date[] {
  const times = timesForFrequency(frequency);
  const days = durationDays && durationDays > 0 ? durationDays : DEFAULT_DURATION_DAYS;

  const dayStart = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() + 1)
  );

  const schedule: Date[] = [];
  for (let day = 0; day < days; day++) {
    for (const time of times) {
      const [hour, minute] = time.split(":").map(Number);
      const scheduledAt = new Date(dayStart.getTime() + day * 24 * 60 * 60_000);
      scheduledAt.setUTCHours(hour, minute, 0, 0);
      schedule.push(scheduledAt);
    }
  }
  return schedule;
}
