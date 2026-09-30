import { NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * PATCH /api/admin/clubs/[id]/commission
 *
 * Seul point d'écriture de la commission d'un club. Réservé aux admins
 * K-RÉ (profiles.role='manager', is_manager()) — jamais aux managers
 * d'un club. Double protection : cette route vérifie access.isManager
 * côté Node, ET la RPC admin_set_club_commission revérifie is_manager()
 * elle-même côté SQL avant d'écrire (défense en profondeur explicitement
 * demandée : un manager club ne doit jamais pouvoir modifier sa propre
 * commission, même en falsifiant une requête).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;

  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!access.isManager) {
    return NextResponse.json(
      { error: "Seul un administrateur K-RÉ peut modifier la commission d'un club." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const commissionPercent = body?.commissionPercent;

  if (typeof commissionPercent !== "number" || !Number.isFinite(commissionPercent)) {
    return NextResponse.json({ error: "Taux de commission invalide." }, { status: 400 });
  }

  const commissionBps = Math.round(commissionPercent * 100);

  const { data, error } = await supabaseAdmin.rpc("admin_set_club_commission", {
    p_club_id: clubId,
    p_commission_bps: commissionBps,
  });

  if (error) {
    console.error("commission: échec de l'écriture", { clubId, message: error.message });
    return NextResponse.json({ error: "Impossible d'enregistrer la commission." }, { status: 400 });
  }

  return NextResponse.json({ club: data });
}
