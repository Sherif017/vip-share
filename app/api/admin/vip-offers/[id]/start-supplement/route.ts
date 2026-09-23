import { NextResponse } from "next/server";

import {
  canManageVipOffer,
  getAdminAccess,
} from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dispatchSupplementRequiredEmails } from "@/lib/email/supplement";

export async function POST(
  _request: Request,
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

    const expiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin.rpc(
      "admin_start_vip_offer_supplement",
      {
        p_offer_id: id,
        p_admin_user_id: access.userId,
        p_expires_at: expiresAt,
      }
    );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.message ||
            "Impossible de lancer la proposition de supplément.",
        },
        { status: 409 }
      );
    }

    // Une panne d'email ne doit jamais faire échouer cette décision
    // admin, déjà validée et commitée par le RPC ci-dessus.
    //
    // roundKey = decision_started_at : le schéma actuel n'a pas de
    // colonne "decision_id"/"snapshot_id" dédiée (vérifié dans la
    // baseline et toutes les migrations start-supplement), donc pas
    // d'identifiant plus robuste disponible sans toucher au modèle
    // métier — ce qui n'est pas demandé. Entre les deux timestamps du
    // round (decision_started_at, decision_expires_at), on préfère
    // decision_started_at : fixé par now() côté SQL au moment du commit
    // du round, alors que expires_at n'est qu'une valeur calculée côté
    // Node puis simplement renvoyée en écho par le RPC. La RPC elle-même
    // ne renvoie pas decision_started_at : on le relit juste après,
    // lecture additionnelle, aucun changement du RPC.
    if (data && typeof data === "object" && "offer_id" in data) {
      try {
        const { data: offerRow } = await supabaseAdmin
          .from("vip_offers")
          .select("decision_started_at")
          .eq("id", id)
          .maybeSingle();

        const roundKey = offerRow?.decision_started_at
          ? String(offerRow.decision_started_at)
          : String(data.expires_at);

        await dispatchSupplementRequiredEmails(id, roundKey);
      } catch (emailError) {
        console.error("start-supplement : envoi de l'email de décision impossible", {
          offerId: id,
          message: emailError instanceof Error ? emailError.message : "Erreur inconnue",
        });
      }
    }

    return NextResponse.json({
      success: true,
      decision: data,
      message:
        "La proposition de supplément a été envoyée aux participants.",
    });
  } catch (error) {
    console.error("start-supplement error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de lancer la proposition de supplément.",
      },
      { status: 500 }
    );
  }
}
