import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export class CheckoutRetryError extends Error {
  constructor(message: string, public status = 503) {
    super(message);
  }
}

// The snapshot is saved before any Stripe call. Concurrent requests must read
// the winning snapshot, including its origin and expiration, from the database.
export async function initialCheckout(
  db: SupabaseClient,
  stripe: Stripe,
  reservationId: string,
  userId: string,
  origin: string,
) {
  const read = async () => {
    const { data, error } = await db.from("reservations")
      .select("id,reservation_code,user_id,vip_offer_id,email,quantity,deposit_paid,status,created_at,stripe_checkout_session_id,initial_checkout_params,events(slug)")
      .eq("id", reservationId).eq("user_id", userId).single();
    if (error || !data) throw new CheckoutRetryError("Impossible de relire la réservation. Réessayez.");
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
      const event = Array.isArray(reservation.events) ? reservation.events[0] : reservation.events;
      if (!event?.slug) throw new CheckoutRetryError("Événement introuvable.", 409);
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: reservation.email,
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: {
              name: `VIP Share — ${event.slug}`,
              description: `${reservation.quantity} place${reservation.quantity > 1 ? "s" : ""} VIP — Deposit`,
            },
            unit_amount: Math.round(Number(reservation.deposit_paid) * 100),
          },
          quantity: 1,
        }],
        metadata: {
          payment_type: "initial_deposit",
          reservation_id: reservation.id,
          reservation_code: reservation.reservation_code,
          user_id: reservation.user_id,
          event_slug: event.slug,
          vip_offer_id: reservation.vip_offer_id,
          quantity: String(reservation.quantity),
        },
        success_url: `${origin}${confirmationUrl}`,
        cancel_url: `${origin}/checkout/${encodeURIComponent(event.slug)}?table=${encodeURIComponent(reservation.vip_offer_id)}&quantity=${reservation.quantity}&payment=cancelled`,
        // One minute allows persistence/network latency before Stripe's 30 min minimum.
        // This clock is used ONCE: all retries use the persisted winning value.
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
      // Stop before Stripe can prune the idempotency key (at least 24 hours).
      // An old unbound session needs reconciliation, never another payment.
      if (Date.now() / 1000 >= params.expires_at + 22 * 60 * 60) {
        throw new CheckoutRetryError("Cette tentative nécessite une réconciliation.", 409);
      }
      let created: Stripe.Checkout.Session | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          created = await stripe.checkout.sessions.create(params, {
            idempotencyKey: `initial-deposit:${reservation.id}`,
          });
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "idempotency_key_in_use" || attempt === 2) {
            // Includes network failures, cached Stripe 500s and uncertain DB/Stripe races.
            // Never release a seat when a payable session might exist.
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

  // A cached create response may be stale: always retrieve the current state.
  const session = await stripe.checkout.sessions.retrieve(sessionId!);
  if (session.metadata?.reservation_id !== reservation.id) {
    throw new CheckoutRetryError("Session de paiement incompatible.", 409);
  }
  if (session.status === "complete" || session.payment_status === "paid") {
    // Only the signed webhook confirms in the database, never this browser return.
    return confirmationUrl;
  }
  if (session.status === "expired") {
    const { error } = await db.rpc("expire_vip_reservation", { p_reservation_id: reservationId });
    if (error) throw new CheckoutRetryError("Expiration à réconcilier. Réessayez.");
    throw new CheckoutRetryError("Cette session a expiré. Recommencez une nouvelle réservation.", 409);
  }
  if (session.status === "open" && session.url && reservation.status === "pending_payment") {
    return session.url;
  }
  throw new CheckoutRetryError("Cette session nécessite une réconciliation.", 409);
}
