import { NextResponse } from "next/server";

import {
  canManageVipOffer,
  getAdminAccess,
} from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
