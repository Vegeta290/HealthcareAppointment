import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { formatFullSlotRange } from "@/lib/dateTime";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AppointmentStatusBadge, UrgencyBadge } from "@/components/ui/Badge";
import { VisitNoteForm } from "@/components/doctor/VisitNoteForm";
import { GenerateSummaryButton } from "@/components/doctor/GenerateSummaryButton";

export default async function DoctorAppointmentDetailPage({ params }: { params: { id: string } }) {
  const session = requireServerSession([Role.DOCTOR]);

  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!doctorProfile) notFound();

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      symptomAnalysis: true,
      visitNote: true,
      prescriptions: true,
    },
  });

  // Row-level RBAC: only the assigned doctor may view this appointment.
  if (!appointment || appointment.doctorId !== doctorProfile.id) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={appointment.patient.fullName}
        description={formatFullSlotRange(appointment.slotStart, appointment.slotEnd)}
        actions={<AppointmentStatusBadge status={appointment.status} />}
      />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Pre-visit AI summary</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {!appointment.symptomText ? (
            <p className="text-sm text-slate-500">Patient didn&apos;t submit a symptom form before booking.</p>
          ) : !appointment.symptomAnalysis || appointment.symptomAnalysis.status === "PENDING" ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                {appointment.symptomAnalysis ? "AI summary is being generated." : "No AI summary yet."} Raw
                symptoms reported:
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{appointment.symptomText}</p>
            </div>
          ) : appointment.symptomAnalysis.status === "FAILED" ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-700">
                Automatic analysis failed{appointment.symptomAnalysis.errorMessage ? ` (${appointment.symptomAnalysis.errorMessage})` : ""}.
                Raw symptoms reported by the patient:
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{appointment.symptomText}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {appointment.symptomAnalysis.urgencyLevel && (
                  <UrgencyBadge level={appointment.symptomAnalysis.urgencyLevel} />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Chief complaint</p>
                <p className="text-sm text-slate-600">{appointment.symptomAnalysis.chiefComplaint}</p>
              </div>
              {appointment.symptomAnalysis.suggestedQuestions.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700">Suggested questions</p>
                  <ul className="list-inside list-disc text-sm text-slate-600">
                    {appointment.symptomAnalysis.suggestedQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="text-sm text-slate-500">
                <summary className="cursor-pointer">Raw symptoms reported</summary>
                <p className="mt-1 whitespace-pre-wrap">{appointment.symptomText}</p>
              </details>
            </div>
          )}
          {appointment.symptomText && (
            <GenerateSummaryButton
              appointmentId={appointment.id}
              type="PRE_VISIT"
              label={
                !appointment.symptomAnalysis
                  ? "Generate AI summary"
                  : appointment.symptomAnalysis.status === "COMPLETED"
                    ? "Regenerate AI summary"
                    : "Retry AI summary"
              }
            />
          )}
        </CardBody>
      </Card>

      {appointment.status === "COMPLETED" ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Visit notes (submitted)</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{appointment.visitNote?.clinicalNotes}</p>
            {appointment.prescriptions.length > 0 && (
              <ul className="space-y-1 text-sm text-slate-600">
                {appointment.prescriptions.map((rx) => (
                  <li key={rx.id}>
                    {rx.medicationName} — {rx.dosage}, {rx.frequency}
                    {rx.durationDays ? ` for ${rx.durationDays} days` : ""}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <p className="mb-1 text-xs text-slate-500">
                Patient-friendly summary:{" "}
                {appointment.visitNote?.status === "COMPLETED"
                  ? "generated"
                  : appointment.visitNote?.status === "FAILED"
                    ? `failed${appointment.visitNote.errorMessage ? ` (${appointment.visitNote.errorMessage})` : ""}`
                    : "pending"}
              </p>
              <GenerateSummaryButton
                appointmentId={appointment.id}
                type="POST_VISIT"
                label={appointment.visitNote?.status === "COMPLETED" ? "Regenerate AI summary" : "Retry AI summary"}
              />
            </div>
          </CardBody>
        </Card>
      ) : appointment.status === "CANCELLED" ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">This appointment was cancelled.</p>
          </CardBody>
        </Card>
      ) : (
        <VisitNoteForm appointmentId={appointment.id} />
      )}
    </div>
  );
}
