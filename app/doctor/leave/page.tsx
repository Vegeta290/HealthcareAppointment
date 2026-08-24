import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LeaveForm } from "@/components/shared/LeaveForm";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

// Doctor-facing equivalent of app/admin/doctors/[doctorId]/leave/page.tsx —
// same LeaveForm component, but scoped to the signed-in doctor's own profile
// rather than taking a doctorId from the URL. POST /api/doctor-leave already
// enforces that a DOCTOR caller can only file leave for themselves (see
// app/api/doctor-leave/route.ts), so this page just needs to find that
// doctor's own id and hand it to the same form.
export default async function DoctorLeavePage() {
  const session = requireServerSession([Role.DOCTOR]);

  const doctor = await prisma.doctorProfile.findUnique({
    where: { userId: session.sub },
  });
  if (!doctor) notFound();

  const leaves = await prisma.doctorLeave.findMany({
    where: { doctorId: doctor.id, status: "ACTIVE" },
    orderBy: { startDate: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="My leave" description="Time off — existing bookings in the range are cancelled automatically." />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">File leave</h2>
        </CardHeader>
        <CardBody>
          <LeaveForm doctorId={doctor.id} />
        </CardBody>
      </Card>

      {leaves.length === 0 ? (
        <EmptyState title="No leave on file" description="You have no upcoming leave." />
      ) : (
        <div className="space-y-2">
          {leaves.map((leave) => (
            <Card key={leave.id}>
              <CardBody>
                <p className="text-sm font-medium text-slate-900">
                  {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
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
