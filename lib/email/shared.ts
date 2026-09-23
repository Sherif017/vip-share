import "server-only";

import { EMAIL_REPLY_TO } from "@/lib/email/resend";

/**
 * Small, shared building blocks for K-RÉ transactional emails so each
 * email type doesn't re-copy a full HTML shell. Deliberately minimal —
 * no templating engine, no build step, just string helpers.
 */

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatEuros(amount: number) {
  return `${Number(amount).toFixed(2)} €`;
}

/**
 * Wraps a body fragment (already-built HTML) in the common K-RÉ shell:
 * black background, "K-RÉ" eyebrow, centered narrow column, footer with
 * the support contact. `heading`/`subheading` are escaped here; `bodyHtml`
 * is trusted pre-built markup — callers are responsible for escaping any
 * dynamic text they interpolate into it.
 */
export function emailShell({
  heading,
  subheading,
  bodyHtml,
  ctaUrl,
  ctaLabel,
}: {
  heading: string;
  subheading?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
}) {
  const subheadingHtml = subheading
    ? `<p style="text-align:center;color:#c9c4ba;margin:0 0 28px;">${escapeHtml(subheading)}</p>`
    : "";

  const ctaHtml =
    ctaUrl && ctaLabel
      ? `<div style="text-align:center;margin:28px 0;">
           <a href="${ctaUrl}" style="display:inline-block;background:#d8b56a;color:#080808;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:999px;">${escapeHtml(ctaLabel)}</a>
         </div>`
      : "";

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#070707;">
    <div style="background:#070707;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#f7f4ee;">
      <div style="max-width:480px;margin:0 auto;">
        <p style="letter-spacing:0.3em;font-size:12px;text-transform:uppercase;color:#d8b56a;text-align:center;margin:0 0 24px;">K-RÉ</p>
        <h1 style="font-size:22px;text-align:center;margin:0 0 8px;color:#f7f4ee;">${escapeHtml(heading)}</h1>
        ${subheadingHtml}
        ${bodyHtml}
        ${ctaHtml}
        <p style="text-align:center;color:#6b6b6b;font-size:12px;margin-top:28px;">Une question ? <a href="mailto:${EMAIL_REPLY_TO}" style="color:#6b6b6b;">${EMAIL_REPLY_TO}</a></p>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * The dark bordered "fact card" reused across every K-RÉ transactional
 * email (event/table summary, refund summary, etc.). `rows` are
 * pre-escaped label/value pairs already formatted as HTML strings.
 */
export function factCard(rows: string[]) {
  return `<div style="border:1px solid rgba(216,181,106,0.35);border-radius:16px;padding:20px;margin-bottom:12px;">
    ${rows.join("\n")}
  </div>`;
}

export function factLine(label: string, value: string, opts: { emphasis?: boolean } = {}) {
  const color = opts.emphasis ? "#f7f4ee" : "#c9c4ba";
  const weight = opts.emphasis ? "bold" : "normal";
  return `<p style="margin:0 0 4px;color:${color};font-weight:${weight};font-size:${opts.emphasis ? "15px" : "13px"};">${label ? `${escapeHtml(label)} : ` : ""}${value}</p>`;
}

export const RESERVATIONS_URL = "https://www.k-re.org/reservations";
