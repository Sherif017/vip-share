import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json(
        {
          error: "Accès administrateur requis.",
        },
        {
          status: 403,
        }
      );
    }

    const body = await request.json();

    const code =
      typeof body.code === "string"
        ? body.code.trim()
        : "";

    if (!code) {
      return NextResponse.json(
        {
          error: "Code de réservation manquant.",
        },
        {
          status: 400,
        }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "undo_check_in_reservation",
      {
        p_reservation_code: code,
      }
    );

    if (error) {
      console.error(
        "Erreur undo_check_in_reservation :",
        error
      );

      return NextResponse.json(
        {
          error:
            "Impossible d'annuler cette entrée.",
        },
        {
          status: 500,
        }
      );
    }

    const result = data?.[0];

    if (!result) {
      return NextResponse.json(
        {
          error: "Résultat introuvable.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      reservation: {
        id: result.reservation_id,
        checkedInQuantity:
          result.checked_in_quantity,
        remainingEntries:
          result.remaining_entries,
        checkedIn:
          result.checked_in,
        checkedInAt:
          result.checked_in_at,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/admin/check-in/undo :",
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