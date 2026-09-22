"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function CompassIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">⌁</span>;
}

function TicketIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">▱</span>;
}

function ShieldIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">◆</span>;
}

function ScanIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">▣</span>;
}

function CrownIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">♛</span>;
}

type NavItem = {
  href: string;
  label: string;
  Icon: () => React.ReactElement;
  isActive: (pathname: string) => boolean;
};

export default function BottomNavigation({
  authenticated = false,
  isClubAdmin = false,
  canScan = false,
  isManager = false,
}: {
  authenticated?: boolean;
  isClubAdmin?: boolean;
  canScan?: boolean;
  isManager?: boolean;
}) {
  const pathname = usePathname() ?? "";

  const items: NavItem[] = [
    {
      href: "/events",
      label: "Explorer",
      Icon: CompassIcon,
      isActive: (p) => p === "/" || p.startsWith("/events"),
    },
    {
      href: authenticated ? "/reservations" : "/login",
      label: "Réservations",
      Icon: TicketIcon,
      isActive: (p) => p.startsWith("/reservations"),
    },
  ];

  /*
   * Le staff (club admin / scanner / manager) n'a pas d'autre moyen
   * d'atteindre ces pages sur mobile : la nav desktop est masquée
   * en dessous de `lg`. On les ajoute donc ici plutôt que de dupliquer
   * un onglet "Profil" qui ne menait nulle part.
   */

  if (authenticated && isClubAdmin) {
    items.push({
      href: "/admin",
      label: "Admin",
      Icon: ShieldIcon,
      isActive: (p) => p.startsWith("/admin") && !p.startsWith("/admin/scan"),
    });
  }

  if (authenticated && canScan) {
    items.push({
      href: "/admin/scan",
      label: "Scanner",
      Icon: ScanIcon,
      isActive: (p) => p.startsWith("/admin/scan"),
    });
  }

  if (authenticated && isManager) {
    items.push({
      href: "/manager",
      label: "Manager",
      Icon: CrownIcon,
      isActive: (p) => p.startsWith("/manager"),
    });
  }

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = item.isActive(pathname);

          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`bottom-nav-link ${active ? "bottom-nav-link-active" : ""}`}
            >
              <item.Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
