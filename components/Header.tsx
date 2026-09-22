import Link from "next/link";

import { getAdminAccess } from "@/lib/admin-access";
import LogoutButton from "@/components/LogoutButton";
import BottomNavigation from "@/components/ui/BottomNavigation";
import KreLogo from "@/components/KreLogo";

export default async function Header() {
  const access = await getAdminAccess();
  const user = access !== null;
  const isManager = access?.isManager ?? false;
  const isClubAdmin = isManager || (access?.managedClubIds.length ?? 0) > 0;
  const canScan = access?.canScanAnyClub ?? false;

  return (
    <>
      <header className="border-b border-white/[0.07] bg-ink">
        <div className="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">

          <Link
            href="/"
            aria-label="K-RÉ — Accueil"
            className="group shrink-0"
          >
            <KreLogo variant="header" />
          </Link>

          <nav
            aria-label="Navigation principale"
            className="hidden items-center gap-7 lg:flex"
          >
            <Link
              href="/events"
              className="text-sm text-muted transition hover:text-cream"
            >
              Explorer
            </Link>

            {user && (
              <Link
                href="/reservations"
                className="text-sm text-muted transition hover:text-cream"
              >
                Réservations
              </Link>
            )}

            {user && isClubAdmin && (
              <Link
                href="/admin"
                className="text-sm text-muted transition hover:text-cream"
              >
                Admin
              </Link>
            )}

            {user && canScan && (
              <Link
                href="/admin/scan"
                className="text-sm text-muted transition hover:text-cream"
              >
                Scanner
              </Link>
            )}

            {user && isManager && (
              <Link
                href="/manager"
                className="text-sm text-muted transition hover:text-cream"
              >
                Manager
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-4">

            <span className="hidden items-center gap-1.5 text-sm text-muted lg:inline-flex">
              Paris
              <span
                aria-hidden="true"
                className="text-xs text-champagne"
              >
                ⌄
              </span>
            </span>

            {!user ? (
              <Link
                href="/login"
                className="rounded-full border border-white/[0.14] px-4 py-2 text-sm font-medium text-cream transition hover:border-white/30"
              >
                Se connecter
              </Link>
            ) : (
              <LogoutButton />
            )}

          </div>

        </div>
      </header>

      <BottomNavigation
        authenticated={user}
        isClubAdmin={isClubAdmin}
        canScan={canScan}
        isManager={isManager}
      />
    </>
  );
}
