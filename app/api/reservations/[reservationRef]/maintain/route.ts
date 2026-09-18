import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

/*
|--------------------------------------------------------------------------
| POST
|--------------------------------------------------------------------------
*/

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
      reservationRef: code,
    } =
      await params;

    /*
    |--------------------------------------------------------------------------
    | Auth
    |--------------------------------------------------------------------------
    */

    const supabase =
      await createClient();

    const {
      data: {
        user,
      },
    } =
      await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Réservation
    |--------------------------------------------------------------------------
    */

    const {
      data:
        reservation,

      error:
        reservationError,
    } =
      await supabaseAdmin
        .from(
          "reservations"
        )
        .select(`
          id,
          user_id,
          vip_offer_id,

          status,

          decision_choice,

          supplement_amount,
          supplement_status,

          refunded_at,

          vip_offers (
            id,
            status,
            decision_expires_at
          )
        `)
        .eq(
          "reservation_code",
          code
        )
        .maybeSingle();

    /*
    |--------------------------------------------------------------------------
    | Introuvable
    |--------------------------------------------------------------------------
    */

    if (
      reservationError ||
      !reservation
    ) {
      console.error(
        "Réservation maintain introuvable :",
        reservationError
      );

      return NextResponse.json(
        {
          error:
            "Réservation introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Vérification propriétaire
    |--------------------------------------------------------------------------
    */

    if (
      reservation.user_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Accès interdit.",
        },
        {
          status: 403,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Réservation confirmée uniquement
    |--------------------------------------------------------------------------
    */

    if (
      reservation.status !==
      "confirmed"
    ) {
      return NextResponse.json(
        {
          error:
            "Cette réservation ne peut pas être maintenue.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Pas après remboursement
    |--------------------------------------------------------------------------
    */

    if (
      reservation.refunded_at
    ) {
      return NextResponse.json(
        {
          error:
            "Cette réservation a déjà été remboursée.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Pas de changement après paiement supplément
    |--------------------------------------------------------------------------
    */

    if (
      reservation.supplement_status ===
      "paid"
    ) {
      return NextResponse.json(
        {
          error:
            "Le supplément de cette réservation a déjà été payé.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Relation table
    |--------------------------------------------------------------------------
    */

    const offer =
      Array.isArray(
        reservation.vip_offers
      )
        ? reservation
            .vip_offers[0]
        : reservation.vip_offers;

    if (!offer) {
      return NextResponse.json(
        {
          error:
            "Table VIP introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Table en décision uniquement
    |--------------------------------------------------------------------------
    */

    if (
      offer.status !==
      "decision_pending"
    ) {
      return NextResponse.json(
        {
          error:
            "Cette table n'est plus en période de décision.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Deadline décision
    |--------------------------------------------------------------------------
    */

    if (
      offer.decision_expires_at &&
      new Date(
        offer.decision_expires_at
      ).getTime() <=
        Date.now()
    ) {
      /*
      |--------------------------------------------------------------------------
      | On demande au moteur de résoudre l'expiration
      |--------------------------------------------------------------------------
      */

      await supabaseAdmin.rpc(
        "resolve_vip_offer_decision",
        {
          p_vip_offer_id:
            reservation.vip_offer_id,
        }
      );

      return NextResponse.json(
        {
          error:
            "La période de décision est terminée.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Enregistrer le choix
    |--------------------------------------------------------------------------
    */

    const now =
      new Date().toISOString();

    const {
      error:
        updateError,
    } =
      await supabaseAdmin
        .from(
          "reservations"
        )
        .update({
          decision_choice:
            "maintain",

          decision_at:
            now,

          refund_requested_at:
            null,

          supplement_status:
            "pending",
        })
        .eq(
          "id",
          reservation.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (
      updateError
    ) {
      console.error(
        "Erreur choix maintain :",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Impossible d'enregistrer ton choix.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Résoudre état global de la table
    |--------------------------------------------------------------------------
    */

    const {
      data:
        resolvedStatus,

      error:
        resolveError,
    } =
      await supabaseAdmin.rpc(
        "resolve_vip_offer_decision",
        {
          p_vip_offer_id:
            reservation.vip_offer_id,
        }
      );

    if (
      resolveError
    ) {
      console.error(
        "Erreur résolution table :",
        resolveError
      );

      return NextResponse.json(
        {
          error:
            "Ton choix a été enregistré mais l'état de la table n'a pas pu être recalculé.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Success
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,

      choice:
        "maintain",

      supplementAmount:
        Number(
          reservation.supplement_amount ??
            0
        ),

      tableStatus:
        resolvedStatus,
    });
  } catch (
    error
  ) {
    console.error(
      "POST maintain reservation :",
      error
    );

    return NextResponse.json(
      {
        error:
          "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}