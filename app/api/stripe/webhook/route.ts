import { NextResponse } from "next/server";
import Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dispatchReservationConfirmedEmail } from "@/lib/email/reservation-confirmed";
import { dispatchTableConfirmedEmails } from "@/lib/email/table-confirmed";
import { applyStripeAccountSnapshot } from "@/lib/stripe-connect";

async function confirmInitialReservation(
  session: Stripe.Checkout.Session
) {
  const reservationId =
    session.metadata?.reservation_id;

  if (!reservationId) {
    console.error(
      "Webhook Stripe : reservation_id absent"
    );
    return;
  }

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,user_id,vip_offer_id,stripe_checkout_session_id,deposit_paid,status")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) throw reservationError;
  if (!reservation) {
    console.error("Webhook Deposit : réservation introuvable", { reservationId, sessionId: session.id });
    return;
  }

  const metadata = session.metadata ?? {};
  const expectedAmount = Math.round(Number(reservation.deposit_paid) * 100);
  const actualCurrency = (session.currency ?? "").toLowerCase();
  const metadataType = metadata.payment_type;
  const metadataUser = metadata.user_id;
  const metadataOffer = metadata.vip_offer_id;

  if (metadataType && metadataType !== "initial_deposit") {
    console.error("Webhook Deposit : payment_type incompatible", { reservationId, sessionId: session.id, paymentType: metadataType });
    return;
  }
  if (reservation.stripe_checkout_session_id === null) {
    throw new Error("Session Stripe non encore associée à la réservation.");
  }
  if (reservation.stripe_checkout_session_id !== session.id ||
      (metadataUser && metadataUser !== reservation.user_id) ||
      (metadataOffer && metadataOffer !== reservation.vip_offer_id) ||
      session.amount_total !== expectedAmount || actualCurrency !== "eur") {
    console.error("Webhook Deposit : session, montant ou devise incompatible", {
      reservationId, sessionId: session.id, expectedSessionId: reservation.stripe_checkout_session_id,
      expectedAmount, actualAmount: session.amount_total, actualCurrency,
    });
    return;
  }

  const { data: confirmResult, error } = await supabaseAdmin.rpc(
    "confirm_vip_reservation_payment",
    {
      p_reservation_id: reservationId,
      p_stripe_session_id: session.id,
      p_amount_total: session.amount_total,
      p_currency: actualCurrency,
    }
  );

  if (error) {
    throw error;
  }

  /*
   * L'email est envoyé APRÈS confirmation fiable du paiement, jamais
   * avant, et n'affecte jamais cette fonction : une panne Resend ne doit
   * jamais remettre en cause une réservation déjà confirmée par
   * Stripe/Supabase. dispatchReservationConfirmedEmail ne lève jamais
   * d'exception elle-même ; ce try/catch est une protection
   * supplémentaire, volontairement redondante.
   */
  if (confirmResult?.status === "confirmed") {
    try {
      await dispatchReservationConfirmedEmail(reservationId);
    } catch (emailError) {
      console.error(
        "Webhook Deposit : envoi de l'email de confirmation impossible",
        {
          reservationId,
          message:
            emailError instanceof Error
              ? emailError.message
              : "Erreur inconnue",
        }
      );
    }

    /*
     * La confirmation de CETTE réservation peut être celle qui fait
     * franchir le seuil à la table (trigger SQL transparent, à
     * l'intérieur du même appel RPC), ou la table peut déjà être
     * confirmed si cette réservation rejoint une table qui l'était
     * déjà. Le claim atomique par réservation rend cet appel sûr à
     * exécuter à chaque passage, sans jamais dupliquer l'email A.
     */
    try {
      await dispatchTableConfirmedEmails(reservation.vip_offer_id);
    } catch (emailError) {
      console.error(
        "Webhook Deposit : envoi de l'email table confirmée impossible",
        {
          reservationId,
          message:
            emailError instanceof Error
              ? emailError.message
              : "Erreur inconnue",
        }
      );
    }
  }
}

async function expireInitialReservation(
  session: Stripe.Checkout.Session
) {
  const reservationId =
    session.metadata?.reservation_id;

  if (!reservationId) {
    console.error(
      "Webhook Stripe : reservation_id absent"
    );
    return;
  }

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,stripe_checkout_session_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) throw reservationError;
  if (!reservation) {
    console.error("Webhook expiration Deposit : réservation introuvable", { reservationId, sessionId: session.id });
    return;
  }
  if (reservation.stripe_checkout_session_id === null) {
    throw new Error("Session Stripe non encore associée à la réservation.");
  }
  if (reservation.stripe_checkout_session_id !== session.id) {
    console.error("Webhook expiration Deposit : session non associée", {
      reservationId, sessionId: session.id,
      expectedSessionId: reservation.stripe_checkout_session_id,
    });
    return;
  }

  const { error } = await supabaseAdmin.rpc(
    "expire_vip_reservation",
    {
      p_reservation_id: reservationId,
    }
  );

  if (error) {
    throw error;
  }
}

async function confirmSupplement(
  session: Stripe.Checkout.Session
) {
  const reservationId =
    session.metadata?.reservation_id;

  if (!reservationId) {
    throw new Error(
      "Webhook supplément : reservation_id absent."
    );
  }

  const {
    data: reservation,
    error: reservationError,
  } = await supabaseAdmin
    .from("reservations")
    .select(`
      id,
      user_id,
      vip_offer_id,
      supplement_amount,
      supplement_status,
      supplement_stripe_session_id
    `)
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) {
    throw reservationError;
  }

  if (!reservation) {
    console.error(
      "Webhook supplément : réservation introuvable",
      {
        reservationId,
        sessionId: session.id,
      }
    );

    return;
  }

  const metadata =
    session.metadata ?? {};

  const expectedAmount =
    Math.round(
      Number(
        reservation.supplement_amount
      ) * 100
    );

  const actualCurrency =
    (session.currency ?? "")
      .toLowerCase();

  if (
    metadata.payment_type !==
      "supplement" ||
    metadata.reservation_id !==
      reservation.id ||
    metadata.user_id !==
      reservation.user_id ||
    metadata.vip_offer_id !==
      reservation.vip_offer_id ||
    reservation
      .supplement_stripe_session_id ===
      null
  ) {
    console.error(
      "Webhook supplément : metadata ou session incompatible",
      {
        reservationId,
        sessionId: session.id,
      }
    );

    return;
  }

  if (
    reservation
      .supplement_stripe_session_id !==
      session.id ||
    session.amount_total !==
      expectedAmount ||
    actualCurrency !== "eur"
  ) {
    console.error(
      "Webhook supplément : session, montant ou devise incompatible",
      {
        reservationId,
        sessionId: session.id,
        expectedSessionId:
          reservation
            .supplement_stripe_session_id,
        expectedAmount,
        actualAmount:
          session.amount_total,
        actualCurrency,
      }
    );

    return;
  }

  const { error } =
    await supabaseAdmin.rpc(
      "confirm_vip_supplement_payment",
      {
        p_reservation_id:
          reservationId,

        p_stripe_session_id:
          session.id,

        p_amount_total:
          session.amount_total,

        p_currency:
          actualCurrency,
      }
    );

  if (error) {
    throw error;
  }
}

async function expireSupplement(
  session: Stripe.Checkout.Session
) {
  const reservationId =
    session.metadata?.reservation_id;

  if (!reservationId) {
    return;
  }

  const { error } = await supabaseAdmin.rpc(
    "expire_vip_supplement_checkout",
    {
      p_reservation_id: reservationId,
      p_stripe_session_id: session.id,
    }
  );

  if (error) {
    throw error;
  }
}

function isSupplement(
  session: Stripe.Checkout.Session
) {
  return (
    session.metadata?.payment_type ===
    "supplement"
  );
}

function isFullPayment(
  session: Stripe.Checkout.Session
) {
  return session.metadata?.payment_type === "full_payment_initial";
}


function isFullPaymentSupplement(
  session: Stripe.Checkout.Session
) {
  return (
    session.metadata?.payment_type ===
    "full_payment_supplement"
  );
}

async function confirmFullPaymentSupplement(
  session: Stripe.Checkout.Session
) {
  const reservationId =
    session.metadata?.reservation_id;

  if (!reservationId) {
    console.error(
      "Webhook supplément full-payment : reservation_id absent"
    );
    return;
  }

  const {
    data: reservation,
    error: reservationError,
  } = await supabaseAdmin
    .from("reservations")
    .select(
      "id,user_id,vip_offer_id,payment_model,supplement_stripe_session_id"
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) {
    throw reservationError;
  }

  if (
    !reservation ||
    reservation.payment_model !==
      "full_payment"
  ) {
    console.error(
      "Webhook supplément full-payment : réservation incompatible",
      {
        reservationId,
        sessionId: session.id,
      }
    );
    return;
  }

  const {
    data: txn,
    error: txnError,
  } = await supabaseAdmin
    .from("payment_transactions")
    .select(
      "id,total_customer_cents,currency,status"
    )
    .eq(
      "reservation_id",
      reservationId
    )
    .eq(
      "payment_type",
      "supplement"
    )
    .maybeSingle();

  if (txnError) {
    throw txnError;
  }

  if (!txn) {
    console.error(
      "Webhook supplément full-payment : transaction introuvable",
      {
        reservationId,
        sessionId: session.id,
      }
    );
    return;
  }

  const metadata =
    session.metadata ?? {};

  const actualCurrency =
    (session.currency ?? "")
      .toLowerCase();

  if (
    metadata.payment_type !==
      "full_payment_supplement" ||
    metadata.reservation_id !==
      reservation.id ||
    metadata.user_id !==
      reservation.user_id ||
    metadata.vip_offer_id !==
      reservation.vip_offer_id ||
    metadata.payment_transaction_id !==
      txn.id ||
    reservation
      .supplement_stripe_session_id !==
      session.id ||
    session.amount_total !==
      txn.total_customer_cents ||
    actualCurrency !==
      txn.currency
  ) {
    console.error(
      "Webhook supplément full-payment : session, metadata, montant ou devise incompatible",
      {
        reservationId,
        sessionId: session.id,
        transactionId: txn.id,
        expectedAmount:
          txn.total_customer_cents,
        actualAmount:
          session.amount_total,
        actualCurrency,
      }
    );
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent ===
    "string"
      ? session.payment_intent
      : session.payment_intent?.id ??
        null;

  let chargeId:
    string | null = null;

  if (paymentIntentId) {
    const intent =
      await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

    chargeId =
      typeof intent.latest_charge ===
      "string"
        ? intent.latest_charge
        : intent.latest_charge?.id ??
          null;
  }

  const {
    data: result,
    error,
  } = await supabaseAdmin.rpc(
    "confirm_full_payment_supplement",
    {
      p_reservation_id:
        reservationId,

      p_stripe_session_id:
        session.id,

      p_amount_total:
        session.amount_total,

      p_currency:
        actualCurrency,

      p_stripe_payment_intent_id:
        paymentIntentId,

      p_stripe_charge_id:
        chargeId,
    }
  );

  if (error) {
    throw error;
  }

  if (
    result?.success !== true
  ) {
    throw new Error(
      `Confirmation supplément full-payment refusée: ${
        result?.error ??
        "unknown_error"
      }`
    );
  }
}

async function expireFullPaymentSupplement(
  session: Stripe.Checkout.Session
) {
  const reservationId =
    session.metadata?.reservation_id;

  if (!reservationId) {
    return;
  }

  const { error } =
    await supabaseAdmin.rpc(
      "expire_full_payment_supplement",
      {
        p_reservation_id:
          reservationId,

        p_stripe_session_id:
          session.id,
      }
    );

  if (error) {
    throw error;
  }
}

/*
 * Nouveau modèle (paiement intégral). Miroir de confirmInitialReservation
 * ci-dessus, jamais un branchement dedans : le chemin legacy Deposit
 * reste totalement intact. Revvérifie le montant total (VIP + frais de
 * service) contre payment_transactions.total_customer_cents, jamais
 * contre une valeur supposée côté navigateur.
 */
async function confirmFullPaymentReservation(
  session: Stripe.Checkout.Session
) {
  const reservationId = session.metadata?.reservation_id;

  if (!reservationId) {
    console.error("Webhook Stripe : reservation_id absent (full payment)");
    return;
  }

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from("reservations")
    .select("id,user_id,vip_offer_id,stripe_checkout_session_id,payment_model,status")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError) throw reservationError;
  if (!reservation) {
    console.error("Webhook full payment : réservation introuvable", { reservationId, sessionId: session.id });
    return;
  }
  if (reservation.payment_model !== "full_payment") {
    console.error("Webhook full payment : modèle de paiement incompatible", { reservationId, sessionId: session.id });
    return;
  }

  const { data: txn, error: txnError } = await supabaseAdmin
    .from("payment_transactions")
    .select("total_customer_cents,currency")
    .eq("reservation_id", reservationId)
    .eq("payment_type", "initial")
    .maybeSingle();

  if (txnError) throw txnError;
  if (!txn) {
    console.error("Webhook full payment : transaction introuvable", { reservationId, sessionId: session.id });
    return;
  }

  const metadata = session.metadata ?? {};
  const actualCurrency = (session.currency ?? "").toLowerCase();

  if (reservation.stripe_checkout_session_id === null) {
    throw new Error("Session Stripe non encore associée à la réservation.");
  }
  if (reservation.stripe_checkout_session_id !== session.id ||
      (metadata.user_id && metadata.user_id !== reservation.user_id) ||
      (metadata.vip_offer_id && metadata.vip_offer_id !== reservation.vip_offer_id) ||
      session.amount_total !== txn.total_customer_cents ||
      actualCurrency !== txn.currency) {
    console.error("Webhook full payment : session, montant ou devise incompatible", {
      reservationId, sessionId: session.id,
      expectedAmount: txn.total_customer_cents, actualAmount: session.amount_total, actualCurrency,
    });
    return;
  }

  const { data: confirmResult, error } = await supabaseAdmin.rpc(
    "confirm_full_payment_reservation",
    {
      p_reservation_id: reservationId,
      p_stripe_session_id: session.id,
      p_amount_total: session.amount_total,
      p_currency: actualCurrency,
      p_stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    }
  );

  if (error) throw error;

  if (confirmResult?.status === "confirmed") {
    try {
      await dispatchReservationConfirmedEmail(reservationId);
    } catch (emailError) {
      console.error("Webhook full payment : envoi de l'email de confirmation impossible", {
        reservationId, message: emailError instanceof Error ? emailError.message : "Erreur inconnue",
      });
    }
    try {
      await dispatchTableConfirmedEmails(reservation.vip_offer_id);
    } catch (emailError) {
      console.error("Webhook full payment : envoi de l'email table confirmée impossible", {
        reservationId, message: emailError instanceof Error ? emailError.message : "Erreur inconnue",
      });
    }
  }
}

async function expireFullPaymentReservation(
  session: Stripe.Checkout.Session
) {
  const reservationId = session.metadata?.reservation_id;
  if (!reservationId) return;

  const { error } = await supabaseAdmin.rpc("expire_full_payment_reservation", {
    p_reservation_id: reservationId,
    p_stripe_session_id: session.id,
  });

  if (error) throw error;
}

export async function POST(
  request: Request
) {
  const body = await request.text();

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET absent.");
    return NextResponse.json(
      { error: "Webhook Stripe non configuré." },
      { status: 500 }
    );
  }

  const signature =
    request.headers.get(
      "stripe-signature"
    );

  if (!signature) {
    return NextResponse.json(
      {
        error:
          "Signature Stripe absente.",
      },
      {
        status: 400,
      }
    );
  }

  let event: Stripe.Event;

  try {
    event =
      stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret
      );
  } catch (error) {
    console.error(
      "Erreur signature webhook Stripe :",
      error
    );

    return NextResponse.json(
      {
        error:
          "Signature Stripe invalide.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session =
          event.data
            .object as Stripe.Checkout.Session;

        console.info("Webhook Stripe reçu", {
          event: event.type,
          eventId: event.id,
          sessionId: session.id,
          reservationId: session.metadata?.reservation_id,
          paymentType: session.metadata?.payment_type ?? "initial_deposit",
        });

        if (
          session.payment_status ===
          "paid"
        ) {
          if (isFullPayment(session)) {
            await confirmFullPaymentReservation(session);
          } else if (
            isFullPaymentSupplement(session)
          ) {
            await confirmFullPaymentSupplement(
              session
            );
          } else if (
            isSupplement(session)
          ) {
            await confirmSupplement(
              session
            );
          } else {
            /*
             * Compatibilité avec les anciennes
             * sessions Deposit :
             * l'absence de payment_type signifie
             * paiement initial.
             */
            await confirmInitialReservation(
              session
            );
          }
        }

        break;
      }

      case "checkout.session.expired": {
        const session =
          event.data
            .object as Stripe.Checkout.Session;

        console.info("Webhook Stripe reçu", {
          event: event.type,
          eventId: event.id,
          sessionId: session.id,
          reservationId: session.metadata?.reservation_id,
          paymentType: session.metadata?.payment_type ?? "initial_deposit",
        });

        if (isFullPayment(session)) {
          await expireFullPaymentReservation(session);
        } else if (
          isFullPaymentSupplement(session)
        ) {
          await expireFullPaymentSupplement(
            session
          );
        } else if (
          isSupplement(session)
        ) {
          await expireSupplement(
            session
          );
        } else {
          await expireInitialReservation(
            session
          );
        }

        break;
      }

      case "account.updated": {
        /*
         * Vénement Stripe Connect : source de vérité pour
         * charges_enabled/payouts_enabled/details_submitted, jamais le
         * retour navigateur sur return_url. Idempotent par construction
         * (UPDATE sur stripe_account_id, jamais d'INSERT) : rejouer le
         * même événement plusieurs fois est sans danger. Ne peut jamais
         * modifier le mauvais club : la mise à jour est filtrée par
         * stripe_account_id exact, jamais par un id fourni par le client.
         *
         * IMPORTANT côté Stripe Dashboard : cet endpoint webhook doit
         * avoir « Listen to events on Connected accounts » activé pour
         * recevoir cet événement — action manuelle, voir rapport final.
         */
        const account = event.data.object as Stripe.Account;

        console.info("Webhook Stripe Connect reçu", {
          event: event.type,
          eventId: event.id,
          accountId: account.id,
        });

        try {
          await applyStripeAccountSnapshot(account);
        } catch (syncError) {
          console.error("Webhook account.updated : synchronisation échouée", {
            accountId: account.id,
            message: syncError instanceof Error ? syncError.message : "Erreur inconnue",
          });
          throw syncError;
        }

        break;
      }

      default:
        break;
    }

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    console.error(
      "Erreur traitement webhook Stripe :",
      error
    );

    return NextResponse.json(
      {
        error:
          "Impossible de traiter le webhook.",
      },
      {
        status: 500,
      }
    );
  }
}
