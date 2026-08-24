import { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/nav/PortalShell";

// See the comment on app/admin/layout.tsx's `dynamic` export — same reasoning
// applies here.
export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { href: "/doctor/schedule", label: "Today's schedule" },
  { href: "/doctor/leave", label: "My leave" },
  { href: "/settings/calendar", label: "Calendar sync" },
];

export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const session = requireServerSession([Role.DOCTOR]);
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { email: true } });

  return (
    <PortalShell portalName="Doctor Portal" links={NAV_LINKS} userEmail={user?.email ?? ""}>
      {children}
    </PortalShell>
  );
}
