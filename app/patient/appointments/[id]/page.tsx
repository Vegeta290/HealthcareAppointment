import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { getDoctorDisplayName } from "@/lib/doctors";
import { formatFullSlotRange } from "@/lib/dateTime";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AppointmentStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default async function PatientAppointmentDetailPage({ params }: { params: { id: string } }) {
  const session = requireServerSession([Role.PATIENT]);

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!patientProfile) notFound();

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      doctor: { include: { user: { select: { email: true } } } },
      visitNote: true,
      prescriptions: true,
    },
  });

  // Row-level RBAC: only the owning patient may view this appointment.
  if (!appointment || appointment.patientId !== patientProfile.id) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Appointment with Dr. ${getDoctorDisplayName(appointment.doctor)}`}
        description={formatFullSlotRange(appointment.slotStart, appointment.slotEnd)}
        actions={
          <div className="flex items-center gap-3">
            {(appointment.status === "PENDING" || appointment.status === "CONFIRMED") && (
              <Link href={`/patient/appointments/${appointment.id}/reschedule`}>
                <Button variant="secondary">Reschedule</Button>
              </Link>
            )}
            <AppointmentStatusBadge status={appointment.status} />
          </div>
        }
      />

      {appointment.status === "CANCELLED" && appointment.cancellationReason && (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-700">
              This appointment was cancelled. Reason: {appointment.cancellationReason}
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Post-visit summary</h2>
        </CardHeader>
        <CardBody>
          {!appointment.visitNote ? (
            <p className="text-sm text-slate-500">
              Your doctor hasn&apos;t submitted visit notes yet. Check back after your appointment.
            </p>
          ) : appointment.visitNote.status === "COMPLETED" ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Summary</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                  {appointment.visitNote.patientSummary}
                </p>
              </div>
              {appointment.visitNote.followUpSteps && (
                <div>
                  <p className="text-sm font-medium text-slate-700">Follow-up steps</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                    {appointment.visitNote.followUpSteps}
                  </p>
                </div>
              )}
            </div>
          ) : appointment.visitNote.status === "FAILED" ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-700">
                We couldn&apos;t generate a simplified summary automatically. Here are your doctor&apos;s raw notes:
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{appointment.visitNote.clinicalNotes}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Your summary is being generated — check back shortly.</p>
          )}
        </CardBody>
      </Card>

      {appointment.prescriptions.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Prescription</h2>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {appointment.prescriptions.map((rx) => (
                <li key={rx.id} className="text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{rx.medicationName}</span> — {rx.dosage},{" "}
                  {rx.frequency}
                  {rx.durationDays ? ` for ${rx.durationDays} days` : ""}
                  {rx.instructions ? ` (${rx.instructions})` : ""}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
