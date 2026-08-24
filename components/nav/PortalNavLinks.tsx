"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PortalNavLink } from "./PortalShell";

// Split out from PortalShell (a server component) because knowing which link
// is "active" needs usePathname(), a client-only hook.
export function PortalNavLinks({ links }: { links: PortalNavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
