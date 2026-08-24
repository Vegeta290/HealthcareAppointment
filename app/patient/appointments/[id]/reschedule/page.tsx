import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { getDoctorDisplayName } from "@/lib/doctors";
import { PageHeader } from "@/components/ui/PageHeader";
import { RescheduleFlow } from "@/components/patient/RescheduleFlow";

export default async function RescheduleAppointmentPage({ params }: { params: { id: string } }) {
  const session = requireServerSession([Role.PATIENT]);

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!patientProfile) notFound();

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { doctor: { include: { user: { select: { email: true } } } } },
  });

  // Row-level RBAC: only the owning patient may reschedule this appointment.
  if (!appointment || appointment.patientId !== patientProfile.id) notFound();
  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") notFound();

  return (
    <div>
      <PageHeader
        title={`Reschedule with Dr. ${getDoctorDisplayName(appointment.doctor)}`}
        description="Pick a new slot — your current appointment will be cancelled once the new one is confirmed."
      />
      <RescheduleFlow appointmentId={appointment.id} doctorId={appointment.doctorId} />
    </div>
  );
}
