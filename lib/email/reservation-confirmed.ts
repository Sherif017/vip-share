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

const EMAIL_TYPE = "reservation_confirmed";

/**
 * Dispatches the "reservation confirmed" email for a given reservation.
 *
 * Safe to call on every webhook delivery — first attempt, Stripe replay,
 * or manual redelivery from the Stripe dashboard. The DB claim
 * (claim_reservation_email, via claimAndSend) is the real
 * concurrency/idempotency guard, not this function's control flow.
 *
 * NEVER throws. Any failure is logged and leaves the tracking row in a
 * retryable state; it must never affect the caller's response to Stripe
 * or the reservation's confirmed status.
 */
export async function dispatchReservationConfirmedEmail(
  reservationId: string
) {
  await claimAndSend({
    reservationId,
    emailType: EMAIL_TYPE,
    idempotencyKey: `reservation-confirmed/${reservationId}`,
    buildMessage: () => buildMessage(reservationId),
  });
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
    factLine("Deposit payé", formatEuros(depositPaid)),
  ];

  if (remainingAmount > 0) {
    rows.push(factLine("Restant sur place", formatEuros(remainingAmount)));
  }

  const html = emailShell({
    heading: "Ta place en VIP.",
    subheading: `Ta réservation est enregistrée, ${reservation.firstname}.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir ma réservation",
  });

  return {
    to: reservation.email,
    subject: "Ta réservation K-RÉ est enregistrée ✨",
    html,
  };
}
