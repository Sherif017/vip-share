import "server-only";

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export class FullPaymentSupplementError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "FullPaymentSupplementError";
  }
}

type PreparedSupplement = {
  success: boolean;
  already_confirmed?: boolean;
  transaction_id: string;
  vip_subtotal_cents: number;
  service_fee_cents: number;
  total_customer_cents: number;
  commission_rate_bps: number;
  service_fee_rate_bps: number;
  currency: string;
  stripe_account_id: string;
  transfer_group: string;
  checkout_attempt_count: number;
};

function successUrl(
  origin: string,
  reservationId: string
) {
  return (
    `${origin}/reservations?` +
    `supplement=success&reservation=${encodeURIComponent(
      reservationId
    )}`
  );
}

function cancelUrl(
  origin: string,
  reservationId: string
) {
  return (
    `${origin}/reservations?` +
    `supplement=cancelled&reservation=${encodeURIComponent(
      reservationId
    )}`
  );
}

async function expireExistingSession(
  reservationId: string,
  sessionId: string
) {
  const { error } = await supabaseAdmin.rpc(
    "expire_full_payment_supplement",
    {
      p_reservation_id: reservationId,
      p_stripe_session_id: sessionId,
    }
  );

  if (error) {
    throw error;
  }
}

export async function fullPaymentSupplementCheckout(
  reservationId: string,
  userId: string,
  origin: string
): Promise<string> {
  const {
    data: reservation,
    error: reservationError,
  } = await supabaseAdmin
    .from("reservations")
    .select(
      `
        id,
        user_id,
        vip_offer_id,
        payment_model,
        status,
        email,
        supplement_status,
        supplement_stripe_session_id,
        supplement_checkout_params
      `
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) {
    throw reservationError;
  }

  if (!reservation) {
    throw new FullPaymentSupplementError(
      "Réservation introuvable.",
      404
    );
  }

  if (reservation.user_id !== userId) {
    throw new FullPaymentSupplementError(
      "Cette réservation ne t'appartient pas.",
      403
    );
  }

  if (reservation.payment_model !== "full_payment") {
    throw new FullPaymentSupplementError(
      "Cette réservation n'utilise pas le nouveau modèle de paiement.",
      409
    );
  }

  if (
    reservation.status !== "confirmed" &&
    reservation.status !== "checked_in"
  ) {
    throw new FullPaymentSupplementError(
      "Cette réservation ne peut pas payer de supplément.",
      409
    );
  }

  if (reservation.supplement_status === "paid") {
    return successUrl(origin, reservation.id);
  }

  if (reservation.supplement_status !== "payment_pending") {
    throw new FullPaymentSupplementError(
      "Aucun supplément n'est actuellement en attente de paiement.",
      409
    );
  }

  /*
   * Si une session existe déjà, elle reste la source de vérité.
   * - open     -> on réutilise l'URL ;
   * - complete -> succès ;
   * - expired  -> on marque la tentative expirée puis la RPC prepare
   *               ouvrira une nouvelle tentative.
   */
  if (reservation.supplement_stripe_session_id) {
    try {
      const existing =
        await stripe.checkout.sessions.retrieve(
          reservation.supplement_stripe_session_id
        );

      if (
        existing.status === "open" &&
        existing.url
      ) {
        return existing.url;
      }

      if (
        existing.status === "complete" &&
        existing.payment_status === "paid"
      ) {
        return successUrl(
          origin,
          reservation.id
        );
      }

      if (existing.status === "expired") {
        await expireExistingSession(
          reservation.id,
          existing.id
        );
      } else {
        throw new FullPaymentSupplementError(
          "Cette session de paiement nécessite une réconciliation.",
          409
        );
      }
    } catch (error) {
      if (
        error instanceof
        FullPaymentSupplementError
      ) {
        throw error;
      }

      /*
       * Une erreur réseau Stripe n'autorise PAS la création aveugle
       * d'une seconde session. Le client peut rejouer la même requête.
       */
      throw new FullPaymentSupplementError(
        "Impossible de vérifier la tentative Stripe existante. Réessaie.",
        503
      );
    }
  }

  const {
    data: preparedRaw,
    error: prepareError,
  } = await supabaseAdmin.rpc(
    "prepare_full_payment_supplement",
    {
      p_reservation_id: reservation.id,
      p_user_id: userId,
    }
  );

  if (prepareError) {
    throw new FullPaymentSupplementError(
      prepareError.message,
      400
    );
  }

  const prepared =
    preparedRaw as PreparedSupplement | null;

  if (
    !prepared ||
    prepared.success !== true
  ) {
    throw new FullPaymentSupplementError(
      "Impossible de préparer le supplément.",
      409
    );
  }

  if (prepared.already_confirmed) {
    return successUrl(
      origin,
      reservation.id
    );
  }

  if (
    !Number.isInteger(
      prepared.vip_subtotal_cents
    ) ||
    prepared.vip_subtotal_cents <= 0 ||
    !Number.isInteger(
      prepared.service_fee_cents
    ) ||
    prepared.service_fee_cents < 0 ||
    !Number.isInteger(
      prepared.total_customer_cents
    ) ||
    prepared.total_customer_cents !==
      prepared.vip_subtotal_cents +
        prepared.service_fee_cents
  ) {
    throw new FullPaymentSupplementError(
      "Snapshot financier du supplément invalide.",
      500
    );
  }

  const params:
    Stripe.Checkout.SessionCreateParams = {
      mode: "payment",

      customer_email:
        reservation.email ?? undefined,

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: prepared.currency,
            unit_amount:
              prepared.vip_subtotal_cents,
            product_data: {
              name: "Supplément carré VIP K-RÉ",
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: prepared.currency,
            unit_amount:
              prepared.service_fee_cents,
            product_data: {
              name: "Frais de service K-RÉ",
            },
          },
        },
      ],

      metadata: {
        payment_type:
          "full_payment_supplement",

        reservation_id:
          reservation.id,

        user_id:
          reservation.user_id,

        vip_offer_id:
          reservation.vip_offer_id,

        payment_transaction_id:
          prepared.transaction_id,
      },

      payment_intent_data: {
        transfer_group:
          prepared.transfer_group,

        metadata: {
          payment_type:
            "full_payment_supplement",

          reservation_id:
            reservation.id,

          payment_transaction_id:
            prepared.transaction_id,
        },
      },

      success_url:
        successUrl(
          origin,
          reservation.id
        ),

      cancel_url:
        cancelUrl(
          origin,
          reservation.id
        ),
    };

  /*
   * On persiste les paramètres AVANT l'appel Stripe.
   * En cas de timeout réseau, la même tentative utilisera la même
   * idempotency key et exactement les mêmes paramètres.
   */
  const {
    error: paramsError,
  } = await supabaseAdmin
    .from("reservations")
    .update({
      supplement_checkout_params:
        params,
    })
    .eq(
      "id",
      reservation.id
    )
    .eq(
      "user_id",
      userId
    );

  if (paramsError) {
    throw paramsError;
  }

  let session:
    Stripe.Checkout.Session;

  try {
    session =
      await stripe.checkout.sessions.create(
        params,
        {
          idempotencyKey:
            `full-payment-supplement:` +
            `${prepared.transaction_id}:` +
            `${prepared.checkout_attempt_count}`,
        }
      );
  } catch (error) {
    console.error(
      "Création Checkout supplément full-payment impossible",
      {
        reservationId:
          reservation.id,
        transactionId:
          prepared.transaction_id,
        message:
          error instanceof Error
            ? error.message
            : "Erreur Stripe inconnue",
      }
    );

    throw new FullPaymentSupplementError(
      "Paiement du supplément non résolu. Réessaie la même tentative.",
      503
    );
  }

  if (!session.url) {
    throw new FullPaymentSupplementError(
      "Stripe n'a pas retourné d'URL de paiement.",
      503
    );
  }

  const {
    error: sessionError,
  } = await supabaseAdmin
    .from("reservations")
    .update({
      supplement_stripe_session_id:
        session.id,
    })
    .eq(
      "id",
      reservation.id
    )
    .eq(
      "user_id",
      userId
    );

  if (sessionError) {
    throw sessionError;
  }

  const {
    error: txnSessionError,
  } = await supabaseAdmin
    .from("payment_transactions")
    .update({
      stripe_checkout_session_id:
        session.id,
    })
    .eq(
      "id",
      prepared.transaction_id
    )
    .eq(
      "payment_type",
      "supplement"
    );

  if (txnSessionError) {
    throw txnSessionError;
  }

  return session.url;
}
