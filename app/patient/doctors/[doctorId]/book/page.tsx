import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDoctorDisplayName } from "@/lib/doctors";
import { PageHeader } from "@/components/ui/PageHeader";
import { BookingFlow } from "@/components/patient/BookingFlow";

export default async function BookDoctorPage({ params }: { params: { doctorId: string } }) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: params.doctorId },
    include: { user: { select: { email: true } } },
  });
  if (!doctor) notFound();

  return (
    <div>
      <PageHeader
        title={`Book with Dr. ${getDoctorDisplayName(doctor)}`}
        description={`${doctor.specialisation} · ${doctor.slotDurationMinutes}-minute appointments`}
      />
      <BookingFlow doctorId={doctor.id} />
    </div>
  );
}
