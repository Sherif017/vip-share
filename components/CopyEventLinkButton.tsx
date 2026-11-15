"use client";

import { useState } from "react";

export default function CopyEventLinkButton({
  slug,
  compact = false,
}: {
  slug: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const url =
    `https://www.k-re.org/events/${encodeURIComponent(slug)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);

      window.setTimeout(() => {
        setCopied(false);
      }, 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={copyLink}
        aria-label={copied ? "Lien copié" : "Copier le lien"}
        title={copied ? "Lien copié" : "Copier le lien"}
        className={compact
          ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:text-cream hover:bg-white/5"
          : "min-h-11 w-full rounded-xl kre-primary-cta px-5 py-3 text-sm font-semibold"
        }
      >
        {compact ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {copied ? (
              <path d="m5 12 4 4L19 6" />
            ) : (
              <>
                <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2" />
                <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
              </>
            )}
          </svg>
        ) : (
          copied ? "✓ Lien copié !" : "Copier le lien"
        )}
      </button>

      <span className="sr-only" role="status">
        {copied ? "Lien copié" : ""}
      </span>

      {failed && (
        <input
          readOnly
          aria-label="Lien à copier manuellement"
          value={url}
          onFocus={(e) => e.target.select()}
          className="mt-2 w-full min-w-0 rounded-lg border border-zinc-700 bg-black p-2 text-base"
        />
      )}
    </div>
  );
}
