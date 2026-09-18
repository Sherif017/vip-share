"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type Props = {
  reservationCode: string;

  currentChoice:
    | string
    | null;

  supplementAmount:
    number;

  decisionExpiresAt:
    | string
    | null;
};

export default function ReservationDecisionActions({
  reservationCode,
  currentChoice,
  supplementAmount,
  decisionExpiresAt,
}: Props) {
  const router =
    useRouter();

  const [
    loading,
    setLoading,
  ] =
    useState<
      "maintain" |
      "refund" |
      null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  const [now] = useState(() => Date.now());

  const expired =
    decisionExpiresAt
      ? new Date(
          decisionExpiresAt
        ).getTime() <
        now
      : false;

  async function choose(
    choice:
      | "maintain"
      | "refund"
  ) {
    if (loading) {
      return;
    }

    if (expired) {
      setError(
        "La période de décision est terminée."
      );

      return;
    }

    const message =
      choice ===
      "maintain"
        ? `Confirmer que tu souhaites maintenir ta réservation avec un supplément de ${formatMoney(
            supplementAmount
          )} ?`
        : "Confirmer ta demande de remboursement du Deposit ?";

    if (
      !window.confirm(
        message
      )
    ) {
      return;
    }

    setLoading(
      choice
    );

    setError("");

    try {
      const endpoint =
        choice ===
        "maintain"
          ? `/api/reservations/${reservationCode}/maintain`
          : `/api/reservations/${reservationCode}/refund-request`;

      const response =
        await fetch(
          endpoint,
          {
            method: "POST",
          }
        );

      const result =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          result.error ||
            "Impossible d'enregistrer ton choix."
        );
      }

      router.refresh();
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );
    } finally {
      setLoading(
        null
      );
    }
  }

  if (expired) {
    return (
      <div className="rounded-2xl border border-red-900 bg-red-950/20 p-5">

        <p className="font-semibold text-red-400">
          Période de décision terminée
        </p>

        <p className="mt-2 text-sm text-red-300/70">
          Contacte K-RÉ pour connaître la suite de ta réservation.
        </p>

      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Choix actuel */}

      {currentChoice ===
        "maintain" && (
        <div className="rounded-2xl border border-green-900 bg-green-950/20 p-5">

          <p className="font-semibold text-green-400">
            Tu souhaites maintenir ta réservation
          </p>

          <p className="mt-2 text-sm text-green-300/70">
            Ton supplément sera de{" "}
            <strong>
              {formatMoney(
                supplementAmount
              )}
            </strong>
            .
          </p>

          <p className="mt-2 text-xs text-zinc-500">
            Le paiement du supplément sera disponible dès que la décision de la table sera finalisée.
          </p>

        </div>
      )}

      {currentChoice ===
        "refund" && (
        <div className="rounded-2xl border border-yellow-900 bg-yellow-950/20 p-5">

          <p className="font-semibold text-yellow-400">
            Remboursement demandé
          </p>

          <p className="mt-2 text-sm text-yellow-300/70">
            Aucun remboursement n&apos;est encore exécuté à cette étape.
          </p>

        </div>
      )}

      {/* Actions */}

      <div className="grid gap-3 md:grid-cols-2">

        <button
          type="button"
          disabled={
            loading !==
            null
          }
          onClick={() =>
            choose(
              "maintain"
            )
          }
          className={`rounded-2xl px-5 py-4 text-sm font-semibold transition disabled:opacity-50 ${
            currentChoice ===
            "maintain"
              ? "kre-primary-cta"
              : "border border-zinc-700 text-white hover:border-white"
          }`}
        >
          {loading ===
          "maintain"
            ? "Enregistrement..."
            : currentChoice ===
                "maintain"
              ? "✓ Maintenir ma réservation"
              : "Maintenir ma réservation"}
        </button>

        <button
          type="button"
          disabled={
            loading !==
            null
          }
          onClick={() =>
            choose(
              "refund"
            )
          }
          className={`rounded-2xl px-5 py-4 text-sm font-semibold transition disabled:opacity-50 ${
            currentChoice ===
            "refund"
              ? "border border-red-700 bg-red-950/30 text-red-300"
              : "border border-red-900 text-red-400 hover:border-red-500"
          }`}
        >
          {loading ===
          "refund"
            ? "Enregistrement..."
            : currentChoice ===
                "refund"
              ? "✓ Remboursement demandé"
              : "Demander le remboursement"}
        </button>

      </div>

      {error && (
        <div className="rounded-xl border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

    </div>
  );
}

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      style:
        "currency",

      currency:
        "EUR",

      maximumFractionDigits:
        2,
    }
  ).format(value);
}
