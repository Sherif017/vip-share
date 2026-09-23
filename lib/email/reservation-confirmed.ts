import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";

const EMAIL_TYPE = "reservation_confirmed";
const RESERVATIONS_URL = "https://www.k-re.org/reservations";

function buildIdempotencyKey(reservationId: string) {
  return `reservation-confirmed/${reservationId}`;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type EmailData = {
  firstname: string;
  eventName: string;
  clubName: string;
  clubCity: string;
  eventDate: string;
  startTime: string;
  tableNumber: string;
  quantity: number;
  reservationCode: string;
  depositPaid: number;
  remainingAmount: number;
};

export function buildReservationConfirmedEmail(data: EmailData) {
  const subject = "Ta réservation K-RÉ est enregistrée ✨";

  const remainingLine =
    data.remainingAmount > 0
      ? `<p style="margin:0;color:#c9c4ba;font-size:13px;">Restant sur place : ${data.remainingAmount.toFixed(2)} €</p>`
      : "";

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#070707;">
    <div style="background:#070707;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#f7f4ee;">
      <div style="max-width:480px;margin:0 auto;">
        <p style="letter-spacing:0.3em;font-size:12px;text-transform:uppercase;color:#d8b56a;text-align:center;margin:0 0 24px;">K-RÉ</p>
        <h1 style="font-size:22px;text-align:center;margin:0 0 8px;color:#f7f4ee;">Ta place en VIP.</h1>
        <p style="text-align:center;color:#c9c4ba;margin:0 0 28px;">Ta réservation est enregistrée, ${escapeHtml(data.firstname)}.</p>

        <div style="border:1px solid rgba(216,181,106,0.35);border-radius:16px;padding:20px;margin-bottom:28px;">
          <p style="margin:0 0 4px;font-weight:bold;color:#f7f4ee;">${escapeHtml(data.eventName)}</p>
          <p style="margin:0 0 12px;color:#c9c4ba;font-size:14px;">${escapeHtml(data.clubName)} — ${escapeHtml(data.clubCity)}</p>
          <p style="margin:0 0 16px;color:#c9c4ba;font-size:14px;">${escapeHtml(data.eventDate)} · ${escapeHtml(data.startTime)}</p>

          <p style="margin:0 0 4px;color:#c9c4ba;font-size:13px;">Table ${escapeHtml(data.tableNumber)} — ${data.quantity} place${data.quantity > 1 ? "s" : ""}</p>
          <p style="margin:0 0 4px;color:#c9c4ba;font-size:13px;">Réf. ${escapeHtml(data.reservationCode)}</p>
          <p style="margin:0 0 4px;color:#c9c4ba;font-size:13px;">Deposit payé : ${data.depositPaid.toFixed(2)} €</p>
          ${remainingLine}
        </div>

        <div style="text-align:center;margin-bottom:28px;">
          <a href="${RESERVATIONS_URL}" style="display:inline-block;background:#d8b56a;color:#080808;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:999px;">Voir ma réservation</a>
        </div>

        <p style="text-align:center;color:#6b6b6b;font-size:12px;">Une question ? <a href="mailto:${EMAIL_REPLY_TO}" style="color:#6b6b6b;">${EMAIL_REPLY_TO}</a></p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, html };
}

/**
 * Dispatches the "reservation confirmed" email for a given reservation.
 *
 * Safe to call on every webhook delivery — first attempt, Stripe replay,
 * or manual redelivery from the Stripe dashboard. The DB claim
 * (claim_reservation_email) is the real concurrency/idempotency guard,
 * not this function's control flow.
 *
 * NEVER throws. Any failure is logged and leaves the tracking row in a
 * retryable state; it must never affect the caller's response to Stripe
 * or the reservation's confirmed status.
 */
export async function dispatchReservationConfirmedEmail(
  reservationId: string
) {
  const idempotencyKey = buildIdempotencyKey(reservationId);

  let claim: {
    claimed: boolean;
    row_id: string;
    attempts: number;
    status: string;
    idempotency_key: string;
  } | null = null;

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "claim_reservation_email",
      {
        p_reservation_id: reservationId,
        p_email_type: EMAIL_TYPE,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (error) throw error;

    claim = Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.error("Email confirmation : échec du claim DB", {
      reservationId,
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
    return;
  }

  if (!claim || !claim.claimed) {
    // Déjà envoyé, ou un autre processus possède déjà cette tentative.
    return;
  }

  const rowId = claim.row_id;

  if (!resend) {
    console.error(
      "Email confirmation : RESEND_API_KEY absente, envoi reporté",
      { reservationId }
    );
    await markFailed(rowId, "RESEND_API_KEY absente");
    return;
  }

  try {
    const { data: reservation, error: reservationError } =
      await supabaseAdmin
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

    if (reservationError) throw reservationError;
    if (!reservation) {
      throw new Error("Réservation introuvable pour l'email.");
    }

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

    const { subject, html } = buildReservationConfirmedEmail({
      firstname: reservation.firstname,
      eventName: event.name,
      clubName: club.name,
      clubCity: club.city,
      eventDate: event.event_date,
      startTime: event.start_time,
      tableNumber: offer.table_number,
      quantity: Number(reservation.quantity),
      reservationCode: reservation.reservation_code,
      depositPaid: Number(reservation.deposit_paid),
      remainingAmount: Number(reservation.remaining_amount),
    });

    const { data: sendResult, error: sendError } = await resend.emails.send(
      {
        from: EMAIL_FROM,
        to: reservation.email,
        replyTo: EMAIL_REPLY_TO,
        subject,
        html,
      },
      { idempotencyKey: claim.idempotency_key }
    );

    if (sendError) throw sendError;

    await markSent(rowId, sendResult?.id ?? null);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue";

    console.error("Email confirmation : échec de l'envoi", {
      reservationId,
      message,
    });

    await markFailed(rowId, message);
  }
}

async function markSent(rowId: string, resendMessageId: string | null) {
  const { error } = await supabaseAdmin
    .from("reservation_emails")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      resend_message_id: resendMessageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) {
    console.error("Email confirmation : échec de la mise à jour 'sent'", {
      rowId,
      message: error.message,
    });
  }
}

async function markFailed(rowId: string, reason: string) {
  const { error } = await supabaseAdmin
    .from("reservation_emails")
    .update({
      status: "failed",
      last_error: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rowId);

  if (error) {
    console.error("Email confirmation : échec de la mise à jour 'failed'", {
      rowId,
      message: error.message,
    });
  }
}
