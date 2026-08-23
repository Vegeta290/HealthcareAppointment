import Link from "next/link";
import { ReactNode } from "react";
import { LogoutButton } from "./LogoutButton";

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
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-brand-700">{portalName}</span>
            <nav className="flex items-center gap-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-slate-600 hover:text-brand-700"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{userEmail}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
