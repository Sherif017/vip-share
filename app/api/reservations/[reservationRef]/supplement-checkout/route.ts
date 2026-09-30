import { NextResponse } from "next/server";

import {
  SupplementCheckoutError,
  supplementCheckout,
} from "@/lib/supplement-checkout";
import {
  FullPaymentSupplementError,
  fullPaymentSupplementCheckout,
} from "@/lib/full-payment-supplement";

import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      reservationRef: string;
    }>;
  }
) {
  try {
    const {
      reservationRef: reservationId,
    } = await params;

    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Tu dois être connecté.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: paymentModelRow,
      error: paymentModelError,
    } = await supabaseAdmin
      .from("reservations")
      .select("payment_model")
      .eq("id", reservationId)
      .maybeSingle();

    if (paymentModelError) {
      throw paymentModelError;
    }

    const checkoutUrl =
      paymentModelRow?.payment_model ===
      "full_payment"
        ? await fullPaymentSupplementCheckout(
            reservationId,
            user.id,
            new URL(request.url).origin
          )
        : await supplementCheckout(
            supabaseAdmin,
            stripe,
            reservationId,
            user.id,
            new URL(request.url).origin
          );

    return NextResponse.json({
      success: true,
      checkoutUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof
            SupplementCheckoutError ||
          error instanceof
            FullPaymentSupplementError
            ? error.message
            : "Paiement du supplément non résolu. Réessayez la même tentative.",
      },
      {
        status:
          error instanceof
            SupplementCheckoutError ||
          error instanceof
            FullPaymentSupplementError
            ? error.status
            : 503,
      }
    );
  }
}
