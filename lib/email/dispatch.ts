import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/resend";

type Message = {
  to: string;
  subject: string;
  html: string;
};

type ClaimAndSendArgs = {
  reservationId: string;
  emailType: string;
  idempotencyKey: string;
  entityId?: string;
  /**
   * Builds the actual message. Only invoked after a successful claim, so
   * it never runs speculatively for an attempt some other caller already
   * owns or has completed.
   */
  buildMessage: () => Promise<Message>;
};

/**
 * Shared orchestration for every K-RÉ transactional email:
 *
 *   claim (DB, atomic) -> build message -> Resend -> sent/failed
 *
 * NEVER throws. Any failure is logged and leaves the tracking row
 * retryable; it must never affect the caller's business transition
 * (payment, decision, refund, ...). This is the exact same contract
 * validated for the P0 reservation_confirmed email, reused as-is here
 * instead of being re-implemented per email type.
 */
export async function claimAndSend({
  reservationId,
  emailType,
  idempotencyKey,
  entityId = "",
  buildMessage,
}: ClaimAndSendArgs): Promise<void> {
  let claim: {
    claimed: boolean;
    row_id: string;
    attempts: number;
    status: string;
    idempotency_key: string;
  } | null = null;

  try {
    const { data, error } = await supabaseAdmin.rpc("claim_reservation_email", {
      p_reservation_id: reservationId,
      p_email_type: emailType,
      p_idempotency_key: idempotencyKey,
      p_entity_id: entityId,
    });

    if (error) throw error;

    claim = Array.isArray(data) ? data[0] : data;
  } catch (error) {
    console.error("Email K-RÉ : échec du claim DB", {
      reservationId,
      emailType,
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
    console.error("Email K-RÉ : RESEND_API_KEY absente, envoi reporté", {
      reservationId,
      emailType,
    });
    await markFailed(rowId, "RESEND_API_KEY absente");
    return;
  }

  try {
    const { to, subject, html } = await buildMessage();

    if (!to) {
      throw new Error("Adresse email absente.");
    }

    const { data: sendResult, error: sendError } = await resend.emails.send(
      { from: EMAIL_FROM, to, replyTo: EMAIL_REPLY_TO, subject, html },
      { idempotencyKey: claim.idempotency_key }
    );

    if (sendError) throw sendError;

    await markSent(rowId, sendResult?.id ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";

    console.error("Email K-RÉ : échec de l'envoi", {
      reservationId,
      emailType,
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
    console.error("Email K-RÉ : échec de la mise à jour 'sent'", {
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
    console.error("Email K-RÉ : échec de la mise à jour 'failed'", {
      rowId,
      message: error.message,
    });
  }
}
