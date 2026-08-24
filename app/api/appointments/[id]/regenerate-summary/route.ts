import { NextRequest, NextResponse } from "next/server";
import { LlmJobStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getLlmQueue } from "@/lib/queue/queues";

type SummaryType = "PRE_VISIT" | "POST_VISIT";

interface RegenerateBody {
  type?: SummaryType;
}

// POST /api/appointments/[id]/regenerate-summary
// Manual trigger for the two LLM jobs (see lib/llm/gemini.ts) — both normally
// fire automatically (booking with symptoms enqueues PRE_VISIT, submitting
// visit notes enqueues POST_VISIT), but there was previously no way to retry
// one from the UI if it landed in FAILED (e.g. Gemini was rate-limited, or the
// worker process wasn't running at the time). Doctor-only: the doctor is the
// one reviewing both summaries.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(request, [Role.DOCTOR]);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  let body: RegenerateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.type !== "PRE_VISIT" && body.type !== "POST_VISIT") {
    return NextResponse.json({ error: 'type must be "PRE_VISIT" or "POST_VISIT"' }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { doctor: { select: { userId: true } }, visitNote: true },
  });
  // Row-level RBAC: only the assigned doctor may trigger this for this appointment.
  if (!appointment || appointment.doctor.userId !== session.sub) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (body.type === "PRE_VISIT") {
    if (!appointment.symptomText) {
      return NextResponse.json(
        { error: "This appointment has no symptom text to analyse" },
        { status: 400 }
      );
    }
    // Flip to PENDING immediately so the UI reflects "generating" without
    // waiting for the worker to pick the job up.
    await prisma.symptomAnalysis.upsert({
      where: { appointmentId: appointment.id },
      create: { appointmentId: appointment.id, status: LlmJobStatus.PENDING },
      update: { status: LlmJobStatus.PENDING, errorMessage: null },
    });
    await getLlmQueue().add("llm-job", { kind: "PRE_VISIT_ANALYSIS", appointmentId: appointment.id });
  } else {
    if (!appointment.visitNote) {
      return NextResponse.json(
        { error: "This appointment has no visit notes to summarise yet" },
        { status: 400 }
      );
    }
    await prisma.visitNote.update({
      where: { appointmentId: appointment.id },
      data: { status: LlmJobStatus.PENDING, errorMessage: null },
    });
    await getLlmQueue().add("llm-job", { kind: "POST_VISIT_SUMMARY", appointmentId: appointment.id });
  }

  return NextResponse.json({ ok: true });
}
