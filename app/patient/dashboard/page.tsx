import Link from "next/link";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { getDoctorDisplayName } from "@/lib/doctors";
import { formatMediumSlotRange } from "@/lib/dateTime";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { AppointmentStatusBadge } from "@/components/ui/Badge";

export default async function PatientDashboardPage() {
  const session = requireServerSession([Role.PATIENT]);

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });

  const appointments = patientProfile
    ? await prisma.appointment.findMany({
        where: { patientId: patientProfile.id },
        include: { doctor: { include: { user: { select: { email: true } } } } },
        orderBy: { slotStart: "desc" },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="My appointments"
        description="Upcoming and past appointments, and their follow-up summaries."
        actions={
          <Link href="/patient/doctors" className="text-sm font-medium text-brand-600 hover:underline">
            Book a new appointment →
          </Link>
        }
      />

      {appointments.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="Search for a doctor to book your first appointment."
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <Link key={appt.id} href={`/patient/appointments/${appt.id}`}>
              <Card className="transition-all duration-150 hover:shadow-card-hover hover:-translate-y-0.5">
                <CardBody className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Dr. {getDoctorDisplayName(appt.doctor)} — {appt.doctor.specialisation}
                    </p>
                    <p className="text-sm text-slate-500">{formatMediumSlotRange(appt.slotStart, appt.slotEnd)}</p>
                  </div>
                  <AppointmentStatusBadge status={appt.status} />
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
