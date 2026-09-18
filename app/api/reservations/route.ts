import { CheckoutRetryError, initialCheckout } from "@/lib/initial-checkout";
import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  stripe,
} from "@/lib/stripe";

type ReservationRpcResult = {
  reservation_id: string;

  reservation_code: string;

  total_price: number;

  deposit_paid: number;

  remaining_amount: number;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request
) {
  try {
    // ========================================================
    // Auth
    // ========================================================

    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } =
      await supabase
        .auth
        .getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Tu dois être connecté pour effectuer une réservation.",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================================
    // Body
    // ========================================================

    const body =
      await request.json();

    const eventSlug =
      typeof body.eventSlug ===
      "string"
        ? body.eventSlug.trim()
        : "";

    const vipOfferId =
      typeof body.vipOfferId ===
      "string"
        ? body.vipOfferId.trim()
        : "";

    const firstname =
      typeof body.firstname ===
      "string"
        ? body.firstname.trim()
        : "";

    const lastname =
      typeof body.lastname ===
      "string"
        ? body.lastname.trim()
        : "";

    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";

    const phone =
      typeof body.phone ===
      "string"
        ? body.phone.trim()
        : "";

    const quantity =
      Number(
        body.quantity
      );

    const checkoutAttemptId =
      typeof body.checkoutAttemptId === "string"
        ? body.checkoutAttemptId.trim()
        : "";

    // ========================================================
    // Validation
    // ========================================================

    if (!eventSlug) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Événement invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !vipOfferId ||
      !UUID_REGEX.test(
        vipOfferId
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Table invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (!firstname) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Le prénom est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    if (!lastname) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Le nom est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !email ||
      !email.includes("@")
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Adresse email invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (!phone) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Le numéro de téléphone est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(
        quantity
      ) ||
      quantity < 1
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Le nombre de places est invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (!UUID_REGEX.test(checkoutAttemptId)) {
      return NextResponse.json(
        { success: false, error: "Tentative de paiement invalide." },
        { status: 400 }
      );
    }

    // ========================================================
    // Création réservation SQL
    //
    // La table est explicitement transmise.
    // Les prix restent calculés côté serveur.
    // ========================================================

    const {
      data:
        reservationData,

      error:
        reservationError,
    } =
      await supabaseAdmin
        .rpc(
          "create_vip_reservation",
          {
            p_event_slug:
              eventSlug,

            p_vip_offer_id:
              vipOfferId,

            p_user_id:
              user.id,

            p_firstname:
              firstname,

            p_lastname:
              lastname,

            p_email:
              email,

            p_phone:
              phone,

            p_quantity:
              quantity,

            p_checkout_attempt_id:
              checkoutAttemptId,
          }
        );

    if (
      reservationError
    ) {
      console.error(
        "Erreur create_vip_reservation :",
        reservationError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            reservationError.message ||
            "Impossible de créer la réservation.",
        },
        {
          status: 400,
        }
      );
    }

    const reservation =
      reservationData?.[0] as
        | ReservationRpcResult
        | undefined;

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,

          error:
            "La réservation n'a pas pu être créée.",
        },
        {
          status: 500,
        }
      );
    }

    const checkoutUrl = await initialCheckout(
      supabaseAdmin, stripe, reservation.reservation_id,
      user.id, new URL(request.url).origin,
    );

    return NextResponse.json({
      success: true,

      reservation: {
        id:
          reservation.reservation_id,

        code:
          reservation.reservation_code,

        totalPrice:
          Number(
            reservation.total_price
          ),

        depositPaid:
          Number(
            reservation.deposit_paid
          ),

        remainingAmount:
          Number(
            reservation.remaining_amount
          ),
      },

      checkoutUrl,
    });
  } catch (error) {
    // Do not log Stripe/DB error objects or release capacity on ambiguous failures.
    // The same attempt can reconcile a session created before a lost response.
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
