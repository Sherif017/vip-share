import Link from "next/link";
import AdminEventList from "@/components/AdminEventList";
import { redirect } from "next/navigation";

import {
  getAdminAccess,
} from "@/lib/admin-access";

import { supabaseAdmin } from "@/lib/supabase-admin";
import StripeConnectStatusCard from "@/components/manager/StripeConnectStatusCard";

type Club = {
  id: string;
  name: string;
  city: string;
};

type VipOffer = {
  id: string;
  table_number: string;
  capacity: number;
  confirmation_threshold: number;
  spots_reserved: number;
  status: string;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  status: string;

  clubs:
    | Club
    | Club[]
    | null;

  vip_offers:
    | VipOffer[]
    | null;
};

export default async function AdminPage() {
  // ==========================================================
  // ACCESS
  // ==========================================================

  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.canManageAnyClub) {
    if (access.canScanAnyClub) {
      redirect("/admin/scan");
    }

    redirect("/events");
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  let query =
    supabaseAdmin
      .from("events")
      .select(`
        id,
        slug,
        name,
        event_date,
        start_time,
        status,

        clubs (
          id,
          name,
          city
        ),

        vip_offers (
          id,
          table_number,
          capacity,
          confirmation_threshold,
          spots_reserved,
          status
        )
      `)
      .order(
        "event_date",
        {
          ascending: false,
        }
      );

  // Club Admin :
  // uniquement ses clubs.
  //
  // Manager :
  // aucune restriction.

  if (!access.isManager) {
    query =
      query.in(
        "club_id",
        access.managedClubIds
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    console.error(
      "Erreur dashboard admin :",
      error
    );
  }

  const events =
    (data ?? []) as unknown as EventItem[];

  // ==========================================================
  // STATS
  // ==========================================================

  // ==========================================================
  // STRIPE CONNECT (clubs gérés par ce compte)
  // ==========================================================

  const stripeClubIds = access.isManager
    ? Array.from(new Set(events.map((event) => (Array.isArray(event.clubs) ? event.clubs[0]?.id : event.clubs?.id)).filter(Boolean)))
    : access.managedClubIds;

  const { data: stripeClubsData } = stripeClubIds.length > 0
    ? await supabaseAdmin
        .from("clubs")
        .select("id, name, stripe_charges_enabled, stripe_onboarding_status")
        .in("id", stripeClubIds as string[])
    : { data: [] };

  const stripeClubs = (stripeClubsData ?? []) as {
    id: string; name: string; stripe_charges_enabled: boolean;
    stripe_onboarding_status: "not_started" | "pending" | "complete";
  }[];

  // ==========================================================
  // UI
  // ==========================================================

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <main className="min-h-screen bg-ink text-cream">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted">
              Espace organisateur
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Mes soirées
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            {access.isManager && (
              <Link
                href="/manager"
                className="rounded-lg px-3 py-3 text-sm text-muted hover:text-cream"
              >
                Manager
              </Link>
            )}

            <Link
              href="/admin/scan"
              className="rounded-lg border border-white/10 px-4 py-3 text-sm transition hover:bg-white/5"
            >
              Scanner
            </Link>

            <Link
              href="/admin/events/new"
              className="kre-primary-cta rounded-lg px-4 py-3 text-sm font-semibold"
            >
              + Créer une soirée
            </Link>
          </div>
        </header>

        {error ? (
          <p role="alert" className="mt-8 rounded-xl border border-red-900/40 p-4 text-sm text-red-400">
            Impossible de charger les soirées. Actualisez la page.
          </p>
        ) : (
          <AdminEventList events={events} today={today} />
        )}

        {stripeClubs.length > 0 && (
          <details
            className="mt-12 border-t border-white/10 pt-5"
            open={stripeClubs.some((c) => !c.stripe_charges_enabled)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm">
              <span className="text-muted">
                Paiements
              </span>

              <span className={
                stripeClubs.every((c) => c.stripe_charges_enabled)
                  ? "text-emerald-400"
                  : "text-amber-400"
              }>
                {stripeClubs.every((c) => c.stripe_charges_enabled)
                  ? "Activés"
                  : "Configuration requise"}
                {" · "}
                <span className="text-zinc-500">Détails</span>
              </span>
            </summary>

            <div className="mt-4 space-y-3">
              {stripeClubs.map((c) => (
                <StripeConnectStatusCard
                  key={c.id}
                  clubId={c.id}
                  clubName={c.name}
                  status={c.stripe_onboarding_status}
                  chargesEnabled={c.stripe_charges_enabled}
                />
              ))}
            </div>
          </details>
        )}

      </div>
    </main>
  );
}
