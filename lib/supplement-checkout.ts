import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export class SupplementCheckoutError extends Error {
  constructor(
    message: string,
    public status = 503
  ) {
    super(message);
  }
}

type SupplementReservation = {
  id: string;
  user_id: string;
  email: string | null;
  reservation_code: string;
  quantity: number;
  status: string;
  vip_offer_id: string;
  decision_choice: string | null;
  supplement_amount: number | string | null;
  supplement_status: string | null;
  supplement_stripe_session_id: string | null;
  supplement_checkout_params: Stripe.Checkout.SessionCreateParams | null;
};

export async function supplementCheckout(
  db: SupabaseClient,
  stripe: Stripe,
  reservationId: string,
  userId: string,
  origin: string
) {
  const readReservation = async (): Promise<SupplementReservation> => {
    const { data, error } = await db
      .from("reservations")
      .select(`
        id,
        user_id,
        email,
        reservation_code,
        quantity,
        status,
        vip_offer_id,
        decision_choice,
        supplement_amount,
        supplement_status,
        supplement_stripe_session_id,
        supplement_checkout_params
      `)
      .eq("id", reservationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new SupplementCheckoutError(
        "Impossible de relire la réservation. Réessayez."
      );
    }

    if (!data) {
      throw new SupplementCheckoutError(
        "Réservation introuvable.",
        404
      );
    }

    return data as SupplementReservation;
  };

  let reservation = await readReservation();

  if (
    reservation.status !== "confirmed" &&
    reservation.status !== "checked_in"
  ) {
    throw new SupplementCheckoutError(
      "Cette réservation ne peut pas payer de supplément.",
      409
    );
  }

  if (reservation.decision_choice !== "maintain") {
    throw new SupplementCheckoutError(
      "Tu dois avoir choisi de maintenir ta réservation.",
      409
    );
  }

  if (reservation.supplement_status === "paid") {
    throw new SupplementCheckoutError(
      "Ce supplément a déjà été payé.",
      409
    );
  }

  if (reservation.supplement_status !== "payment_pending") {
    throw new SupplementCheckoutError(
      "Cette réservation n'est pas en attente de paiement du supplément.",
      409
    );
  }

  const amount = Number(reservation.supplement_amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new SupplementCheckoutError(
      "Montant du supplément invalide.",
      409
    );
  }

  const { data: offer, error: offerError } = await db
    .from("vip_offers")
    .select(`
      id,
      event_id,
      table_number,
      status,
      admin_decision
    `)
    .eq("id", reservation.vip_offer_id)
    .maybeSingle();

  if (offerError) {
    throw new SupplementCheckoutError(
      "Impossible de vérifier la table."
    );
  }

  if (!offer) {
    throw new SupplementCheckoutError(
      "Table introuvable.",
      404
    );
  }

  if (
    offer.status !== "supplement_payment_pending" ||
    offer.admin_decision !== "supplement"
  ) {
    throw new SupplementCheckoutError(
      "Le paiement du supplément n'est pas disponible pour cette table.",
      409
    );
  }

  const { data: event } = await db
    .from("events")
    .select("name")
    .eq("id", offer.event_id)
    .maybeSingle();

  let sessionId =
    reservation.supplement_stripe_session_id;

  /*
   * IMPORTANT:
   * The Stripe payload is persisted BEFORE Stripe is contacted.
   * Concurrent/retried requests therefore use exactly the same expires_at,
   * amount, metadata and URLs with the same Stripe idempotency key.
   */
  if (!sessionId && !reservation.supplement_checkout_params) {
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",

      payment_method_types: ["card"],

      customer_email:
        reservation.email || undefined,

      line_items: [
        {
          price_data: {
            currency: "eur",

            product_data: {
              name:
                `VIP Share — Supplément ${
                  event?.name ?? "table VIP"
                }`,

              description:
                `Table n°${offer.table_number ?? "—"} · ` +
                `${reservation.quantity} place${
                  Number(reservation.quantity) !== 1
                    ? "s"
                    : ""
                }`,
            },

            unit_amount:
              Math.round(amount * 100),
          },

          quantity: 1,
        },
      ],

      metadata: {
        payment_type: "supplement",
        reservation_id: reservation.id,
        reservation_code:
          reservation.reservation_code,
        vip_offer_id: offer.id,
        user_id: reservation.user_id,
      },

      success_url:
        `${origin}/reservations?` +
        `supplement=success&reservation=${reservation.id}`,

      cancel_url:
        `${origin}/reservations?` +
        `supplement=cancelled&reservation=${reservation.id}`,

      // Persisted once. All retries reuse this exact timestamp.
      expires_at:
        Math.floor(Date.now() / 1000) +
        31 * 60,
    };

    const { error: persistError } = await db
      .from("reservations")
      .update({
        supplement_checkout_params: params,
      })
      .eq("id", reservation.id)
      .eq("user_id", userId)
      .eq(
        "supplement_status",
        "payment_pending"
      )
      .is(
        "supplement_checkout_params",
        null
      );

    if (persistError) {
      throw new SupplementCheckoutError(
        "Impossible de préparer le paiement. Réessayez."
      );
    }

    /*
     * A concurrent request may have won the conditional update.
     * Always reread the winning DB snapshot.
     */
    reservation = await readReservation();

    sessionId =
      reservation.supplement_stripe_session_id;
  }

  if (!sessionId) {
    const params =
      reservation.supplement_checkout_params;

    if (!params?.expires_at) {
      throw new SupplementCheckoutError(
        "Cette tentative de supplément n'est plus payable.",
        409
      );
    }

    /*
     * Do not create a fresh Stripe payment after the idempotency
     * retention horizon becomes uncertain.
     */
    if (
      Date.now() / 1000 >=
      params.expires_at + 22 * 60 * 60
    ) {
      throw new SupplementCheckoutError(
        "Cette tentative nécessite une réconciliation.",
        409
      );
    }

    let created:
      | Stripe.Checkout.Session
      | undefined;

    for (
      let attempt = 0;
      attempt < 3;
      attempt++
    ) {
      try {
        created =
          await stripe.checkout.sessions.create(
            params,
            {
              idempotencyKey:
                `supplement:${reservation.id}`,
            }
          );

        break;
      } catch (error) {
        if (
          (error as { code?: string }).code !==
            "idempotency_key_in_use" ||
          attempt === 2
        ) {
          /*
           * Ambiguous Stripe/network failure:
           * never clear the DB snapshot and never create
           * another payment with different parameters.
           */
          throw new SupplementCheckoutError(
            "Paiement du supplément non résolu. Réessayez la même tentative."
          );
        }

        await new Promise((resolve) =>
          setTimeout(
            resolve,
            150 * (attempt + 1)
          )
        );
      }
    }

    if (!created) {
      throw new SupplementCheckoutError(
        "Paiement du supplément non résolu. Réessayez."
      );
    }

    const { error: associateError } =
      await db
        .from("reservations")
        .update({
          supplement_stripe_session_id:
            created.id,
        })
        .eq("id", reservation.id)
        .eq("user_id", userId)
        .eq(
          "supplement_status",
          "payment_pending"
        )
        .is(
          "supplement_stripe_session_id",
          null
        );

    if (associateError) {
      throw new SupplementCheckoutError(
        "Paiement créé, association à réessayer."
      );
    }

    reservation =
      await readReservation();

    if (
      reservation
        .supplement_stripe_session_id !==
      created.id
    ) {
      throw new SupplementCheckoutError(
        "Association du paiement à vérifier."
      );
    }

    sessionId = created.id;
  }

  /*
   * Never trust a cached Stripe creation response.
   * Retrieve the authoritative current session.
   */
  const session =
    await stripe.checkout.sessions.retrieve(
      sessionId
    );

  const metadata =
    session.metadata ?? {};

  const expectedAmount =
    Math.round(amount * 100);

  if (
    metadata.payment_type !== "supplement" ||
    metadata.reservation_id !==
      reservation.id ||
    metadata.user_id !==
      reservation.user_id ||
    metadata.vip_offer_id !==
      reservation.vip_offer_id ||
    session.amount_total !==
      expectedAmount ||
    (session.currency ?? "")
      .toLowerCase() !== "eur"
  ) {
    throw new SupplementCheckoutError(
      "Session de paiement du supplément incompatible.",
      409
    );
  }

  if (
    session.status === "complete" ||
    session.payment_status === "paid"
  ) {
    /*
     * Browser return never confirms payment.
     * Only the signed Stripe webhook does.
     */
    return (
      `/reservations?` +
      `supplement=success&reservation=${reservation.id}`
    );
  }

  if (session.status === "expired") {
    const { error } =
      await db.rpc(
        "expire_vip_supplement_checkout",
        {
          p_reservation_id:
            reservation.id,

          p_stripe_session_id:
            session.id,
        }
      );

    if (error) {
      throw new SupplementCheckoutError(
        "Expiration du supplément à réconcilier. Réessayez."
      );
    }

    throw new SupplementCheckoutError(
      "Cette session de supplément a expiré.",
      409
    );
  }

  if (
    session.status === "open" &&
    session.url &&
    reservation.supplement_status ===
      "payment_pending"
  ) {
    return session.url;
  }

  throw new SupplementCheckoutError(
    "Cette session de supplément nécessite une réconciliation.",
    409
  );
}
