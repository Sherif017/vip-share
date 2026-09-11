import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

import LogoutButton from "./LogoutButton";

export default async function Header() {
  /*
  |--------------------------------------------------------------------------
  | 1. Récupérer l'utilisateur connecté
  |--------------------------------------------------------------------------
  */

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
  |--------------------------------------------------------------------------
  | 2. Vérifier si l'utilisateur est admin
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
  | 3. Header
  |--------------------------------------------------------------------------
  */

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}

        <Link
          href="/"
          className="text-lg font-bold tracking-[0.18em] text-white transition hover:text-zinc-300"
        >
          VIP SHARE
        </Link>

        {/* Navigation */}

        <nav className="flex items-center gap-3">
          {user ? (
            <>
              {/* Soirées */}

              <Link
                href="/events"
                className="hidden text-sm font-medium text-zinc-400 transition hover:text-white sm:block"
              >
                Soirées
              </Link>

              {/* Admin */}

              {isAdmin && (
                <Link
                  href="/admin"
                  className="hidden rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-white hover:text-white md:block"
                >
                  Admin
                </Link>
              )}

              {isAdmin && (
                <Link
                  href="/admin/scan"
                  className="hidden text-sm font-medium text-zinc-400 transition hover:text-white md:block"
                >
                   Scanner
                </Link>
              )}




              {/* Mes réservations */}

              <Link
                href="/reservations"
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-white transition hover:border-white hover:bg-white/5"
              >
                Mes réservations
              </Link>

              {/* Déconnexion */}

              <LogoutButton />
            </>
          ) : (
            <>
              {/* Login */}

              <Link
                href="/login"
                className="text-sm font-medium text-zinc-400 transition hover:text-white"
              >
                Se connecter
              </Link>

              {/* Register */}

              <Link
                href="/register"
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
              >
                Créer un compte
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}