import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { claimAndSend } from "@/lib/email/dispatch";
import { dispatchTableConfirmedEmails } from "@/lib/email/table-confirmed";
import { emailShell, factCard, factLine, RESERVATIONS_URL } from "@/lib/email/shared";

const EMAIL_TYPE = "merge_proposed";

/**
 * Email B — "Proposition de fusion".
 *
 * Called right after a successful public.admin_propose_vip_offer_merge
 * (app/api/admin/vip-offers/[id]/propose-merge/route.ts). That RPC's own
 * jsonb response does not include the created proposal's id, so this
 * looks it up by (source_offer_id, status='pending') immediately after —
 * a read-only, additive step; the RPC itself is untouched.
 *
 * Only the SOURCE offer's participants (source_reservation_ids) decide
 * on the merge, so only they receive this email.
 */
export async function dispatchMergeProposedEmails(sourceOfferId: string) {
  const { data: proposal, error } = await supabaseAdmin
    .from("vip_merge_proposals")
    .select("id, source_offer_id, target_offer_id, source_reservation_ids")
    .eq("source_offer_id", sourceOfferId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Email merge_proposed : lecture proposition impossible", {
      sourceOfferId,
      message: error.message,
    });
    return;
  }

  if (!proposal) return;

  for (const reservationId of proposal.source_reservation_ids ?? []) {
    await claimAndSend({
      reservationId,
      emailType: EMAIL_TYPE,
      entityId: proposal.id,
      idempotencyKey: `merge-proposed/${proposal.id}/${reservationId}`,
      buildMessage: () => buildProposedMessage(reservationId, proposal.target_offer_id),
    });
  }
}

async function buildProposedMessage(reservationId: string, targetOfferId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select(
      `
      firstname,
      email,
      reservation_code,
      quantity,
      vip_offers ( table_number ),
      events ( name, event_date, start_time, clubs ( name, city ) )
    `
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw error;
  if (!reservation) throw new Error("Réservation introuvable pour l'email.");
  if (!reservation.email) throw new Error("Adresse email absente sur la réservation.");

  const currentOffer = Array.isArray(reservation.vip_offers)
    ? reservation.vip_offers[0]
    : reservation.vip_offers;
  const event = Array.isArray(reservation.events) ? reservation.events[0] : reservation.events;
  const club = event ? (Array.isArray(event.clubs) ? event.clubs[0] : event.clubs) : null;

  const { data: targetOffer } = await supabaseAdmin
    .from("vip_offers")
    .select("table_number")
    .eq("id", targetOfferId)
    .maybeSingle();

  if (!currentOffer || !event || !club) {
    throw new Error("Données de réservation incomplètes pour l'email.");
  }

  const rows = [
    factLine("", event.name, { emphasis: true }),
    factLine("", `${club.name} — ${club.city}`),
    factLine("", `${event.event_date} · ${event.start_time}`),
    factLine("Table actuelle", currentOffer.table_number),
  ];

  if (targetOffer?.table_number) {
    rows.push(factLine("Nouvelle table proposée", targetOffer.table_number));
  }

  rows.push(factLine("Places", `${Number(reservation.quantity)}`));
  rows.push(factLine("Réf.", reservation.reservation_code));

  const html = emailShell({
    heading: "Une nouvelle table t'est proposée.",
    subheading: `${reservation.firstname}, le club te propose de rejoindre une autre table pour compléter ta soirée.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir la proposition",
  });

  return {
    to: reservation.email,
    subject: "Une nouvelle table VIP t'est proposée",
    html,
  };
}

const FINALIZED_EMAIL_TYPE = "merge_completed";

/**
 * Email C — "Fusion acceptée / finalisée".
 *
 * Only fires when public.finalize_vip_offer_merge actually returns
 * status: 'completed' (all source participants accepted and were
 * transferred to the target table) — never for 'refused', 'expired' or
 * 'invalidated'. Called from both real call sites of finalize:
 * app/api/reservations/[reservationRef]/merge-decision/route.ts (last
 * participant's own decision triggers finalize) and the cron sweep
 * (app/api/cron/maintenance/route.ts, expire_due_merge_proposals loop).
 */
export async function dispatchMergeFinalizedEmails(sourceOfferId: string) {
  const { data: proposal, error } = await supabaseAdmin
    .from("vip_merge_proposals")
    .select("id, target_offer_id, source_reservation_ids, status")
    .eq("source_offer_id", sourceOfferId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Email merge_completed : lecture proposition impossible", {
      sourceOfferId,
      message: error.message,
    });
    return;
  }

  if (!proposal || proposal.status !== "completed") return;

  for (const reservationId of proposal.source_reservation_ids ?? []) {
    await claimAndSend({
      reservationId,
      emailType: FINALIZED_EMAIL_TYPE,
      entityId: proposal.id,
      idempotencyKey: `merge-completed/${proposal.id}/${reservationId}`,
      buildMessage: () => buildFinalizedMessage(reservationId),
    });
  }

  // La fusion transfère des participants vers la table cible, qui peut
  // ainsi franchir son propre seuil de confirmation (Email A). On exclut
  // les réservations sources tout juste transférées : elles viennent de
  // recevoir merge_completed, qui décrit déjà leur nouvelle table
  // confirmée — leur renvoyer table_confirmed serait un deuxième email
  // sémantiquement redondant pour la même information. Seuls les
  // participants déjà présents sur la table cible avant la fusion (non
  // encore notifiés si le seuil vient tout juste d'être franchi grace à
  // cette fusion) doivent recevoir table_confirmed ici.
  try {
    await dispatchTableConfirmedEmails(proposal.target_offer_id, {
      excludeReservationIds: proposal.source_reservation_ids ?? [],
    });
  } catch (emailError) {
    console.error("Email table_confirmed après fusion : échec", {
      targetOfferId: proposal.target_offer_id,
      message: emailError instanceof Error ? emailError.message : "Erreur inconnue",
    });
  }
}

async function buildFinalizedMessage(reservationId: string) {
  const { data: reservation, error } = await supabaseAdmin
    .from("reservations")
    .select(
      `
      firstname,
      email,
      reservation_code,
      quantity,
      total_price,
      vip_offers ( table_number ),
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
    factLine("Nouvelle table", offer.table_number),
    factLine("Places", `${Number(reservation.quantity)}`),
    factLine("Montant", `${Number(reservation.total_price).toFixed(2)} €`),
    factLine("Réf.", reservation.reservation_code),
  ];

  const html = emailShell({
    heading: "Ta fusion de table est confirmée.",
    subheading: `${reservation.firstname}, ta place est maintenant sur la nouvelle table.`,
    bodyHtml: factCard(rows),
    ctaUrl: RESERVATIONS_URL,
    ctaLabel: "Voir ma réservation",
  });

  return {
    to: reservation.email,
    subject: "Ta table K-RÉ a été mise à jour",
    html,
  };
}
