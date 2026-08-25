import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, Prisma, Role, SlotHoldStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isDoctorOnLeave } from "@/lib/scheduling";
import { enqueueBookingSideEffects } from "@/lib/appointments/sideEffects";

interface BookRequestBody {
  holdId?: string;
  symptomText?: string;
}

// Thrown inside the transaction when the hold turns out to be gone/expired/consumed
// by the time we get the write lock — distinct from the P2002 case below so the
// client gets a more specific "your hold expired" message instead of a generic
// "slot taken" one.
class HoldNotAvailableError extends Error {}

// POST /api/appointments/book
// Converts an active SlotHold into a confirmed Appointment. This is the route that
// actually enforces double-booking prevention — see SYSTEM_DESIGN.md and the comment on
// the Appointment model in schema.prisma.
export async function POST(request: NextRequest) {
  const auth = requireRole(request, [Role.PATIENT]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: BookRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { holdId, symptomText } = body;
  if (!holdId) {
    return NextResponse.json({ error: "holdId is required" }, { status: 400 });
  }

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!patientProfile) {
    return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
  }

  const hold = await prisma.slotHold.findUnique({ where: { id: holdId } });
  // Row-level RBAC: a patient may only book against their own hold. Returning 404
  // (not 403) here avoids confirming to a caller that some other patient's holdId
  // exists.
  if (!hold || hold.patientId !== patientProfile.id) {
    return NextResponse.json({ error: "Hold not found" }, { status: 404 });
  }
  if (hold.status !== SlotHoldStatus.ACTIVE || hold.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Hold has expired. Please select the slot again." },
      { status: 410 }
    );
  }

  // Leave may have been filed after the hold was created — check again before
  // committing.
  if (await isDoctorOnLeave(prisma, hold.doctorId, hold.slotStart)) {
    return NextResponse.json(
      { error: "Doctor is on leave for the selected date" },
      { status: 409 }
    );
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Re-fetch inside the transaction to guard against the hold expiring or
      // being consumed between the check above and this write. This narrows the
      // race window but is not itself the guarantee — the partial unique index
      // on Appointment (caught as P2002 below) is what makes double-booking
      // impossible even if this check is somehow bypassed.
      const freshHold = await tx.slotHold.findUnique({ where: { id: hold.id } });
      if (
        !freshHold ||
        freshHold.status !== SlotHoldStatus.ACTIVE ||
        freshHold.expiresAt.getTime() <= Date.now()
      ) {
        throw new HoldNotAvailableError("Hold is no longer active");
      }

      const created = await tx.appointment.create({
        data: {
          doctorId: freshHold.doctorId,
          patientId: freshHold.patientId,
          slotStart: freshHold.slotStart,
          slotEnd: freshHold.slotEnd,
          status: AppointmentStatus.CONFIRMED,
          symptomText: symptomText ?? null,
          symptomSubmittedAt: symptomText ? new Date() : null,
        },
        include: {
          doctor: { include: { user: true } },
          patient: { include: { user: true } },
        },
      });

      await tx.slotHold.update({
        where: { id: freshHold.id },
        data: {
          status: SlotHoldStatus.CONVERTED,
          convertedAppointmentId: created.id,
        },
      });

      return created;
    });

    // Deliberately NOT done inside the transaction above: creating
    // NotificationLog/CalendarEvent rows and enqueueing the jobs that deliver
    // them (booking confirmation email, calendar sync, pre-visit LLM analysis).
    // Those integrate with external services that can fail or be slow, and
    // their failure must never roll back a successful booking — each has its
    // own durable record and retry story owned by a background worker (see
    // lib/appointments/sideEffects.ts, workers/notificationWorker.ts,
    // workers/calendarSyncWorker.ts, workers/llmWorker.ts).
    try {
      await enqueueBookingSideEffects(appointment);
    } catch (sideEffectErr) {
      // The booking itself already succeeded and committed — a failure to
      // enqueue side effects (e.g. Redis briefly unreachable) must not turn
      // into a 500 for what is otherwise a successful request. Logged for
      // operator visibility; nothing here is silently lost forever since the
      // NotificationLog/CalendarEvent rows (if created before the failure)
      // remain in PENDING and can be swept by a reconciliation job.
      console.error("Failed to enqueue booking side effects", sideEffectErr);
    }

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err) {
    if (err instanceof HoldNotAvailableError) {
      return NextResponse.json(
        { error: "Hold has expired. Please select the slot again." },
        { status: 410 }
      );
    }

    // Raised by the appointment_live_slot_uq partial unique index (see
    // prisma/sql/partial_unique_indexes.sql: UNIQUE (doctorId, slotStart) WHERE
    // status IN ('PENDING', 'CONFIRMED')). This is the actual double-booking
    // guard: even if the SlotHold layer above has a bug, expired mid-flight, or
    // was bypassed entirely, Postgres itself refuses a second live appointment
    // for this doctor/slot. We catch that specific violation and return a clean
    // client error instead of letting it surface as a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Slot no longer available. Please choose another slot." },
        { status: 409 }
      );
    }

    throw err;
  }
}
