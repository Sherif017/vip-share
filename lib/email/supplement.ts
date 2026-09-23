import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { claimAndSend } from "@/lib/email/dispatch";
import { emailShell, factCard, factLine, formatEuros, RESERVATIONS_URL } from "@/lib/email/shared";

const EMAIL_TYPE = "supplement_required";

/**
 * Email D — "Supplément / décision requise".
 *
 * Called right after a successful public.admin_start_vip_offer_supplement
 * (app/api/admin/vip-offers/[id]/start-supplement/route.ts). That RPC
 * marks every reservation on the table with supplement_status='pending'
 * and a computed supplement_amount — exactly the population and amounts
 * this email needs, read as-is, no financial calculation duplicated here.
 *
 * `roundKey` is the round's expires_at (ISO string), used as the
 * idempotency entity_id: admin_start_vip_offer_supplement can only be
 * called again from 'admin_review', which a table only returns to via
 * the refund/expiry paths — in practice a single round per table today,
 * but keying on the round rather than the reservation alone keeps this
 * correct if that ever changes, without an aggressive guess.
 */
export async function dispatchSupplementRequiredEmails(offerId: string, roundKey: string) {
  const { data: reservations, error } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .eq("vip_offer_id", offerId)
    .eq("supplement_status", "pending");

  if (error) {
    console.error("Email supplement_required : lecture reservations impossible", {
      offerId,
      message: error.message,
    });
    return;
  }

  for (const reservation of reservations ?? []) {
    await claimAndSend({
      reservationId: reservation.id,
      emailType: EMAIL_TYPE,
      entityId: roundKey,
      idempotencyKey: `supplement-required/${roundKey}/${reservation.id}`,
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
      reservation_code,
      quantity,
      supplement_amount,
      vip_offers ( table_number, decision_price_per_person ),
      events ( name, event_date, start_time, clubs ( name, city ) )
    `
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw error;
  if (!reservation) throw new Error("Réservation introuvable pour l'email.");
  if (!reservation.email) throw new Error("Adresse email absente sur la réservation.");

  const offer = Array.isArray(reservation.vip_offers) ? reservation.vip_offers[0] : reservation.vip_offers;
  const event = Array.isArray(reservation.events) ? reservation.events[0] : reservation.events;
  const club = event ? (Array.isArray(event.clubs) ? event.clubs[0] : event.clubs) : null;

  if (!offer || !event || !club) {
    throw new Error("Données de réservation incomplètes pour l'email.");
  }

  const rows = [
    factLine("", event.name, { emphasis: true }),
    factLine("", `${club.name} — ${club.city}`),
    factLine("Table", offer.table_number),
    factLine("Places", `${Number(reservation.quantity)}`),
  ];

  if (offer.decision_price_per_person != null) {
    rows.push(factLine("Nouveau prix / personne", formatEuros(Number(offer.decision_price_per_person))));
  }

  rows.push(factLine("Supplément demandé", formatEuros(Number(reservation.supplement_amount)), { emphasis: true }));
  rows.push(factLine("Réf.", reservation.reservation_code));

  const html = emailShell({
    heading: "Une décision est nécessaire.",
    subheading: `${reservation.firstname}, ta table n'a pas atteint le seuil prévu. Le club te propose un supplément pour maintenir ta place.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir et décider",
  });

  return {
    to: reservation.email,
    subject: "Une décision est nécessaire pour ta table K-RÉ",
    html,
  };
}
