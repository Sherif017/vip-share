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

          deposit_paid,

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

    if (
      reservationError ||
      !reservation
    ) {
      console.error(
        "Réservation refund introuvable :",
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
    | Propriétaire
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
    | Réservation valide
    |--------------------------------------------------------------------------
    */

    if (
      reservation.status !==
      "confirmed"
    ) {
      return NextResponse.json(
        {
          error:
            "Cette réservation ne peut pas faire l'objet de cette demande.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Déjà remboursée
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
    | Supplément déjà payé
    |--------------------------------------------------------------------------
    */

    if (
      reservation.supplement_status ===
      "paid"
    ) {
      return NextResponse.json(
        {
          error:
            "Le supplément a déjà été payé. Contacte K-RÉ pour modifier ta réservation.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Table
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
    | Decision pending seulement
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
    | Enregistrer choix remboursement
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
            "refund",

          decision_at:
            now,

          refund_requested_at:
            now,

          supplement_status:
            null,
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
        "Erreur demande remboursement :",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Impossible d'enregistrer la demande de remboursement.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Résolution état global table
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
        "Erreur résolution table après refund :",
        resolveError
      );

      return NextResponse.json(
        {
          error:
            "Ta demande a été enregistrée mais l'état de la table n'a pas pu être recalculé.",
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
        "refund",

      depositAmount:
        Number(
          reservation.deposit_paid ??
            0
        ),

      tableStatus:
        resolvedStatus,
    });
  } catch (
    error
  ) {
    console.error(
      "POST refund request :",
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