import "server-only";

/**
 * Calculs financiers K-RÉ — nouveau modèle (paiement intégral).
 *
 * Source de vérité réelle : les RPC SQL `create_full_payment_reservation`
 * et `confirm_full_payment_reservation` (supabase/migrations/...), qui
 * recalculent tout côté serveur PostgreSQL au moment de la création de la
 * réservation — jamais depuis le montant envoyé par le navigateur.
 *
 * Ce module TypeScript est un MIROIR de cette même logique, utilisé
 * uniquement pour :
 *  - l'affichage avant paiement (CheckoutClient) ;
 *  - les tests unitaires (voir tests/pricing.test.mjs).
 * Il ne doit jamais être la source d'un montant réellement facturé.
 *
 * Tout est en centimes (entiers) : jamais de flottants sur des montants.
 * Les taux sont en basis points (1500 = 15 %, 275 = 2,75 %).
 */

export function computeServiceFeeCents(
  vipSubtotalCents: number,
  serviceFeeBps: number,
  serviceFeeMinimumCents: number
): number {
  const computed = Math.round((vipSubtotalCents * serviceFeeBps) / 10000);
  return Math.max(computed, serviceFeeMinimumCents);
}

export function computeCommissionSplit(
  vipSubtotalCents: number,
  commissionBps: number
): { commissionCents: number; clubNetCents: number } {
  const commissionCents = Math.round((vipSubtotalCents * commissionBps) / 10000);
  return {
    commissionCents,
    clubNetCents: vipSubtotalCents - commissionCents,
  };
}

export type FullPaymentBreakdown = {
  vipSubtotalCents: number;
  serviceFeeCents: number;
  totalCustomerCents: number;
  commissionCents: number;
  clubNetCents: number;
};

export function computeFullPaymentBreakdown(params: {
  pricePerPersonCents: number;
  quantity: number;
  serviceFeeBps: number;
  serviceFeeMinimumCents: number;
  commissionBps: number;
}): FullPaymentBreakdown {
  const vipSubtotalCents = params.pricePerPersonCents * params.quantity;
  const serviceFeeCents = computeServiceFeeCents(
    vipSubtotalCents,
    params.serviceFeeBps,
    params.serviceFeeMinimumCents
  );
  const { commissionCents, clubNetCents } = computeCommissionSplit(
    vipSubtotalCents,
    params.commissionBps
  );

  return {
    vipSubtotalCents,
    serviceFeeCents,
    totalCustomerCents: vipSubtotalCents + serviceFeeCents,
    commissionCents,
    clubNetCents,
  };
}

export function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatCentsAsEuros(cents: number): string {
  return `${centsToEuros(cents).toFixed(2)} €`;
}
