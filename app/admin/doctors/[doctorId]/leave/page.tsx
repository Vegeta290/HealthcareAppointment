import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDoctorDisplayName } from "@/lib/doctors";
import { formatDateOnly } from "@/lib/dateTime";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LeaveForm } from "@/components/shared/LeaveForm";

export default async function DoctorLeavePage({ params }: { params: { doctorId: string } }) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: params.doctorId },
    include: { user: { select: { email: true } } },
  });
  if (!doctor) notFound();

  const leaves = await prisma.doctorLeave.findMany({
    where: { doctorId: doctor.id, status: "ACTIVE" },
    orderBy: { startDate: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={`Leave — Dr. ${getDoctorDisplayName(doctor)}`} description={doctor.specialisation} />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">File leave</h2>
        </CardHeader>
        <CardBody>
          <LeaveForm doctorId={doctor.id} />
        </CardBody>
      </Card>

      {leaves.length === 0 ? (
        <EmptyState title="No leave on file" description="This doctor has no upcoming leave." />
      ) : (
        <div className="space-y-2">
          {leaves.map((leave) => (
            <Card key={leave.id}>
              <CardBody>
                <p className="text-sm font-medium text-slate-900">
                  {formatDateOnly(leave.startDate)} – {formatDateOnly(leave.endDate)}
                </p>
                {leave.reason && <p className="text-sm text-slate-500">{leave.reason}</p>}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
