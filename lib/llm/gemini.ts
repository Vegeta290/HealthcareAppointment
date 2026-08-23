import { GoogleGenerativeAI } from "@google/generative-ai";
import { LlmJobStatus, UrgencyLevel } from "@prisma/client";
import { prisma } from "../prisma";

const MODEL_NAME = "gemini-1.5-flash";
const PRE_VISIT_PROMPT_VERSION = "pre-visit-v1";
const POST_VISIT_PROMPT_VERSION = "post-visit-v1";

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

// Strips ```json ... ``` fences some models wrap responses in, despite being
// told not to.
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  return JSON.parse(candidate);
}

function buildPreVisitPrompt(symptoms: string): string {
  return [
    "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor.",
    `Symptoms: ${symptoms}`,
    "",
    "Respond with ONLY a JSON object matching exactly this shape, no prose, no markdown fences:",
    '{"urgencyLevel": "LOW" | "MEDIUM" | "HIGH", "chiefComplaint": string, "suggestedQuestions": [string, string, string]}',
  ].join("\n");
}

function buildPostVisitPrompt(notes: string): string {
  return [
    "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps.",
    `Notes: ${notes}`,
    "",
    "Respond with ONLY a JSON object matching exactly this shape, no prose, no markdown fences:",
    '{"patientSummary": string, "followUpSteps": string}',
  ].join("\n");
}

interface PreVisitResult {
  urgencyLevel: UrgencyLevel;
  chiefComplaint: string;
  suggestedQuestions: string[];
}

function parsePreVisitResponse(raw: string): PreVisitResult {
  const parsed = extractJson(raw) as Record<string, unknown>;

  const urgencyRaw = String(parsed.urgencyLevel ?? "").toUpperCase();
  if (!["LOW", "MEDIUM", "HIGH"].includes(urgencyRaw)) {
    throw new Error(`Model returned an invalid urgencyLevel: ${JSON.stringify(parsed.urgencyLevel)}`);
  }

  const chiefComplaint = parsed.chiefComplaint;
  if (typeof chiefComplaint !== "string" || chiefComplaint.trim() === "") {
    throw new Error("Model response missing chiefComplaint");
  }

  const suggestedQuestions = parsed.suggestedQuestions;
  if (!Array.isArray(suggestedQuestions) || suggestedQuestions.length === 0) {
    throw new Error("Model response missing suggestedQuestions");
  }

  return {
    urgencyLevel: urgencyRaw as UrgencyLevel,
    chiefComplaint,
    suggestedQuestions: suggestedQuestions.slice(0, 3).map(String),
  };
}

interface PostVisitResult {
  patientSummary: string;
  followUpSteps: string;
}

function parsePostVisitResponse(raw: string): PostVisitResult {
  const parsed = extractJson(raw) as Record<string, unknown>;

  const patientSummary = parsed.patientSummary;
  const followUpSteps = parsed.followUpSteps;
  if (typeof patientSummary !== "string" || patientSummary.trim() === "") {
    throw new Error("Model response missing patientSummary");
  }
  if (typeof followUpSteps !== "string") {
    throw new Error("Model response missing followUpSteps");
  }

  return { patientSummary, followUpSteps };
}

// Generates the pre-visit urgency/chief-complaint/questions summary for an
// appointment's symptomText and upserts the result onto SymptomAnalysis. Never
// throws — an LLM or parsing failure is recorded as status FAILED with
// errorMessage so the doctor-facing UI can fall back to the raw symptomText
// instead of the request/job breaking (per the "LLM failures must be handled
// gracefully" requirement).
export async function generateSymptomAnalysis(appointmentId: string): Promise<void> {
  const existing = await prisma.symptomAnalysis.findUnique({ where: { appointmentId } });

  await prisma.symptomAnalysis.upsert({
    where: { appointmentId },
    create: { appointmentId, status: LlmJobStatus.PENDING, attempts: 1 },
    update: { status: LlmJobStatus.PENDING, attempts: (existing?.attempts ?? 0) + 1 },
  });

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { symptomText: true },
  });

  if (!appointment?.symptomText) {
    await prisma.symptomAnalysis.update({
      where: { appointmentId },
      data: { status: LlmJobStatus.FAILED, errorMessage: "No symptomText on appointment" },
    });
    return;
  }

  try {
    const model = getClient().getGenerativeModel({ model: MODEL_NAME });
    const prompt = buildPreVisitPrompt(appointment.symptomText);
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
    const parsed = parsePreVisitResponse(rawText);

    await prisma.symptomAnalysis.update({
      where: { appointmentId },
      data: {
        status: LlmJobStatus.COMPLETED,
        urgencyLevel: parsed.urgencyLevel,
        chiefComplaint: parsed.chiefComplaint,
        suggestedQuestions: parsed.suggestedQuestions,
        rawModelResponse: { text: rawText },
        model: MODEL_NAME,
        promptVersion: PRE_VISIT_PROMPT_VERSION,
        errorMessage: null,
      },
    });
  } catch (err) {
    await prisma.symptomAnalysis.update({
      where: { appointmentId },
      data: {
        status: LlmJobStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// Generates the patient-friendly post-visit summary from VisitNote.clinicalNotes
// and updates the same VisitNote row. Same graceful-failure contract as
// generateSymptomAnalysis above: never throws, records FAILED + errorMessage so
// the patient sees the doctor's raw notes (or a "summary pending" state) instead
// of a broken page.
export async function generatePostVisitSummary(appointmentId: string): Promise<void> {
  const visitNote = await prisma.visitNote.findUnique({ where: { appointmentId } });
  if (!visitNote) {
    return; // nothing to summarise yet — doctor hasn't submitted notes
  }

  await prisma.visitNote.update({
    where: { appointmentId },
    data: { status: LlmJobStatus.PENDING, attempts: { increment: 1 } },
  });

  try {
    const model = getClient().getGenerativeModel({ model: MODEL_NAME });
    const prompt = buildPostVisitPrompt(visitNote.clinicalNotes);
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
    const parsed = parsePostVisitResponse(rawText);

    await prisma.visitNote.update({
      where: { appointmentId },
      data: {
        status: LlmJobStatus.COMPLETED,
        patientSummary: parsed.patientSummary,
        followUpSteps: parsed.followUpSteps,
        rawModelResponse: { text: rawText },
        model: MODEL_NAME,
        promptVersion: POST_VISIT_PROMPT_VERSION,
        errorMessage: null,
      },
    });
  } catch (err) {
    await prisma.visitNote.update({
      where: { appointmentId },
      data: {
        status: LlmJobStatus.FAILED,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
