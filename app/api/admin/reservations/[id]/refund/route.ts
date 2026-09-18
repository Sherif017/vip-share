import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { canManageVipOffer, getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RefundRow = {
  id: string; payment_type: "initial_deposit" | "supplement";
  stripe_session_id: string; status: "refund_pending" | "refunding" | "refunded";
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (!access) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reservation = await supabaseAdmin.from("reservations")
    .select("id,user_id,vip_offer_id,deposit_paid,supplement_amount")
    .eq("id", id).maybeSingle();
  if (reservation.error || !reservation.data) return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
  if (!(await canManageVipOffer(access, reservation.data.vip_offer_id))) return NextResponse.json({ error: "Accès interdit." }, { status: 403 });

  const prepared = await supabaseAdmin.rpc("prepare_vip_refund", {
    p_reservation_id: id, p_requested_by: access.userId,
    p_reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null,
  });
  if (prepared.error) return NextResponse.json({ error: prepared.error.message }, { status: 409 });
  const rows = (prepared.data ?? []) as RefundRow[];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Aucun paiement Stripe remboursable n'a été trouvé." },
      { status: 409 }
    );
  }
  const results = [];
  for (const row of rows) {
    if (row.status === "refunded") { results.push(row); continue; }
    const claim = await supabaseAdmin.rpc("claim_vip_refund", { p_refund_id: row.id, p_admin_user_id: access.userId });
    if (claim.error) return NextResponse.json({ error: claim.error.message }, { status: 409 });
    const claimed = claim.data as RefundRow;
    if (claimed.status === "refunded") { results.push(claimed); continue; }
    try {
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, { expand: ["payment_intent"] });
      const expectedAmount = row.payment_type === "initial_deposit"
        ? Math.round(Number(reservation.data.deposit_paid) * 100)
        : Math.round(Number(reservation.data.supplement_amount) * 100);
      const metadata = session.metadata ?? {};
      if (!Number.isInteger(expectedAmount) || expectedAmount <= 0) {
        throw new Error("Montant serveur du remboursement indisponible.");
      }
      if (session.status !== "complete" || session.payment_status !== "paid"
        || session.currency?.toLowerCase() !== "eur"
        || session.amount_total !== expectedAmount
        || metadata.payment_type !== row.payment_type
        || metadata.reservation_id !== reservation.data.id
        || metadata.user_id !== reservation.data.user_id
        || metadata.vip_offer_id !== reservation.data.vip_offer_id) {
        throw new Error("Session Stripe incompatible avec la réservation.");
      }
      const paymentIntent = typeof session.payment_intent === "string" ? null : session.payment_intent;
      const intent = typeof session.payment_intent === "string" ? session.payment_intent : paymentIntent?.id;
      if (!intent) throw new Error("PaymentIntent introuvable.");
      if (paymentIntent && (paymentIntent.currency?.toLowerCase() !== "eur"
        || paymentIntent.amount_received !== expectedAmount
        || paymentIntent.status !== "succeeded")) {
        throw new Error("PaymentIntent Stripe incompatible avec la réservation.");
      }
      // Recover a refund whose response/DB completion was lost. This remains
      // safe after Stripe's idempotency-key retention window has elapsed.
      const existingRefunds = await stripe.refunds.list({ payment_intent: intent, limit: 100 });
      const recoverableRefund = existingRefunds.data.find((candidate) =>
        candidate.amount === expectedAmount
        && candidate.currency?.toLowerCase() === "eur"
        && candidate.status !== "failed"
        && candidate.status !== "canceled"
      );
      const refundedAmount = existingRefunds.data
        .filter((candidate) => candidate.status !== "failed" && candidate.status !== "canceled")
        .reduce((sum, candidate) => sum + candidate.amount, 0);
      if (!recoverableRefund && refundedAmount !== 0) {
        throw new Error("PaymentIntent déjà partiellement remboursé avec un montant incompatible.");
      }
      const refund = recoverableRefund ?? await stripe.refunds.create(
        { payment_intent: intent, amount: expectedAmount },
        { idempotencyKey: `vip-refund:${row.id}` },
      );
      if (refund.amount !== expectedAmount || refund.currency?.toLowerCase() !== "eur") {
        throw new Error("Remboursement Stripe d'un montant ou d'une devise inattendue.");
      }
      const completed = await supabaseAdmin.rpc("complete_vip_refund", { p_refund_id: row.id, p_stripe_refund_id: refund.id, p_payment_intent_id: intent, p_amount: expectedAmount, p_processed_by: access.userId });
      if (completed.error) throw completed.error;
      results.push(completed.data);
    } catch (error) {
      await supabaseAdmin.rpc("fail_vip_refund", { p_refund_id: row.id, p_error: error instanceof Error ? error.message : "Erreur Stripe" });
      console.error("Erreur remboursement Stripe", { reservationId: id, refundId: row.id, paymentType: row.payment_type, error });
      return NextResponse.json({ error: "Le remboursement est en attente de nouvelle tentative." }, { status: 502 });
    }
  }
  return NextResponse.json({ success: true, refunds: results });
}
