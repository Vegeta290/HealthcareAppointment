import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CreateDoctorForm } from "@/components/admin/CreateDoctorForm";

export default async function AdminDoctorsPage() {
  const doctors = await prisma.doctorProfile.findMany({
    include: { user: { select: { email: true } }, workingHours: true },
    orderBy: { specialisation: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Doctors" description="Manage doctor profiles and leave." />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Add a doctor</h2>
        </CardHeader>
        <CardBody>
          <CreateDoctorForm />
        </CardBody>
      </Card>

      {doctors.length === 0 ? (
        <EmptyState title="No doctors yet" description="Add your first doctor profile above." />
      ) : (
        <div className="space-y-3">
          {doctors.map((doctor) => (
            <Card key={doctor.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Dr. {doctor.user.email}</p>
                  <p className="text-sm text-slate-500">
                    {doctor.specialisation} · {doctor.slotDurationMinutes}-minute slots ·{" "}
                    {doctor.workingHours.length} working day(s)/week
                  </p>
                </div>
                <Link
                  href={`/admin/doctors/${doctor.id}/leave`}
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Manage leave →
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
