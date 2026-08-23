import { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requireServerSession } from "@/lib/serverSession";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/nav/PortalShell";

// Every page under this layout reads per-session, per-request data straight
// from Prisma (see the "Server Components fetch via prisma directly" note in
// the pages themselves). Forcing dynamic rendering here — rather than relying
// on Next's implicit cookies()-usage detection — stops Next from speculatively
// attempting to statically prerender any nested page at build time, which
// would otherwise try to hit a real database during `next build`.
export const dynamic = "force-dynamic";

const NAV_LINKS = [{ href: "/admin/doctors", label: "Doctors" }];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = requireServerSession([Role.ADMIN]);
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { email: true } });

  return (
    <PortalShell portalName="Admin Portal" links={NAV_LINKS} userEmail={user?.email ?? ""}>
      {children}
    </PortalShell>
  );
}
