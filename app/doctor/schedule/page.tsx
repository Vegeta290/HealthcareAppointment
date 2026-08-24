import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { AppointmentStatusBadge } from "@/components/ui/Badge";
import { ScheduleDatePicker } from "@/components/doctor/ScheduleDatePicker";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(start: Date, end: Date): string {
  return `${start.toLocaleString("en-US", { timeStyle: "short", timeZone: "UTC" })} – ${end.toLocaleString(
    "en-US",
    { timeStyle: "short", timeZone: "UTC" }
  )} UTC`;
}

export default async function DoctorSchedulePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = requireServerSession([Role.DOCTOR]);
  const date = searchParams.date ?? todayIsoDate();

  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });
  if (!doctorProfile) notFound();

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: doctorProfile.id,
      slotStart: { gte: dayStart, lt: dayEnd },
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
    },
    include: { patient: { select: { fullName: true } }, symptomAnalysis: true },
    orderBy: { slotStart: "asc" },
  });

  return (
    <div>
      <PageHeader title="Today's schedule" description="Your appointments, with pre-visit AI summaries." />
      <div className="mb-6">
        <ScheduleDatePicker date={date} />
      </div>

      {appointments.length === 0 ? (
        <EmptyState title="No appointments" description="Nothing scheduled for this date." />
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <Link key={appt.id} href={`/doctor/appointments/${appt.id}`}>
              <Card className="transition-all duration-150 hover:shadow-card-hover hover:-translate-y-0.5">
                <CardBody className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{appt.patient.fullName}</p>
                    <p className="text-sm text-slate-500">{formatTime(appt.slotStart, appt.slotEnd)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {appt.symptomAnalysis?.urgencyLevel && (
                      <span className="text-xs text-slate-500">
                        {appt.symptomAnalysis.urgencyLevel} urgency
                      </span>
                    )}
                    <AppointmentStatusBadge status={appt.status} />
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
