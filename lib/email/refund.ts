import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { claimAndSend } from "@/lib/email/dispatch";
import { emailShell, factCard, factLine, formatEuros, RESERVATIONS_URL } from "@/lib/email/shared";

/**
 * Emails E & F — "Remboursement demandé/en cours" et "terminé".
 *
 * Both are keyed by the actual vip_refunds.id (entity_id), not just the
 * reservation: a single reservation can have up to two distinct refunds
 * (initial_deposit and supplement, unique(reservation_id, payment_type)
 * on vip_refunds), each needing its own pair of E/F emails. This is
 * exactly the case the P0 (reservation_id, email_type) uniqueness could
 * not have handled — see the P1 migration adding entity_id.
 *
 * Called from the only place vip_refunds rows are created/progressed:
 * app/api/admin/reservations/[id]/refund/route.ts.
 *   - E fires right after a successful claim_vip_refund (status -> 'refunding').
 *   - F fires right after a successful complete_vip_refund (status -> 'refunded').
 * Never fires "remboursé" before complete_vip_refund has actually run.
 */

export async function dispatchRefundRequestedEmail(refund: {
  id: string;
  reservation_id: string;
  payment_type: "initial_deposit" | "supplement";
  amount: number | null;
}) {
  await claimAndSend({
    reservationId: refund.reservation_id,
    emailType: "refund_requested",
    entityId: refund.id,
    idempotencyKey: `refund-requested/${refund.id}`,
    buildMessage: () => buildRequestedMessage(refund),
  });
}

export async function dispatchRefundCompletedEmail(refund: {
  id: string;
  reservation_id: string;
  payment_type: "initial_deposit" | "supplement";
  amount: number | null;
}) {
  await claimAndSend({
    reservationId: refund.reservation_id,
    emailType: "refund_completed",
    entityId: refund.id,
    idempotencyKey: `refund-completed/${refund.id}`,
    buildMessage: () => buildCompletedMessage(refund),
  });
}

async function loadReservationContext(reservationId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select(
      `
      firstname,
      email,
      reservation_code,
      events ( name )
    `
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw error;
  if (!reservation) throw new Error("Réservation introuvable pour l'email.");
  if (!reservation.email) throw new Error("Adresse email absente sur la réservation.");

  const event = Array.isArray(reservation.events) ? reservation.events[0] : reservation.events;

  return { reservation, event };
}

function paymentTypeLabel(type: "initial_deposit" | "supplement") {
  return type === "supplement" ? "Supplément" : "Deposit";
}

async function buildRequestedMessage(refund: {
  reservation_id: string;
  payment_type: "initial_deposit" | "supplement";
  amount: number | null;
}) {
  const { reservation, event } = await loadReservationContext(refund.reservation_id);

  const rows = [
    factLine("", event?.name ?? "", { emphasis: true }),
    factLine("Réf.", reservation.reservation_code),
    factLine("Concerne", paymentTypeLabel(refund.payment_type)),
  ];

  if (refund.amount != null) {
    rows.push(factLine("Montant", formatEuros(refund.amount / 100)));
  }

  rows.push(factLine("Statut", "Remboursement en cours"));

  const html = emailShell({
    heading: "Ton remboursement est en cours.",
    subheading: `${reservation.firstname}, nous avons lancé ton remboursement.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir mes réservations",
  });

  return {
    to: reservation.email,
    subject: "Ton remboursement K-RÉ est en cours",
    html,
  };
}

async function buildCompletedMessage(refund: {
  reservation_id: string;
  payment_type: "initial_deposit" | "supplement";
  amount: number | null;
}) {
  const { reservation, event } = await loadReservationContext(refund.reservation_id);

  const rows = [
    factLine("", event?.name ?? "", { emphasis: true }),
    factLine("Réf.", reservation.reservation_code),
    factLine("Concerne", paymentTypeLabel(refund.payment_type)),
  ];

  if (refund.amount != null) {
    rows.push(factLine("Montant remboursé", formatEuros(refund.amount / 100), { emphasis: true }));
  }

  const html = emailShell({
    heading: "Ton remboursement est terminé.",
    subheading: `${reservation.firstname}, ton remboursement a bien été effectué.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir mes réservations",
  });

  return {
    to: reservation.email,
    subject: "Ton remboursement K-RÉ est terminé",
    html,
  };
}
