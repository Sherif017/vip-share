"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UndoCheckInButton({
  reservationCode,
  checkedInQuantity,
}: {
  reservationCode: string;
  checkedInQuantity: number;
}) {
  const router = useRouter();

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleUndo() {
    if (checkedInQuantity <= 0) {
      return;
    }

    const confirmed = window.confirm(
      "Annuler une entrée pour cette réservation ?"
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/check-in/undo",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            code: reservationCode,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.message ||
            "Impossible d'annuler l'entrée."
        );
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleUndo}
        disabled={
          loading ||
          checkedInQuantity <= 0
        }
        className="rounded-full border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition hover:border-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading
          ? "Annulation..."
          : "Annuler 1 entrée"}
      </button>

      {error && (
        <p className="mt-2 max-w-[180px] text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}