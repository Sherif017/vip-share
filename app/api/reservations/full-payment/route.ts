import { NextResponse } from "next/server";

import { CheckoutRetryError } from "@/lib/initial-checkout";
import { fullPaymentCheckout } from "@/lib/full-payment-checkout";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/reservations/full-payment
 *
 * Équivalent de /api/reservations pour le NOUVEAU modèle financier
 * (paiement intégral + frais de service K-RÉ). Route séparée plutôt
 * qu'un branchement dans la route existante : /api/reservations et
 * lib/initial-checkout.ts restent intacts, zéro risque pour le parcours
 * acompte déjà en production.
 *
 * Le club "prêt" (Stripe Connect actif + commission configurée) est
 * revérifié côté serveur par la RPC create_full_payment_reservation —
 * jamais une simple supposition du frontend.
 */

type FullPaymentRpcResult = {
  reservation_id: string;
  reservation_code: string;
  vip_subtotal_cents: number;
  service_fee_cents: number;
  total_customer_cents: number;
  commission_rate_bps: number;
  service_fee_rate_bps: number;
  currency: string;
  stripe_account_id: string | null;
  already_exists: boolean;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Tu dois être connecté pour effectuer une réservation." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const eventSlug = typeof body.eventSlug === "string" ? body.eventSlug.trim() : "";
    const vipOfferId = typeof body.vipOfferId === "string" ? body.vipOfferId.trim() : "";
    const firstname = typeof body.firstname === "string" ? body.firstname.trim() : "";
    const lastname = typeof body.lastname === "string" ? body.lastname.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const quantity = Number(body.quantity);
    const checkoutAttemptId =
      typeof body.checkoutAttemptId === "string" ? body.checkoutAttemptId.trim() : "";

    if (!eventSlug) {
      return NextResponse.json({ success: false, error: "Événement invalide." }, { status: 400 });
    }
    if (!vipOfferId || !UUID_REGEX.test(vipOfferId)) {
      return NextResponse.json({ success: false, error: "Table invalide." }, { status: 400 });
    }
    if (!firstname) {
      return NextResponse.json({ success: false, error: "Le prénom est obligatoire." }, { status: 400 });
    }
    if (!lastname) {
      return NextResponse.json({ success: false, error: "Le nom est obligatoire." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "Adresse email invalide." }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ success: false, error: "Le numéro de téléphone est obligatoire." }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ success: false, error: "Le nombre de places est invalide." }, { status: 400 });
    }
    if (!UUID_REGEX.test(checkoutAttemptId)) {
      return NextResponse.json({ success: false, error: "Tentative de paiement invalide." }, { status: 400 });
    }

    const { data: rpcData, error: reservationError } = await supabaseAdmin.rpc(
      "create_full_payment_reservation",
      {
        p_event_slug: eventSlug,
        p_vip_offer_id: vipOfferId,
        p_user_id: user.id,
        p_firstname: firstname,
        p_lastname: lastname,
        p_email: email,
        p_phone: phone,
        p_quantity: quantity,
        p_checkout_attempt_id: checkoutAttemptId,
      }
    );

    if (reservationError) {
      console.error("Erreur create_full_payment_reservation :", reservationError);
      return NextResponse.json(
        { success: false, error: reservationError.message || "Impossible de créer la réservation." },
        { status: 400 }
      );
    }

    const reservation = rpcData?.[0] as FullPaymentRpcResult | undefined;

    if (!reservation) {
      return NextResponse.json(
        { success: false, error: "La réservation n'a pas pu être créée." },
        { status: 500 }
      );
    }

    const checkoutUrl = await fullPaymentCheckout(
      supabaseAdmin,
      stripe,
      reservation.reservation_id,
      user.id,
      new URL(request.url).origin,
    );

    return NextResponse.json({
      success: true,
      reservation: {
        id: reservation.reservation_id,
        code: reservation.reservation_code,
        vipSubtotal: reservation.vip_subtotal_cents / 100,
        serviceFee: reservation.service_fee_cents / 100,
        total: reservation.total_customer_cents / 100,
        currency: reservation.currency,
      },
      checkoutUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof CheckoutRetryError
          ? error.message
          : "Paiement non résolu. Réessayez la même tentative.",
      },
      { status: error instanceof CheckoutRetryError ? error.status : 503 },
    );
  }
}
