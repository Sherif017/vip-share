import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

import LogoutButton from "./LogoutButton";

export default async function Header() {
  /*
  |--------------------------------------------------------------------------
  | Utilisateur connecté
  |--------------------------------------------------------------------------
  */

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
  |--------------------------------------------------------------------------
  | Vérification admin
  |--------------------------------------------------------------------------
  */

  let isAdmin = false;

  if (user) {
    const { data: profile, error } =
      await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
      console.error(
        "Erreur récupération profil admin :",
        error
      );
    }

    isAdmin = Boolean(profile?.is_admin);
  }

  /*
  |--------------------------------------------------------------------------
  | Header
  |--------------------------------------------------------------------------
  */

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

        {/* LOGO */}

        <Link
          href="/"
          className="text-lg font-bold tracking-[0.18em] text-white transition hover:text-zinc-300"
        >
          VIP SHARE
        </Link>

        {/* VISITEUR NON CONNECTÉ */}

        {!user ? (
          <div className="flex items-center gap-3">

            <Link
              href="/login"
              className="hidden text-sm font-medium text-zinc-400 transition hover:text-white sm:block"
            >
              Se connecter
            </Link>

            <Link
              href="/register"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Créer un compte
            </Link>

          </div>
        ) : (
          /*
          |--------------------------------------------------------------------------
          | MENU UTILISATEUR CONNECTÉ
          |--------------------------------------------------------------------------
          */

          <details className="group relative">

            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition hover:border-white hover:bg-white/5">
              Menu

              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-4 w-4 transition duration-200 group-open:rotate-180"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>

            <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">

              {/* UTILISATEUR */}

              <div className="border-b border-zinc-800 px-5 py-4">
                <p className="text-xs uppercase tracking-wider text-zinc-600">
                  Mon compte
                </p>

                <p className="mt-1 truncate text-sm text-zinc-300">
                  {user.email}
                </p>
              </div>

              {/* NAVIGATION */}

              <div className="p-2">

                <Link
                  href="/events"
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                >
                  <span>Soirées</span>
                  <span className="text-zinc-600">→</span>
                </Link>

                <Link
                  href="/reservations"
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                >
                  <span>Mes réservations</span>
                  <span className="text-zinc-600">→</span>
                </Link>

                {/* ADMIN */}

                {isAdmin && (
                  <>
                    <div className="my-2 border-t border-zinc-800" />

                    <p className="px-4 py-2 text-xs uppercase tracking-wider text-zinc-600">
                      Administration
                    </p>

                    <Link
                      href="/admin"
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <span>Dashboard admin</span>
                      <span className="text-zinc-600">→</span>
                    </Link>

                    <Link
                      href="/admin/scan"
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <span>Scanner un pass</span>
                      <span className="text-zinc-600">→</span>
                    </Link>
                  </>
                )}

              </div>

              {/* LOGOUT */}

              <div className="border-t border-zinc-800 p-3">
                <LogoutButton />
              </div>

            </div>

          </details>
        )}
      </div>
    </header>
  );
}