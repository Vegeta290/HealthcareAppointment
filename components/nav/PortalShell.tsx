import { ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { LogoutButton } from "./LogoutButton";
import { PortalNavLinks } from "./PortalNavLinks";

export interface PortalNavLink {
  href: string;
  label: string;
}

// Shared chrome for all three portals — a top bar with the portal name, nav
// links, the signed-in user's email, and sign-out — so patient/doctor/admin
// layouts only need to supply their own nav links and content.
export function PortalShell({
  portalName,
  links,
  userEmail,
  children,
}: {
  portalName: string;
  links: PortalNavLink[];
  userEmail: string;
  children: ReactNode;
}) {
  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-sm font-semibold text-slate-900">{portalName}</span>
            </div>
            <PortalNavLinks links={links} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {initial}
              </span>
              <span className="hidden text-sm text-slate-500 sm:inline">{userEmail}</span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
