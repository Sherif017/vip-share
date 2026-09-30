import "server-only";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Stripe Connect — création de compte et onboarding hébergé.
 *
 * Architecture retenue : `controller` (API Accounts actuelle, pas
 * l'ancien raccourci `type: 'express'`), avec K-RÉ (l'"application")
 * payeur des frais Stripe et responsable des litiges — équivalent
 * fonctionnel à un compte Express, dashboard Stripe simplifié pour le
 * club. Vérifié dans la documentation Stripe actuelle avant écriture de
 * ce fichier (Accounts API, paramètre `controller`).
 *
 * `on_behalf_of` : volontairement PAS utilisé sur la Checkout Session au
 * moment du paiement dans ce chantier — see confirmFullPaymentCheckout /
 * full-payment-checkout.ts pour la justification. Ce choix est isolé ici
 * et documenté pour rester ajustable sans réécrire tout le système,
 * conformément à la consigne : la question juridique (club vs K-RÉ comme
 * "business of record") n'est pas tranchée dans ce chantier.
 */

const CONNECT_ACCOUNT_TYPE_DOC =
  "https://docs.stripe.com/api/accounts/create";

export async function ensureClubStripeAccount(clubId: string) {
  const { data: club, error } = await supabaseAdmin
    .from("clubs")
    .select("id, name, stripe_account_id")
    .eq("id", clubId)
    .maybeSingle();

  if (error) throw error;
  if (!club) throw new Error("Club introuvable.");

  if (club.stripe_account_id) {
    return club.stripe_account_id;
  }

  const account = await stripe.accounts.create({
    country: "FR",
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "express" },
    },
    business_profile: {
      name: club.name ?? undefined,
      mcc: "5813", // Drinking places (bars, discotheques) — code MCC standard le plus proche de l'activité club/nightlife.
    },
  });

  const { error: updateError } = await supabaseAdmin
    .from("clubs")
    .update({
      stripe_account_id: account.id,
      stripe_onboarding_status: "pending",
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("id", clubId)
    .is("stripe_account_id", null); // évite d'écraser un id créé entre-temps par une requête concurrente

  if (updateError) throw updateError;

  return account.id;
}

export async function createOnboardingLink(params: {
  stripeAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}) {
  const link = await stripe.accountLinks.create({
    account: params.stripeAccountId,
    type: "account_onboarding",
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
  });

  return link.url;
}

/**
 * Relit l'état réel d'un compte connecté directement depuis Stripe (pas
 * depuis notre cache DB) — utilisé pour resynchroniser après retour
 * d'onboarding, en complément du webhook account.updated qui reste la
 * source de vérité principale et peut arriver avant ou après le retour
 * navigateur.
 */
export async function syncClubStripeAccountStatus(stripeAccountId: string) {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return applyStripeAccountSnapshot(account);
}

export async function applyStripeAccountSnapshot(account: {
  id: string;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
}) {
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  const detailsSubmitted = Boolean(account.details_submitted);

  const onboardingStatus = chargesEnabled
    ? "complete"
    : detailsSubmitted
      ? "pending"
      : "pending";

  const { data, error } = await supabaseAdmin
    .from("clubs")
    .update({
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
      stripe_onboarding_status: onboardingStatus,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id)
    .select("id, name")
    .maybeSingle();

  if (error) throw error;

  // Aucun club trouvé pour ce compte : ne jamais écrire "au hasard" sur
  // un autre club. On journalise et on s'arrête, exactement comme demandé
  // ("incapable de modifier le mauvais club").
  if (!data) {
    console.error("Stripe Connect: compte sans club correspondant", {
      stripeAccountId: account.id,
    });
  }

  return data;
}

export { CONNECT_ACCOUNT_TYPE_DOC };
