"use client";

import { useState } from "react";

export default function AdminRefundButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function refund() {
    if (!window.confirm("Rembourser les paiements Stripe encaissés pour cette réservation ?")) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/reservations/${reservationId}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Demande validée par le staff" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Remboursement impossible.");
      setMessage("Remboursement traité");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Erreur de remboursement."); }
    finally { setLoading(false); }
  }
  return <button type="button" onClick={refund} disabled={loading} className="mt-2 rounded-full border border-red-900 px-3 py-1 text-xs text-red-300 disabled:opacity-50">{loading ? "Traitement…" : message || "Rembourser"}</button>;
}
