// Single source of truth for how dates/times are *displayed* across the app.
// Everything is stored in the database as UTC (see PLAN.md) — this only
// controls presentation, converting to India Standard Time for readability.
// Changing DISPLAY_TIME_ZONE here updates every page that imports from this
// file, rather than needing to hunt down each ad-hoc formatter.
export const DISPLAY_TIME_ZONE = "Asia/Kolkata";
const DISPLAY_TIME_ZONE_LABEL = "IST";

// "1:00 PM – 1:30 PM IST" — for compact lists (e.g. doctor's daily schedule).
export function formatTimeRange(start: Date, end: Date): string {
  const startStr = start.toLocaleString("en-US", { timeStyle: "short", timeZone: DISPLAY_TIME_ZONE });
  const endStr = end.toLocaleString("en-US", { timeStyle: "short", timeZone: DISPLAY_TIME_ZONE });
  return `${startStr} – ${endStr} ${DISPLAY_TIME_ZONE_LABEL}`;
}

// "Monday, August 24, 2026 at 1:00 PM – 1:30 PM IST" — for appointment detail headers.
export function formatFullSlotRange(start: Date, end: Date): string {
  const startStr = start.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
  const endStr = end.toLocaleString("en-US", { timeStyle: "short", timeZone: DISPLAY_TIME_ZONE });
  return `${startStr} – ${endStr} ${DISPLAY_TIME_ZONE_LABEL}`;
}

// "Aug 24, 2026, 1:00 PM – 1:30 PM IST" — for dashboard list rows (medium date, not full).
export function formatMediumSlotRange(start: Date, end: Date): string {
  const startStr = start.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
  const endStr = end.toLocaleString("en-US", { timeStyle: "short", timeZone: DISPLAY_TIME_ZONE });
  return `${startStr} – ${endStr} ${DISPLAY_TIME_ZONE_LABEL}`;
}

// "Aug 24, 2026" — date-only, for leave date ranges.
export function formatDateOnly(date: Date): string {
  return date.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: DISPLAY_TIME_ZONE });
}

// "Mon, 1:00 PM" — compact, for slot-picker buttons (BookingFlow/RescheduleFlow).
export function formatSlotButtonLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
}
