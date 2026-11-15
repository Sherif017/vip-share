"use client";

import { useState } from "react";

export default function EventShareActions({
  slug,
  name,
  status,
}: {
  slug: string;
  name: string;
  status: string;
}) {
  const [message, setMessage] = useState("");

  const url =
    `https://www.k-re.org/events/${encodeURIComponent(slug)}`;

  const shareText =
    `Retrouve ${name} sur K-RÉ et réserve ta place VIP !`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Lien copié !");
    } catch {
      setMessage("Sélectionne et copie le lien manuellement.");
    }
  }

  async function shareEvent() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${name} — K-RÉ`,
          text: shareText,
          url,
        });
        return;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    }

    await copyLink();
  }

  if (status !== "published") {
    return (
      <div className="my-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold">
          Partager ma soirée
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Le lien de partage sera disponible lorsque
          la soirée sera publiée.
        </p>
      </div>
    );
  }

  return (
    <section className="my-6 min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
      <h2 className="text-xl font-semibold">
        Partager ma soirée
      </h2>

      <p className="mt-2 text-sm text-zinc-400">
        Invite tes clients à réserver directement
        leur place VIP sur K-RÉ.
      </p>

      <input
        readOnly
        aria-label="Lien public de la soirée"
        value={url}
        onFocus={(e) => e.target.select()}
        className="mt-4 block w-full min-w-0 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-base text-amber-400 outline-none"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={copyLink}
          className="min-h-12 rounded-xl kre-primary-cta px-4 py-3 text-sm font-semibold"
        >
          Copier le lien
        </button>

        <button
          type="button"
          onClick={shareEvent}
          className="min-h-12 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold transition hover:border-white"
        >
          Partager la soirée
        </button>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-center rounded-xl border border-green-900 px-4 py-3 text-sm font-semibold text-green-400 transition hover:border-green-500"
        >
          WhatsApp
        </a>
      </div>

      <p
        role="status"
        className="mt-2 text-sm text-amber-400"
      >
        {message}
      </p>
    </section>
  );
}
