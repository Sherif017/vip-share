import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_STATUSES = [
  "published",
  "draft",
  "cancelled",
];

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await context.params;

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

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Erreur récupération profil admin :",
        profileError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de vérifier les droits administrateur.",
        },
        {
          status: 500,
        }
      );
    }

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

    const status =
      typeof body.status === "string"
        ? body.status.trim()
        : "";

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: "Statut invalide.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: existingEvent,
      error: existingEventError,
    } = await supabaseAdmin
      .from("events")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (existingEventError) {
      console.error(
        "Erreur récupération soirée :",
        existingEventError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de récupérer cette soirée.",
        },
        {
          status: 500,
        }
      );
    }

    if (!existingEvent) {
      return NextResponse.json(
        {
          error: "Soirée introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: updatedEvent,
      error: updateError,
    } = await supabaseAdmin
      .from("events")
      .update({
        status,
      })
      .eq("id", id)
      .select("id, status")
      .single();

    if (updateError) {
      console.error(
        "Erreur modification statut soirée :",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de modifier le statut.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Statut modifié avec succès.",
      event: updatedEvent,
    });
  } catch (error) {
    console.error(
      "PATCH /api/admin/events/[id]/status :",
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