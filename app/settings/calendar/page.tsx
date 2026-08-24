import Link from "next/link";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { PageHeader, Alert } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConnectCalendarButton, DisconnectCalendarButton } from "@/components/settings/CalendarConnection";

// Not nested under /patient, /doctor, or /admin — all three roles can reach
// this page (it's where the "Connect Google Calendar" nav link in each portal
// points), so it does its own session check here instead of inheriting a
// portal layout's RBAC gate.
export const dynamic = "force-dynamic";

const PORTAL_HOME: Record<Role, string> = {
  [Role.PATIENT]: "/patient/dashboard",
  [Role.DOCTOR]: "/doctor/schedule",
  [Role.ADMIN]: "/admin/doctors",
};

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = requireServerSession([Role.PATIENT, Role.DOCTOR, Role.ADMIN]);

  const credential = await prisma.googleCalendarCredential.findUnique({
    where: { userId: session.sub },
    select: { calendarId: true, updatedAt: true },
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href={PORTAL_HOME[session.role]} className="text-sm text-brand-600 hover:underline">
        ← Back
      </Link>

      <PageHeader
        title="Google Calendar"
        description="Connect your Google account so bookings, reschedules, and cancellations sync to your calendar automatically."
      />

      {searchParams.status === "connected" && (
        <div className="mb-4">
          <Alert tone="success">Google Calendar connected successfully.</Alert>
        </div>
      )}
      {searchParams.status === "denied" && (
        <div className="mb-4">
          <Alert>Google sign-in was cancelled or denied — nothing was connected.</Alert>
        </div>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Status: {credential ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
            </p>
            {credential && (
              <p className="mt-1 text-sm text-slate-500">
                Syncing to calendar &quot;{credential.calendarId}&quot;. Last token refresh:{" "}
                {credential.updatedAt.toLocaleString()}.
              </p>
            )}
            {!credential && (
              <p className="mt-1 text-sm text-slate-500">
                No events will be created until you connect an account.
              </p>
            )}
          </div>
          {credential ? <DisconnectCalendarButton /> : <ConnectCalendarButton />}
        </CardBody>
      </Card>
    </div>
  );
}
