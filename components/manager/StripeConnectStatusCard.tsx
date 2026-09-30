"use client";

import { useState } from "react";

type Status = "not_started" | "pending" | "complete";

export default function StripeConnectStatusCard({
  clubId,
  clubName,
  status,
  chargesEnabled,
}: {
  clubId: string;
  clubName: string;
  status: Status;
  chargesEnabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/clubs/${clubId}/stripe-onboarding`, {
      method: "POST",
    });

    const body = await res.json().catch(() => null);

    if (!res.ok || !body?.url) {
      setError(body?.error ?? "Impossible de démarrer l'activation pour le moment.");
      setLoading(false);
      return;
    }

    window.location.href = body.url;
  }

  const badge = chargesEnabled
    ? { label: "Paiements activés", className: "bg-green-100 text-green-800" }
    : status === "pending"
      ? { label: "Activation en cours", className: "bg-amber-950/30 text-amber-400" }
      : { label: "Paiements non activés", className: "bg-white/[0.07] text-zinc-400" };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-zinc-500">{clubName}</p>
        <span className={`mt-1 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>

      {!chargesEnabled && (
        <button
          type="button"
          onClick={handleActivate}
          disabled={loading}
          className="rounded-full kre-primary-cta px-5 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {loading
            ? "Redirection..."
            : status === "pending"
              ? "Reprendre l'activation"
              : "Activer les paiements"}
        </button>
      )}
    </div>
  );
}
