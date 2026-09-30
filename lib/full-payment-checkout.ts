import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CheckoutRetryError } from "@/lib/initial-checkout";

/**
 * Création de la Checkout Session pour le NOUVEAU modèle (paiement
 * intégral + frais de service K-RÉ). Fichier séparé de
 * lib/initial-checkout.ts — jamais de branchement dans la fonction
 * legacy, qui reste totalement inchangée.
 *
 * Reprend exactement la même architecture de retry-sécurité que
 * initialCheckout (snapshot des params persisté avant tout appel Stripe,
 * idempotency key Stripe déterministe, relecture après chaque écriture,
 * réconciliation par statut de session) — même garanties de non-double
 * paiement, adaptées au nouveau modèle.
 *
 * `on_behalf_of` volontairement absent de la Session ici (voir
 * lib/stripe-connect.ts) : le paiement reste sur le compte plateforme au
 * moment du checkout (cohérent avec Separate Charges and Transfers), la
 * part club n'étant transférée qu'après la soirée (Chantier 2).
 */
export async function fullPaymentCheckout(
  db: SupabaseClient,
  stripe: Stripe,
  reservationId: string,
  userId: string,
  origin: string,
) {
  const read = async () => {
    const { data, error } = await db.from("reservations")
      .select("id,reservation_code,user_id,vip_offer_id,email,quantity,status,created_at,stripe_checkout_session_id,initial_checkout_params,payment_model,events(slug)")
      .eq("id", reservationId).eq("user_id", userId).single();
    if (error || !data) throw new CheckoutRetryError("Impossible de relire la réservation. Réessayez.");
    if (data.payment_model !== "full_payment") {
      throw new CheckoutRetryError("Cette réservation n'utilise pas le nouveau modèle de paiement.", 409);
    }
    return data;
  };

  const readTransaction = async () => {
    const { data, error } = await db.from("payment_transactions")
      .select("vip_subtotal_cents,service_fee_cents,total_customer_cents,currency,status,transfer_group")
      .eq("reservation_id", reservationId).eq("payment_type", "initial").single();
    if (error || !data) throw new CheckoutRetryError("Impossible de relire le montant à payer. Réessayez.");
    return data;
  };

  let reservation = await read();
  const confirmationUrl = `/confirmation/${encodeURIComponent(reservation.reservation_code)}?payment=success`;
  let sessionId: string | null = reservation.stripe_checkout_session_id;

  if (!sessionId) {
    if (!reservation.initial_checkout_params) {
      if (reservation.status !== "pending_payment") {
        throw new CheckoutRetryError("Cette tentative n'est plus payable.", 409);
      }
      const event = Array.isArray(reservation.events)
        ? reservation.events[0]
        : reservation.events;

      if (!event?.slug) {
        throw new CheckoutRetryError("Événement introuvable.", 409);
      }

      const txn = await readTransaction();

      const params: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        payment_method_types: ["card"],
        payment_intent_data: {
          transfer_group: txn.transfer_group,
        },
        customer_email: reservation.email,
        line_items: [
          {
            price_data: {
              currency: txn.currency,
              product_data: {
                name: `K-RÉ — ${event.slug}`,
                description: `${reservation.quantity} place${reservation.quantity > 1 ? "s" : ""} VIP`,
              },
              unit_amount: txn.vip_subtotal_cents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: txn.currency,
              product_data: {
                name: "Frais de service K-RÉ",
              },
              unit_amount: txn.service_fee_cents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          payment_type: "full_payment_initial",
          reservation_id: reservation.id,
          reservation_code: reservation.reservation_code,
          user_id: reservation.user_id,
          event_slug: event.slug,
          vip_offer_id: reservation.vip_offer_id,
          quantity: String(reservation.quantity),
        },
        success_url: `${origin}${confirmationUrl}`,
        cancel_url: `${origin}/checkout/${encodeURIComponent(event.slug)}?table=${encodeURIComponent(reservation.vip_offer_id)}&quantity=${reservation.quantity}&payment=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      };
      const { error } = await db.from("reservations")
        .update({ initial_checkout_params: params })
        .eq("id", reservationId).eq("user_id", userId)
        .eq("status", "pending_payment").is("initial_checkout_params", null);
      if (error) throw new CheckoutRetryError("Impossible de préparer le paiement. Réessayez.");
      reservation = await read();
      sessionId = reservation.stripe_checkout_session_id;
    }

    if (!sessionId) {
      const params = reservation.initial_checkout_params as Stripe.Checkout.SessionCreateParams | null;
      if (!params?.expires_at) throw new CheckoutRetryError("Cette tentative n'est plus payable.", 409);
      if (Date.now() / 1000 >= params.expires_at + 22 * 60 * 60) {
        throw new CheckoutRetryError("Cette tentative nécessite une réconciliation.", 409);
      }
      let created: Stripe.Checkout.Session | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          created = await stripe.checkout.sessions.create(params, {
            idempotencyKey: `full-payment-initial:${reservation.id}`,
          });
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "idempotency_key_in_use" || attempt === 2) {
            throw new CheckoutRetryError("Paiement non résolu. Réessayez la même tentative.");
          }
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
      if (!created) throw new CheckoutRetryError("Paiement non résolu. Réessayez.");
      const { error } = await db.from("reservations")
        .update({ stripe_checkout_session_id: created.id })
        .eq("id", reservationId).eq("user_id", userId)
        .is("stripe_checkout_session_id", null);
      if (error) throw new CheckoutRetryError("Paiement créé, association à réessayer.");
      reservation = await read();
      if (reservation.stripe_checkout_session_id !== created.id) {
        throw new CheckoutRetryError("Association du paiement à vérifier.");
      }
      sessionId = created.id;
    }
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId!);
  if (session.metadata?.reservation_id !== reservation.id) {
    throw new CheckoutRetryError("Session de paiement incompatible.", 409);
  }
  if (session.status === "complete" || session.payment_status === "paid") {
    return confirmationUrl;
  }
  if (session.status === "expired") {
    const { error } = await db.rpc("expire_full_payment_reservation", {
      p_reservation_id: reservationId,
      p_stripe_session_id: sessionId,
    });
    if (error) throw new CheckoutRetryError("Expiration à réconcilier. Réessayez.");
    throw new CheckoutRetryError("Cette session a expiré. Recommencez une nouvelle réservation.", 409);
  }
  if (session.status === "open" && session.url && reservation.status === "pending_payment") {
    return session.url;
  }
  throw new CheckoutRetryError("Cette session nécessite une réconciliation.", 409);
}
