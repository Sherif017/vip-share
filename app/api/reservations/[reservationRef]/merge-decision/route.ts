import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reservationRef: string }> }
) {
  const fail = (error: string, status: number) =>
    NextResponse.json({ success: false, error }, { status });

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return fail("Tu dois être connecté.", 401);

    const { reservationRef: id } = await params;
    if (!UUID.test(id)) return fail("Identifiant de réservation invalide.", 400);

    let body;
    try { body = await request.json(); }
    catch { return fail("Requête JSON invalide.", 400); }
    if (!body || !["accept", "refuse"].includes(body.choice)) {
      return fail("Choix invalide.", 400);
    }

    const { data: reservation, error } = await supabaseAdmin
      .from("reservations").select("id, user_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!reservation) return fail("Réservation introuvable.", 404);
    if (reservation.user_id !== user.id) return fail("Cette réservation ne t'appartient pas.", 403);

    const { data, error: rpcError } = await supabaseAdmin.rpc(
      "customer_decide_vip_offer_merge",
      {
        p_reservation_id: reservation.id,
        p_user_id: user.id,
        p_choice: body.choice,
      }
    );
    if (rpcError) {
      console.error("merge-decision RPC:", rpcError);
      if (rpcError.code === "PGRST202") return fail("La fusion est temporairement indisponible.", 503);
      if (rpcError.code === "42501") return fail("Accès interdit.", 403);
      if (rpcError.code === "22023") return fail("Choix ou proposition invalide.", 400);
      if (rpcError.code === "P0001") return fail("Cette proposition n'est plus disponible. Recharge la page.", 409);
      throw rpcError;
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result.success !== "boolean") throw new Error("Réponse RPC invalide");
    return NextResponse.json(result, { status: result.success ? 200 : 409 });
  } catch (error) {
    console.error("merge-decision:", error);
    return fail("Impossible d'enregistrer la décision de fusion.", 500);
  }
}
