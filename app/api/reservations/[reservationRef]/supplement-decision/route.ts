import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type DecisionChoice = "maintain" | "refund";

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
    const { reservationRef: id } = await params;

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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

    const body = await request.json();

    const choice =
      body?.choice === "maintain" ||
      body?.choice === "refund"
        ? (body.choice as DecisionChoice)
        : null;

    if (!choice) {
      return NextResponse.json(
        {
          success: false,
          error: "Choix invalide.",
        },
        {
          status: 400,
        }
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
        status,
        decision_choice
      `)
      .eq("id", id)
      .maybeSingle();

    if (reservationError) {
      console.error(
        "Erreur lecture réservation décision supplément :",
        reservationError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Impossible de vérifier la réservation.",
        },
        {
          status: 500,
        }
      );
    }

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error: "Réservation introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    if (reservation.user_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Cette réservation ne t'appartient pas.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      reservation.status !== "confirmed" &&
      reservation.status !== "checked_in"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette réservation ne peut pas participer à cette décision.",
        },
        {
          status: 409,
        }
      );
    }

    if (reservation.decision_choice) {
      return NextResponse.json(
        {
          success: false,
          error: "Ton choix a déjà été enregistré.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: result,
      error: decisionError,
    } = await supabaseAdmin.rpc(
      "customer_decide_vip_offer_supplement",
      {
        p_reservation_id: reservation.id,
        p_user_id: user.id,
        p_choice: choice,
      }
    );

    if (decisionError) {
      return NextResponse.json(
        {
          success: false,
          error:
            decisionError.message ||
            "Impossible d'enregistrer ton choix.",
        },
        {
          status: 409,
        }
      );
    }

    return NextResponse.json({
      success: true,
      decision: result,
      message:
        choice === "maintain"
          ? "Ta réservation est maintenue sous réserve de l'accord de tous les participants."
          : "Ta demande de remboursement a été enregistrée.",
    });
  } catch (error) {
    console.error(
      "supplement-decision error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}
