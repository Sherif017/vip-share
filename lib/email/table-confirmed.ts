import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { claimAndSend } from "@/lib/email/dispatch";
import {
  emailShell,
  factCard,
  factLine,
  formatEuros,
  RESERVATIONS_URL,
} from "@/lib/email/shared";

const EMAIL_TYPE = "table_confirmed";

/**
 * Email A — "Table confirmée".
 *
 * A vip_offer (table) reaches status = 'confirmed' through exactly three
 * code paths in the current schema: the automatic threshold trigger
 * (public.trigger_refresh_vip_offer_status, fired on any reservations
 * insert/update — this is what runs transparently inside
 * confirm_vip_reservation_payment), public.admin_accept_vip_offer_as_is,
 * and public.finalize_vip_offer_merge on the merge's target offer. This
 * function is deliberately callable from all three call sites: it is a
 * pure read-then-fan-out, and re-checking it from several places is
 * cheap and safe thanks to the per-reservation atomic claim — it never
 * causes a duplicate email.
 *
 * Distinct from P0 reservation_confirmed: P0 fires per individual
 * reservation the moment ITS OWN Stripe payment clears. This fires per
 * reservation the moment the WHOLE TABLE becomes confirmed — a later,
 * separate, table-level event that can affect several reservations at
 * once (including ones whose own P0 email was sent well before).
 *
 * NEVER throws.
 */
export async function dispatchTableConfirmedEmails(
  vipOfferId: string,
  options: { excludeReservationIds?: string[] } = {}
) {
  const { data: offer, error: offerError } = await supabaseAdmin
    .from("vip_offers")
    .select("id, status")
    .eq("id", vipOfferId)
    .maybeSingle();

  if (offerError) {
    console.error("Email table_confirmed : lecture vip_offers impossible", {
      vipOfferId,
      message: offerError.message,
    });
    return;
  }

  if (!offer || offer.status !== "confirmed") {
    return;
  }

  const { data: reservations, error: reservationsError } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .eq("vip_offer_id", vipOfferId)
    .eq("status", "confirmed");

  if (reservationsError) {
    console.error("Email table_confirmed : lecture reservations impossible", {
      vipOfferId,
      message: reservationsError.message,
    });
    return;
  }

  const excluded = new Set(options.excludeReservationIds ?? []);

  for (const reservation of (reservations ?? []).filter((r) => !excluded.has(r.id))) {
    await claimAndSend({
      reservationId: reservation.id,
      emailType: EMAIL_TYPE,
      idempotencyKey: `table-confirmed/${reservation.id}`,
      buildMessage: () => buildMessage(reservation.id),
    });
  }
}

async function buildMessage(reservationId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select(
      `
      firstname,
      email,
      quantity,
      reservation_code,
      deposit_paid,
      remaining_amount,
      vip_offers ( table_number ),
      events (
        name,
        event_date,
        start_time,
        clubs ( name, city )
      )
    `
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw error;
  if (!reservation) throw new Error("Réservation introuvable pour l'email.");

  const offer = Array.isArray(reservation.vip_offers)
    ? reservation.vip_offers[0]
    : reservation.vip_offers;

  const event = Array.isArray(reservation.events)
    ? reservation.events[0]
    : reservation.events;

  const club = event
    ? Array.isArray(event.clubs)
      ? event.clubs[0]
      : event.clubs
    : null;

  if (!offer || !event || !club) {
    throw new Error("Données de réservation incomplètes pour l'email.");
  }

  if (!reservation.email) {
    throw new Error("Adresse email absente sur la réservation.");
  }

  const quantity = Number(reservation.quantity);
  const depositPaid = Number(reservation.deposit_paid);
  const remainingAmount = Number(reservation.remaining_amount);

  const rows = [
    factLine("", event.name, { emphasis: true }),
    factLine("", `${club.name} — ${club.city}`),
    factLine("", `${event.event_date} · ${event.start_time}`),
    factLine("Table", offer.table_number),
    factLine("Places", `${quantity} place${quantity > 1 ? "s" : ""}`),
    factLine("Réf.", reservation.reservation_code),
    factLine("Déjà payé", formatEuros(depositPaid)),
  ];

  if (remainingAmount > 0) {
    rows.push(factLine("Restant sur place", formatEuros(remainingAmount)));
  }

  const html = emailShell({
    heading: "Ta table est confirmée.",
    subheading: `${reservation.firstname}, ta table VIP est officiellement confirmée.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir ma réservation",
  });

  return {
    to: reservation.email,
    subject: "Ta table K-RÉ est confirmée ✨",
    html,
  };
}
