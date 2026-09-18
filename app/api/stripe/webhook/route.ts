import { NextResponse } from "next/server";
import Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  const { error } = await supabaseAdmin.rpc(
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
          if (
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

        if (
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
