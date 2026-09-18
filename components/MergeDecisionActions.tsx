"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reservationId: string;
  sourceTableNumber: string;
  targetTableNumber: string;
  expiresAt: string | null;
  currentChoice: "accept" | "refuse" | null;
};

export default function MergeDecisionActions({
  reservationId,
  sourceTableNumber,
  targetTableNumber,
  expiresAt,
  currentChoice,
}: Props) {
  const router = useRouter();

  const [loadingChoice, setLoadingChoice] =
    useState<"accept" | "refuse" | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [submittedChoice, setSubmittedChoice] = useState<"accept" | "refuse" | null>(null);
  const effectiveChoice = currentChoice ?? submittedChoice;

  const deadline = expiresAt
    ? new Date(expiresAt).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  async function decide(choice: "accept" | "refuse") {
    if (inFlight.current || effectiveChoice) return;
    const confirmed = window.confirm(
      choice === "accept"
        ? `Accepter le transfert de ta réservation de la table n°${sourceTableNumber} vers la table n°${targetTableNumber} ?\n\nLe prix et ton Deposit ne changent pas.`
        : `Refuser la fusion avec la table n°${targetTableNumber} ?\n\nLa fusion sera annulée et l'organisateur devra choisir une autre solution.`
    );

    if (!confirmed) return;

    inFlight.current = true;
    setLoadingChoice(choice);
    setError("");

    try {
      const response = await fetch(
        `/api/reservations/${reservationId}/merge-decision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ choice }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 409) router.refresh();
        throw new Error(
          data.error || "Impossible d'enregistrer ton choix."
        );
      }

      setSubmittedChoice(choice);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );
    } finally {
      inFlight.current = false;
      setLoadingChoice(null);
    }
  }

  if (effectiveChoice) {
    return (
      <div className="mt-5 rounded-2xl border border-blue-900/60 bg-blue-950/20 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
          Fusion de tables
        </p>

        <p className="mt-2 text-sm text-zinc-300">
          Ton choix a bien été enregistré :{" "}
          <strong className="text-white">
            {effectiveChoice === "accept"
              ? "fusion acceptée"
              : "fusion refusée"}
          </strong>
          .
        </p>

        {effectiveChoice === "accept" && (
          <p className="mt-2 text-sm text-zinc-500">
            Nous attendons encore la réponse des autres participants.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-orange-900/60 bg-orange-950/10 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
        Action requise · Fusion de tables
      </p>

      <h3 className="mt-2 text-lg font-semibold text-white">
        Une fusion de tables t&apos;est proposée
      </h3>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Ta réservation est actuellement sur la table n°
        {sourceTableNumber}. L&apos;organisateur propose de la transférer
        vers la table n°{targetTableNumber}.
      </p>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 text-sm text-zinc-300">
        <p>
          ✓ Ton prix par personne ne change pas.
        </p>
        <p className="mt-1">
          ✓ Ton Deposit déjà payé ne change pas.
        </p>
        <p className="mt-1">
          ✓ Le montant à régler sur place ne change pas.
        </p>
      </div>

      {deadline && (
        <p className="mt-3 text-xs text-zinc-500">
          Réponds avant le {deadline}. Une absence de réponse annule la fusion ; elle ne vaut jamais acceptation.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => decide("accept")}
          disabled={loadingChoice !== null}
          className="kre-primary-cta rounded-full px-5 py-3 text-sm font-semibold transition"
        >
          {loadingChoice === "accept"
            ? "Validation..."
            : "Accepter la fusion"}
        </button>

        <button
          type="button"
          onClick={() => decide("refuse")}
          disabled={loadingChoice !== null}
          className="rounded-full border border-red-900 px-5 py-3 text-sm font-semibold text-red-400 transition hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingChoice === "refuse"
            ? "Refus..."
            : "Refuser"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
