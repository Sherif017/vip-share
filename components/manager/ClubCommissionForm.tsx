"use client";

import { useState } from "react";

export default function ClubCommissionForm({
  clubId,
  initialCommissionBps,
}: {
  clubId: string;
  initialCommissionBps: number | null;
}) {
  const [value, setValue] = useState(
    initialCommissionBps != null ? (initialCommissionBps / 100).toString() : ""
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const commissionPercent = Number(value.replace(",", "."));

    if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
      setMessage("Taux invalide.");
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/admin/clubs/${clubId}/commission`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPercent }),
    });

    if (res.ok) {
      setMessage("Commission enregistrée.");
    } else {
      const body = await res.json().catch(() => null);
      setMessage(body?.error ?? "Erreur lors de l'enregistrement.");
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-[#111111] p-7">
      <h2 className="text-xl font-bold text-[#F7F4EE]">Commission K-RÉ</h2>
      <p className="mt-1 text-sm text-[#858585]">
        Réservé aux administrateurs K-RÉ. Le manager de ce club ne peut pas modifier ce taux.
      </p>

      <div className="mt-5 flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="15.00"
          className="w-28 rounded-lg border border-white/15 bg-black px-3 py-2 text-[#F7F4EE] outline-none focus:border-[#D8B56A]"
        />
        <span className="text-[#A7A7A7]">%</span>

        <button
          type="submit"
          disabled={saving}
          className="ml-auto rounded-full bg-[#D8B56A] px-5 py-2 text-sm font-semibold text-[#080808] transition hover:bg-[#e3c580] disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-[#A7A7A7]">{message}</p>}

      {initialCommissionBps == null && (
        <p className="mt-3 text-sm text-amber-400">
          Aucune commission configurée : ce club ne peut pas encore vendre en paiement intégral.
        </p>
      )}
    </form>
  );
}
