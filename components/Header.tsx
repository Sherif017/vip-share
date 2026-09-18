import Link from "next/link";

import { getAdminAccess } from "@/lib/admin-access";

import LogoutButton from "@/components/LogoutButton";

export default async function Header() {
  const access = await getAdminAccess();
  const user = access !== null;

  const isManager = access?.isManager ?? false;
  const isClubAdmin =
    isManager || (access?.managedClubIds.length ?? 0) > 0;
  const canScan = access?.canScanAnyClub ?? false;

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-4 py-3 sm:px-6 lg:px-8">
        {/* ====================================================
            LOGO
        ==================================================== */}

        <Link
          href="/"
          className="shrink-0 text-xl font-black tracking-tight text-black"
        >
          VIP Share
        </Link>

        {/* ====================================================
            NAVIGATION DESKTOP
        ==================================================== */}

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/events"
            className="text-sm font-medium text-gray-700 transition hover:text-black"
          >
            Soirées
          </Link>

          {user && (
            <Link
              href="/reservations"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              Mes réservations
            </Link>
          )}

          {/* --------------------------------------------------
              ADMIN CLUB
          -------------------------------------------------- */}

          {user && isClubAdmin && (
            <Link
              href="/admin"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              Admin
            </Link>
          )}

          {/* --------------------------------------------------
              SCANNER
          -------------------------------------------------- */}

          {user && canScan && (
            <Link
              href="/admin/scan"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              Scanner
            </Link>
          )}

          {/* --------------------------------------------------
              MANAGER VIP SHARE
          -------------------------------------------------- */}

          {user && isManager && (
            <Link
              href="/manager"
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Manager
            </Link>
          )}
        </nav>

        {/* ====================================================
            AUTH
        ==================================================== */}

        <div className="flex items-center gap-3">
          {!user ? (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 transition hover:text-black"
              >
                Connexion
              </Link>

              <Link
                href="/register"
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Créer un compte
              </Link>
            </>
          ) : (
            <LogoutButton />
          )}
        </div>
      </div>

      {/* ======================================================
          NAVIGATION MOBILE
      ====================================================== */}

      <div className="border-t border-gray-100 md:hidden">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6">
          <Link
            href="/events"
            className="whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700"
          >
            Soirées
          </Link>

          {user && (
            <Link
              href="/reservations"
              className="whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Mes réservations
            </Link>
          )}

          {user && isClubAdmin && (
            <Link
              href="/admin"
              className="whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Admin
            </Link>
          )}

          {user && canScan && (
            <Link
              href="/admin/scan"
              className="whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Scanner
            </Link>
          )}

          {user && isManager && (
            <Link
              href="/manager"
              className="whitespace-nowrap rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white"
            >
              Manager
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
