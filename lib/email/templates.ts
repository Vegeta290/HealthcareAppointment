// Plain-text-first email bodies with a minimal HTML wrapper. No external template
// engine — the content is short enough that a template dependency isn't justified.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function wrapHtml(paragraphs: string[]): string {
  return `<div style="font-family: sans-serif; font-size: 14px; color: #1a1a1a;">${paragraphs
    .map((p) => `<p>${p}</p>`)
    .join("")}</div>`;
}

function formatSlot(start: Date, end: Date): string {
  return `${start.toUTCString()} – ${end.toUTCString()} (UTC)`;
}

export interface AppointmentEmailContext {
  patientName: string;
  doctorName: string;
  specialisation: string;
  slotStart: Date;
  slotEnd: Date;
}

export function buildBookingConfirmationEmail(
  ctx: AppointmentEmailContext,
  recipient: "PATIENT" | "DOCTOR"
): EmailContent {
  const when = formatSlot(ctx.slotStart, ctx.slotEnd);
  if (recipient === "PATIENT") {
    const text = `Your appointment with Dr. ${ctx.doctorName} (${ctx.specialisation}) is confirmed for ${when}.`;
    return {
      subject: "Appointment confirmed",
      text,
      html: wrapHtml([text, "A calendar invite will follow shortly."]),
    };
  }
  const text = `You have a new appointment with patient ${ctx.patientName} confirmed for ${when}.`;
  return {
    subject: "New appointment booked",
    text,
    html: wrapHtml([text]),
  };
}

export function buildCancellationEmail(
  ctx: AppointmentEmailContext & { reason?: string | null },
  recipient: "PATIENT" | "DOCTOR"
): EmailContent {
  const when = formatSlot(ctx.slotStart, ctx.slotEnd);
  const reasonSuffix = ctx.reason ? ` Reason: ${ctx.reason}` : "";
  const text =
    recipient === "PATIENT"
      ? `Your appointment with Dr. ${ctx.doctorName} scheduled for ${when} has been cancelled.${reasonSuffix}`
      : `Your appointment with patient ${ctx.patientName} scheduled for ${when} has been cancelled.${reasonSuffix}`;
  return {
    subject: "Appointment cancelled",
    text,
    html: wrapHtml([text]),
  };
}

export function buildAppointmentReminderEmail(
  ctx: AppointmentEmailContext,
  recipient: "PATIENT" | "DOCTOR"
): EmailContent {
  const when = formatSlot(ctx.slotStart, ctx.slotEnd);
  const text =
    recipient === "PATIENT"
      ? `Reminder: you have an appointment with Dr. ${ctx.doctorName} at ${when}.`
      : `Reminder: you have an appointment with patient ${ctx.patientName} at ${when}.`;
  return {
    subject: "Upcoming appointment reminder",
    text,
    html: wrapHtml([text]),
  };
}

export function buildRescheduleEmail(
  ctx: AppointmentEmailContext,
  recipient: "PATIENT" | "DOCTOR"
): EmailContent {
  const when = formatSlot(ctx.slotStart, ctx.slotEnd);
  const text =
    recipient === "PATIENT"
      ? `Your appointment with Dr. ${ctx.doctorName} has been rescheduled to ${when}.`
      : `Your appointment with patient ${ctx.patientName} has been rescheduled to ${when}.`;
  return {
    subject: "Appointment rescheduled",
    text,
    html: wrapHtml([text]),
  };
}

export function buildLeaveConflictEmail(
  ctx: AppointmentEmailContext & { leaveReason?: string | null }
): EmailContent {
  const when = formatSlot(ctx.slotStart, ctx.slotEnd);
  const reasonSuffix = ctx.leaveReason ? ` (${ctx.leaveReason})` : "";
  const text = `Dr. ${ctx.doctorName} is unavailable on leave${reasonSuffix} and your appointment scheduled for ${when} has been cancelled. Please rebook for another slot — we're sorry for the inconvenience.`;
  return {
    subject: "Your appointment was cancelled — doctor on leave",
    text,
    html: wrapHtml([text]),
  };
}

export interface MedicationReminderEmailContext {
  patientName: string;
  medicationName: string;
  dosage: string;
  instructions?: string | null;
}

export function buildMedicationReminderEmail(
  ctx: MedicationReminderEmailContext
): EmailContent {
  const instructionSuffix = ctx.instructions ? ` (${ctx.instructions})` : "";
  const text = `Reminder: it's time to take your medication — ${ctx.medicationName}, ${ctx.dosage}${instructionSuffix}.`;
  return {
    subject: "Medication reminder",
    text,
    html: wrapHtml([text]),
  };
}
