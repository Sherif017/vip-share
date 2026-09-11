import { NextResponse } from "next/server";
import Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function confirmReservation(
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

  const { error } = await supabaseAdmin.rpc(
    "confirm_vip_reservation",
    {
      p_reservation_id: reservationId,
    }
  );

  if (error) {
    throw error;
  }
}

async function expireReservation(
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

export async function POST(request: Request) {
  const body = await request.text();

  const signature =
    request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      {
        error: "Signature Stripe absente.",
      },
      {
        status: 400,
      }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error(
      "Erreur signature webhook Stripe :",
      error
    );

    return NextResponse.json(
      {
        error: "Signature Stripe invalide.",
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
          event.data.object as Stripe.Checkout.Session;

        if (session.payment_status === "paid") {
          await confirmReservation(session);
        }

        break;
      }

      case "checkout.session.expired": {
        const session =
          event.data.object as Stripe.Checkout.Session;

        await expireReservation(session);

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