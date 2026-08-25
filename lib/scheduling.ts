import { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export function computeSlotEnd(slotStart: Date, slotDurationMinutes: number): Date {
  return new Date(slotStart.getTime() + slotDurationMinutes * 60_000);
}

// True if `slotStart`'s calendar date falls inside any ACTIVE leave for the doctor.
// Both hold creation and booking must check this — a leave can be filed for a date
// between hold creation and the final booking call.
export async function isDoctorOnLeave(
  db: Db,
  doctorId: string,
  slotStart: Date
): Promise<boolean> {
  const dateOnly = new Date(
    Date.UTC(slotStart.getUTCFullYear(), slotStart.getUTCMonth(), slotStart.getUTCDate())
  );

  const conflict = await db.doctorLeave.findFirst({
    where: {
      doctorId,
      status: "ACTIVE",
      startDate: { lte: dateOnly },
      endDate: { gte: dateOnly },
    },
    select: { id: true },
  });

  return conflict !== null;
}

// Generates candidate slot start times for one calendar day, honoring the
// doctor's DoctorWorkingHours, subtracting DoctorLeave, and excluding times
// already taken by a live Appointment or an ACTIVE SlotHold. Working-hours
// "HH:mm" strings are treated as UTC to match the rest of the schema — a real
// clinic deployment would instead store/convert a clinic timezone, which is
// out of scope here. See README.md's "Display timezone" section for the
// related known limitation this creates for IST-based working hours.
export async function generateAvailableSlots(
  db: Db,
  doctorId: string,
  date: Date
): Promise<Date[]> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const doctor = await db.doctorProfile.findUnique({
    where: { id: doctorId },
    select: { slotDurationMinutes: true },
  });
  if (!doctor) return [];

  if (await isDoctorOnLeave(db, doctorId, dayStart)) return [];

  const weekday = dayStart.getUTCDay();
  const workingHours = await db.doctorWorkingHours.findMany({
    where: { doctorId, weekday },
  });
  if (workingHours.length === 0) return [];

  const candidates: Date[] = [];
  for (const window of workingHours) {
    const [startHour, startMinute] = window.startTime.split(":").map(Number);
    const [endHour, endMinute] = window.endTime.split(":").map(Number);
    let cursor = new Date(dayStart);
    cursor.setUTCHours(startHour, startMinute, 0, 0);
    const windowEnd = new Date(dayStart);
    windowEnd.setUTCHours(endHour, endMinute, 0, 0);

    while (cursor.getTime() + doctor.slotDurationMinutes * 60_000 <= windowEnd.getTime()) {
      if (cursor.getTime() > Date.now()) {
        candidates.push(new Date(cursor));
      }
      cursor = new Date(cursor.getTime() + doctor.slotDurationMinutes * 60_000);
    }
  }
  if (candidates.length === 0) return [];

  const [takenAppointments, activeHolds] = await Promise.all([
    db.appointment.findMany({
      where: {
        doctorId,
        status: { in: ["PENDING", "CONFIRMED"] },
        slotStart: { gte: dayStart, lt: dayEnd },
      },
      select: { slotStart: true },
    }),
    db.slotHold.findMany({
      where: {
        doctorId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        slotStart: { gte: dayStart, lt: dayEnd },
      },
      select: { slotStart: true },
    }),
  ]);

  const taken = new Set(
    [...takenAppointments, ...activeHolds].map((row) => row.slotStart.getTime())
  );

  return candidates.filter((slot) => !taken.has(slot.getTime()));
}
