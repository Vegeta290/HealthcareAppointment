import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDoctorDisplayName } from "@/lib/doctors";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DoctorSearchBar } from "@/components/patient/DoctorSearchBar";

export default async function DoctorSearchPage({
  searchParams,
}: {
  searchParams: { specialisation?: string };
}) {
  const specialisation = searchParams.specialisation?.trim();

  const doctors = await prisma.doctorProfile.findMany({
    where: specialisation
      ? { specialisation: { contains: specialisation, mode: "insensitive" } }
      : undefined,
    include: { user: { select: { email: true } } },
    orderBy: { specialisation: "asc" },
  });

  return (
    <div>
      <PageHeader title="Find a doctor" description="Search by specialisation and book a slot." />
      <div className="mb-6">
        <DoctorSearchBar />
      </div>

      {doctors.length === 0 ? (
        <EmptyState
          title="No doctors found"
          description={specialisation ? `No doctors match "${specialisation}".` : "No doctors are registered yet."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {doctors.map((doctor) => (
            <Card key={doctor.id}>
              <CardBody className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Dr. {getDoctorDisplayName(doctor)}</p>
                  <p className="text-sm text-slate-500">{doctor.specialisation}</p>
                  {doctor.bio && <p className="mt-1 text-sm text-slate-500">{doctor.bio}</p>}
                </div>
                <Link href={`/patient/doctors/${doctor.id}/book`} className="self-start">
                  <Button variant="secondary">Book appointment</Button>
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
