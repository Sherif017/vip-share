import { NextResponse } from "next/server";

import {
  canManageEvent,
  getAdminAccess,
} from "@/lib/admin-access";

import { supabaseAdmin } from "@/lib/supabase-admin";

type EventStatus =
  | "published"
  | "draft"
  | "cancelled";

type RequestBody = {
  status?: EventStatus;
};

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    // ========================================================
    // 1. EVENT ID
    // ========================================================

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Identifiant de soirée manquant.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 2. UTILISATEUR + DROITS
    // ========================================================

    const access =
      await getAdminAccess();

    if (!access) {
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

    if (!access.canManageAnyClub) {
      return NextResponse.json(
        {
          error:
            "Accès administrateur requis.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 3. VÉRIFIER QUE L'ADMIN PEUT GÉRER CETTE SOIRÉE
    //
    // Manager :
    // → toutes les soirées
    //
    // Club Admin :
    // → uniquement les soirées de son club
    // ========================================================

    const allowed =
      await canManageEvent(
        access,
        id
      );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Vous n'êtes pas autorisé à modifier cette soirée.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 4. BODY
    // ========================================================

    let body: RequestBody;

    try {
      body =
        (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        {
          error:
            "Requête invalide.",
        },
        {
          status: 400,
        }
      );
    }

    const newStatus =
      body.status;

    // ========================================================
    // 5. STATUT AUTORISÉ
    // ========================================================

    const allowedStatuses:
      EventStatus[] = [
        "published",
        "draft",
        "cancelled",
      ];

    if (
      !newStatus ||
      !allowedStatuses.includes(
        newStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Statut de soirée invalide.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 6. RÉCUPÉRER LA SOIRÉE
    // ========================================================

    const {
      data: currentEvent,
      error: currentEventError,
    } = await supabaseAdmin
      .from("events")
      .select(`
        id,
        club_id,
        status,
        name
      `)
      .eq(
        "id",
        id
      )
      .maybeSingle();

    if (currentEventError) {
      console.error(
        "Erreur récupération soirée avant changement statut :",
        currentEventError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de récupérer la soirée.",
        },
        {
          status: 500,
        }
      );
    }

    if (!currentEvent) {
      return NextResponse.json(
        {
          error:
            "Soirée introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // 7. DÉJÀ DANS LE BON STATUT
    // ========================================================

    if (
      currentEvent.status ===
      newStatus
    ) {
      return NextResponse.json({
        success: true,

        status:
          currentEvent.status,

        message:
          "La soirée possède déjà ce statut.",
      });
    }

    // ========================================================
    // 8. MISE À JOUR
    // ========================================================

    const {
      data: updatedEvent,
      error: updateError,
    } = await supabaseAdmin
      .from("events")
      .update({
        status:
          newStatus,
      })
      .eq(
        "id",
        id
      )
      .select(`
        id,
        name,
        status
      `)
      .single();

    if (updateError) {
      console.error(
        "Erreur modification statut soirée :",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de modifier le statut de la soirée.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // 9. MESSAGE
    // ========================================================

    let message =
      "Statut de la soirée modifié.";

    if (
      newStatus ===
      "published"
    ) {
      message =
        "La soirée est maintenant publiée.";
    }

    if (
      newStatus ===
      "draft"
    ) {
      message =
        "La soirée est maintenant en brouillon.";
    }

    if (
      newStatus ===
      "cancelled"
    ) {
      message =
        "La soirée a été annulée.";
    }

    // ========================================================
    // 10. SUCCESS
    // ========================================================

    return NextResponse.json({
      success: true,

      event: {
        id:
          updatedEvent.id,

        name:
          updatedEvent.name,

        status:
          updatedEvent.status,
      },

      message,
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