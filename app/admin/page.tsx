import Link from "next/link";
import { isStripeOAuthEnabled } from "@/lib/stripe-oauth";
import AdminEventList from "@/components/AdminEventList";
import { redirect } from "next/navigation";

import {
  getAdminAccess,
  canManageClub,
} from "@/lib/admin-access";

import { syncClubStripeAccountStatus } from "@/lib/stripe-connect";

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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    stripe_oauth?: string | string[];
    stripe?: string | string[];
    club_id?: string | string[];
  }>;
}) {
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

  const params = await searchParams;

  const expressAction =
    typeof params.stripe === "string"
      ? params.stripe
      : "";

  const expressClubId =
    typeof params.club_id === "string"
      ? params.club_id
      : "";

  let expressMessage: string | null = null;

  const validExpressClub =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      expressClubId
    ) && canManageClub(access, expressClubId);

  if (
    validExpressClub &&
    (expressAction === "return" || expressAction === "refresh")
  ) {
    if (expressAction === "refresh") {
      expressMessage =
        "Votre lien Stripe a expiré. Cliquez sur Reprendre mon inscription pour obtenir un nouveau lien.";
    } else {
      try {
        const { data: club, error: clubError } =
          await supabaseAdmin
            .from("clubs")
            .select("stripe_account_id, stripe_connection_type")
            .eq("id", expressClubId)
            .single();

        if (clubError) throw clubError;

        if (
          club?.stripe_account_id &&
          club.stripe_connection_type !== "oauth"
        ) {
          await syncClubStripeAccountStatus(
            club.stripe_account_id
          );

          expressMessage =
            "Votre statut Stripe a été actualisé. Consultez la rubrique Paiements.";
        }
      } catch (error) {
        console.error("Synchronisation du retour Stripe impossible", {
          clubId: expressClubId,
          message:
            error instanceof Error
              ? error.message
              : "Erreur inconnue",
        });

        expressMessage =
          "La vérification Stripe est temporairement indisponible. Veuillez actualiser cette page dans quelques instants.";
      }
    }
  }

  const stripeClubIds = access.isManager
    ? Array.from(new Set(events.map((event) => (Array.isArray(event.clubs) ? event.clubs[0]?.id : event.clubs?.id)).filter(Boolean)))
    : access.managedClubIds;

  const visibleStripeClubIds = Array.from(
    new Set([
      ...stripeClubIds,
      ...(validExpressClub &&
      (expressAction === "return" || expressAction === "refresh")
        ? [expressClubId]
        : []),
    ])
  );

  const { data: stripeClubsData } = visibleStripeClubIds.length > 0
    ? await supabaseAdmin
        .from("clubs")
        .select("id, name, stripe_charges_enabled, stripe_onboarding_status, stripe_connection_type, stripe_oauth_revoked_at")
        .in("id", visibleStripeClubIds as string[])
    : { data: [] };

  const stripeClubs = (stripeClubsData ?? []) as {
    id: string; name: string; stripe_charges_enabled: boolean;
    stripe_onboarding_status: "not_started" | "pending" | "complete";
    stripe_connection_type: "express" | "oauth" | null;
    stripe_oauth_revoked_at: string | null;
  }[];

  // ==========================================================
  // UI
  // ==========================================================

  const oauthEnabled = isStripeOAuthEnabled();

  const oauthMessages: Record<string, string> = {
    success: "Votre compte Stripe a bien été associé à K-RÉ.",
    cancelled: "La connexion Stripe a été annulée.",
    invalid_state: "Votre session de connexion a expiré. Veuillez réessayer.",
    unauthorized: "Vous n'êtes pas autorisé à effectuer cette opération.",
    incompatible: "Ce compte Stripe ne répond pas aux conditions requises. Contactez K-RÉ.",
    already_connected: "Un compte Stripe est déjà associé à ce club.",
    not_eligible: "Ce club ne peut pas modifier son compte Stripe actuellement.",
    account_changed: "La configuration Stripe a changé. Veuillez réessayer.",
    account_in_use: "Ce compte Stripe est déjà associé à un autre club.",
    disabled: "La connexion Stripe est temporairement indisponible.",
    wrong_account: "Veuillez reconnecter le compte Stripe initialement associé à votre établissement.",
    failed: "La connexion Stripe a échoué. Veuillez réessayer.",
  };

  const oauthStatus =
    typeof params.stripe_oauth === "string"
      ? params.stripe_oauth
      : "";

  const oauthMessage = Object.hasOwn(oauthMessages, oauthStatus)
    ? oauthMessages[oauthStatus]
    : undefined;

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

        {expressMessage && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-[#c6a76d]/20 bg-[#c6a76d]/5 p-4 text-sm text-[#c6a76d]"
          >
            {expressMessage}
          </div>
        )}

        {oauthMessage && (
          <div
            role="status"
            className={`mt-6 rounded-xl border p-4 text-sm ${
              oauthStatus === "success"
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                : "border-amber-500/20 bg-amber-500/5 text-amber-400"
            }`}
          >
            {oauthMessage}
          </div>
        )}

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
            open={
              expressMessage !== null ||
              stripeClubs.some((c) => !c.stripe_charges_enabled)
            }
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
                  oauthEnabled={oauthEnabled}
                  connectionType={c.stripe_connection_type}
                  oauthRevoked={Boolean(c.stripe_oauth_revoked_at)}
                />
              ))}
            </div>
          </details>
        )}

      </div>
    </main>
  );
}
