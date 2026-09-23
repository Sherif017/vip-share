import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

/**
 * `null` when RESEND_API_KEY is not configured. Every caller must handle
 * this explicitly and must never throw in that case. The absence is
 * logged only at actual dispatch time (see
 * lib/email/reservation-confirmed.ts), never here at module import time —
 * this file is evaluated during "Collecting page data"/build, and a log
 * there would fire on every build regardless of whether an email was
 * ever attempted.
 */
export const resend = apiKey ? new Resend(apiKey) : null;

export const EMAIL_FROM = "K-RÉ <reservations@k-re.org>";
export const EMAIL_REPLY_TO = "support@k-re.org";
