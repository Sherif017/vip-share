import { NextResponse } from "next/server";

import {
  canManageVipOffer,
  getAdminAccess,
} from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        { success: false, error: "Utilisateur non connecté." },
        { status: 401 }
      );
    }

    if (!access.canManageAnyClub) {
      return NextResponse.json(
        { success: false, error: "Accès administrateur requis." },
        { status: 403 }
      );
    }

    if (!(await canManageVipOffer(access, id))) {
      return NextResponse.json(
        { success: false, error: "Tu n'as pas accès à cette table." },
        { status: 403 }
      );
    }

    let body;
    try { body = await request.json(); }
    catch { return NextResponse.json({ success: false, error: "JSON invalide." }, { status: 400 }); }
    const targetOfferId =
      typeof body?.targetOfferId === "string"
        ? body.targetOfferId.trim()
        : "";

    if (!targetOfferId) {
      return NextResponse.json(
        { success: false, error: "Table cible manquante." },
        { status: 400 }
      );
    }

    if (targetOfferId === id) {
      return NextResponse.json(
        {
          success: false,
          error: "Une table ne peut pas fusionner avec elle-même.",
        },
        { status: 400 }
      );
    }

    // Sécurité supplémentaire : le Manager/Club Admin doit également
    // pouvoir gérer la table cible.
    if (!(await canManageVipOffer(access, targetOfferId))) {
      return NextResponse.json(
        {
          success: false,
          error: "Tu n'as pas accès à la table cible.",
        },
        { status: 403 }
      );
    }

    // Le RPC revérifie les règles métier sous verrou SQL :
    // même soirée, capacité, tarifs, statut, fusion active, etc.
    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin.rpc(
      "admin_propose_vip_offer_merge",
      {
        p_source_offer_id: id,
        p_target_offer_id: targetOfferId,
        p_admin_user_id: access.userId,
        p_expires_at: expiresAt,
      }
    );

    if (error) {
      if (error.code === "PGRST202") {
        return NextResponse.json({ success: false, error: "La fusion est temporairement indisponible." }, { status: 503 });
      }
      return NextResponse.json(
        {
          success: false,
          error:
            error.message ||
            "Impossible de proposer cette fusion.",
        },
        { status: error.code === "42501" ? 403 : error.code === "P0001" ? 409 : error.code === "22023" ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      merge: data,
      message:
        "La proposition de fusion a été créée. Les participants doivent maintenant l'accepter.",
    });
  } catch (error) {
    console.error("propose-merge error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de proposer cette fusion.",
      },
      { status: 500 }
    );
  }
}
