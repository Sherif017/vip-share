import Link from "next/link";

import { getAdminAccess } from "@/lib/admin-access";
import MobileMenu from "@/components/ui/MobileMenu";
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

          <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
            <Link
              href="/"
              aria-label="K-RÉ — Accueil"
              className="group shrink-0"
            >
              <KreLogo variant="header" />
            </Link>

            <span className="hidden min-[360px]:inline-flex whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.18em] text-champagne sm:text-[11px] sm:tracking-[0.22em]">
              Ta place en VIP.
            </span>
          </div>

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

            {!user && (
              <Link
                href="/login"
                className="rounded-full border border-white/[0.14] px-4 py-2 text-sm font-medium text-cream transition hover:border-white/30"
              >
                Se connecter
              </Link>
            )}

            <MobileMenu
              authenticated={user}
              isClubAdmin={isClubAdmin}
              canScan={canScan}
              isManager={isManager}
            />

          </div>

        </div>
      </header>
    </>
  );
}
