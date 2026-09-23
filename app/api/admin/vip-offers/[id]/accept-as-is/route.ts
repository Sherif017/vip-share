import { NextResponse } from "next/server";

import {
  canManageClub,
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";
import { dispatchTableConfirmedEmails } from "@/lib/email/table-confirmed";

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } =
      await params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Identifiant de table manquant.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 1. Authentification + permissions globales
    // ========================================================

    const access =
      await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        {
          success: false,
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
          success: false,
          error:
            "Accès administrateur requis.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 2. Récupérer la table
    // ========================================================

    const {
      data: offer,
      error: offerError,
    } = await supabaseAdmin
      .from("vip_offers")
      .select(`
        id,
        event_id,
        table_number,
        status,
        confirmation_threshold
      `)
      .eq("id", id)
      .maybeSingle();

    if (offerError) {
      console.error(
        "Erreur récupération vip_offer accept-as-is :",
        offerError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de récupérer cette table.",
        },
        {
          status: 500,
        }
      );
    }

    if (!offer) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Table VIP introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // 3. Récupérer le club depuis l'événement
    // ========================================================

    const {
      data: event,
      error: eventError,
    } = await supabaseAdmin
      .from("events")
      .select("id, club_id")
      .eq(
        "id",
        offer.event_id
      )
      .maybeSingle();

    if (eventError) {
      console.error(
        "Erreur récupération event accept-as-is :",
        eventError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de vérifier le club de cette table.",
        },
        {
          status: 500,
        }
      );
    }

    if (!event) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Soirée introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // 4. Vérifier que cet admin gère CE club
    // ========================================================

    if (
      !canManageClub(
        access,
        event.club_id
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Vous n'êtes pas autorisé à gérer cette table.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 5. La décision n'est disponible qu'en admin_review
    // ========================================================

    if (
      offer.status !==
      "admin_review"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette table n'est pas en attente d'une décision administrateur.",
        },
        {
          status: 409,
        }
      );
    }

    // ========================================================
    // 6. RPC transactionnelle
    //
    // Cette fonction SQL doit :
    // - fixer status = confirmed
    // - fixer admin_decision = accept_as_is
    // - enregistrer admin_decision_by / admin_decision_at
    // - conserver les prix initiaux
    // - nettoyer les décisions/suppléments non finalisés
    // ========================================================

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "admin_accept_vip_offer_as_is",
      {
        p_vip_offer_id:
          offer.id,

        p_admin_user_id:
          access.userId,
      }
    );

    if (error) {
      console.error(
        "Erreur admin_accept_vip_offer_as_is :",
        error
      );

      const rpcMissing =
        error.code === "PGRST202" ||
        error.message
          ?.toLowerCase()
          .includes(
            "admin_accept_vip_offer_as_is"
          );

      return NextResponse.json(
        {
          success: false,
          error: rpcMissing
            ? "La fonction SQL admin_accept_vip_offer_as_is n'est pas encore installée dans Supabase."
            : "Impossible de confirmer cette table.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // 7. Vérification finale
    // ========================================================

    const {
      data: updatedOffer,
      error: updatedOfferError,
    } = await supabaseAdmin
      .from("vip_offers")
      .select(`
        id,
        table_number,
        status,
        admin_decision,
        admin_decision_at
      `)
      .eq(
        "id",
        offer.id
      )
      .maybeSingle();

    if (updatedOfferError) {
      console.error(
        "Erreur relecture table accept-as-is :",
        updatedOfferError
      );
    }

    // Une panne d'email ne doit jamais faire échouer cette décision
    // admin, déjà validée et commitée par le RPC ci-dessus.
    try {
      await dispatchTableConfirmedEmails(offer.id);
    } catch (emailError) {
      console.error(
        "accept-as-is : envoi de l'email table confirmée impossible",
        {
          offerId: offer.id,
          message:
            emailError instanceof Error
              ? emailError.message
              : "Erreur inconnue",
        }
      );
    }

    return NextResponse.json({
      success: true,

      message:
        `La table n°${offer.table_number} est confirmée telle quelle.`,

      table:
        updatedOffer ?? {
          id:
            offer.id,
          table_number:
            offer.table_number,
          status:
            "confirmed",
          admin_decision:
            "accept_as_is",
        },

      rpcResult:
        data ?? null,
    });
  } catch (error) {
    console.error(
      "POST /api/admin/vip-offers/[id]/accept-as-is :",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}
