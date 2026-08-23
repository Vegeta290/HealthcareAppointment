import { NextRequest, NextResponse } from "next/server";
import { AppointmentStatus, LlmJobStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getLlmQueue } from "@/lib/queue/queues";
import { computeReminderSchedule } from "@/lib/medication/schedule";

interface PrescriptionInput {
  medicationName?: string;
  dosage?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
}

interface VisitNoteBody {
  clinicalNotes?: string;
  prescriptions?: PrescriptionInput[];
}

// POST /api/appointments/[id]/visit-notes
// Doctor submits post-visit clinical notes + a structured prescription list.
// Marks the appointment COMPLETED, schedules medication reminders per
// prescription, and enqueues the LLM job that turns clinicalNotes into a
// patient-friendly summary (see lib/llm/gemini.ts — that job never throws, so
// a Gemini failure here just leaves VisitNote.status FAILED without blocking
// this request).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(request, [Role.DOCTOR]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: VisitNoteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.clinicalNotes || body.clinicalNotes.trim() === "") {
    return NextResponse.json({ error: "clinicalNotes is required" }, { status: 400 });
  }
  const prescriptions = body.prescriptions ?? [];
  const invalidPrescription = prescriptions.find(
    (rx) => !rx.medicationName?.trim() || !rx.dosage?.trim() || !rx.frequency?.trim()
  );
  if (invalidPrescription) {
    return NextResponse.json(
      { error: "Each prescription requires medicationName, dosage, and frequency" },
      { status: 400 }
    );
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { doctor: { select: { userId: true } } },
  });
  // Row-level RBAC: only the assigned doctor may submit notes for this
  // appointment.
  if (!appointment || appointment.doctor.userId !== session.sub) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const { visitNote, createdPrescriptions } = await prisma.$transaction(async (tx) => {
    const note = await tx.visitNote.upsert({
      where: { appointmentId: appointment.id },
      create: { appointmentId: appointment.id, clinicalNotes: body.clinicalNotes! },
      update: { clinicalNotes: body.clinicalNotes!, status: LlmJobStatus.PENDING, errorMessage: null },
    });

    const created = [];
    for (const rx of prescriptions) {
      const record = await tx.prescription.create({
        data: {
          appointmentId: appointment.id,
          medicationName: rx.medicationName!.trim(),
          dosage: rx.dosage!.trim(),
          frequency: rx.frequency!.trim(),
          durationDays: rx.durationDays ?? null,
          instructions: rx.instructions?.trim() || null,
        },
      });
      created.push(record);

      const schedule = computeReminderSchedule(appointment.slotStart, record.frequency, record.durationDays);
      if (schedule.length > 0) {
        await tx.medicationReminder.createMany({
          data: schedule.map((scheduledAt) => ({ prescriptionId: record.id, scheduledAt })),
        });
      }
    }

    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.COMPLETED },
    });

    return { visitNote: note, createdPrescriptions: created };
  });

  try {
    await getLlmQueue().add("llm-job", { kind: "POST_VISIT_SUMMARY", appointmentId: appointment.id });
  } catch (err) {
    // Same reasoning as app/api/appointments/book/route.ts: the notes/
    // prescriptions already committed successfully, so a queueing hiccup here
    // must not turn this into a 500. VisitNote.status stays PENDING and can be
    // retried by a future reconciliation pass.
    console.error("Failed to enqueue post-visit summary job", err);
  }

  return NextResponse.json({ visitNote, prescriptions: createdPrescriptions }, { status: 201 });
}
