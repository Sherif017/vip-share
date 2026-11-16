/*
 * Separation TEST / LIVE des objets Stripe.
 *
 * Module pur (aucune dependance) : le mode du serveur est deduit de
 * STRIPE_SECRET_KEY et celui d'une session Checkout de son prefixe
 * (cs_test_ / cs_live_), sans appel reseau ni lecture des donnees.
 */

export type StripeMode = "live" | "test";

export function getServerStripeMode(
  key: string | undefined = process.env.STRIPE_SECRET_KEY
): StripeMode | null {
  if (/^(sk|rk)_live_/.test(key ?? "")) return "live";
  if (/^(sk|rk)_test_/.test(key ?? "")) return "test";
  return null;
}

export function getCheckoutSessionMode(
  sessionId: string | null | undefined
): StripeMode | null {
  const match = /^cs_(live|test)_/.exec(sessionId ?? "");
  return match ? (match[1] as StripeMode) : null;
}

/*
 * Retourne les sessions creees dans un autre mode que celui du serveur.
 * Une liste non vide signifie que l'operation Stripe est impossible
 * (ex. rembourser en LIVE un ancien paiement TEST) et doit etre refusee
 * avant toute ecriture en base ou tout envoi d'email.
 */
export function findForeignModeSessions(
  sessionIds: Array<string | null | undefined>,
  serverMode: StripeMode | null = getServerStripeMode()
): string[] {
  if (!serverMode) return [];
  return sessionIds.filter((id): id is string => {
    const mode = getCheckoutSessionMode(id);
    return mode !== null && mode !== serverMode;
  });
}

export const FOREIGN_MODE_REFUND_ERROR =
  "Ce paiement a été réalisé dans un autre mode Stripe (TEST/LIVE) que celui du serveur : remboursement impossible ici.";
