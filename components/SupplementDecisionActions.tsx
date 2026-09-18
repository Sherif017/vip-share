"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  reservationId: string;
  quantity: number;
  originalPricePerPerson: number;
  newPricePerPerson: number;
  supplementPerPerson: number;
  supplementAmount: number;
  expiresAt: string | null;
  currentChoice: "maintain" | "refund" | null;
  offerStatus: string;
  supplementStatus: string | null;
};

export default function SupplementDecisionActions({
  reservationId,
  quantity,
  originalPricePerPerson,
  newPricePerPerson,
  supplementPerPerson,
  supplementAmount,
  expiresAt,
  currentChoice,
  offerStatus,
  supplementStatus,
}: Props) {
  const router = useRouter();

  const [loadingChoice, setLoadingChoice] =
    useState<"maintain" | "refund" | null>(null);

  const [paymentLoading, setPaymentLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const paymentLock = useRef(false);

  useEffect(() => {
    const resetPaymentState = () => {
      paymentLock.current = false;
      setPaymentLoading(false);
    };

    window.addEventListener("pageshow", resetPaymentState);

    return () => {
      window.removeEventListener(
        "pageshow",
        resetPaymentState
      );
    };
  }, []);

  const deadline = expiresAt
    ? new Date(expiresAt).toLocaleString(
        "fr-FR",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      )
    : null;

  async function decide(
    choice: "maintain" | "refund"
  ) {
    const message =
      choice === "maintain"
        ? `Maintenir ta réservation avec un supplément total de ${supplementAmount.toFixed(
            2
          )} € ?\n\nAucun paiement n'est effectué maintenant. Stripe sera ouvert uniquement si tous les participants maintiennent leur réservation.`
        : `Demander le remboursement de ta réservation ?\n\nSi la table ne peut pas être maintenue, la réservation passera dans le processus de remboursement.`;

    if (
      !window.confirm(message)
    ) {
      return;
    }

    setLoadingChoice(choice);
    setError("");

    try {
      const response =
        await fetch(
          `/api/reservations/${reservationId}/supplement-decision`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              choice,
            }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Impossible d'enregistrer ton choix."
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
      setLoadingChoice(null);
    }
  }

  async function paySupplement() {
    if (paymentLock.current) return;
    paymentLock.current = true;
    setPaymentLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/reservations/${reservationId}/supplement-checkout`,
          {
            method: "POST",
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success ||
        !data.checkoutUrl
      ) {
        throw new Error(
          data.error ||
            "Impossible de démarrer le paiement."
        );
      }

      window.location.href =
        data.checkoutUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );
      setPaymentLoading(false);
      paymentLock.current = false;
    }
  }

  if (
    supplementStatus === "paid"
  ) {
    return (
      <div className="mt-5 rounded-2xl border border-green-900/60 bg-green-950/20 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-400">
          Supplément payé
        </p>

        <h3 className="mt-2 text-lg font-semibold text-white">
          Paiement confirmé
        </h3>

        <p className="mt-2 text-sm text-zinc-400">
          Ton supplément de{" "}
          <strong className="text-white">
            {supplementAmount.toFixed(
              2
            )}{" "}
            €
          </strong>{" "}
          a bien été réglé.
        </p>
      </div>
    );
  }

  if (
    offerStatus ===
      "supplement_payment_pending" &&
    currentChoice === "maintain"
  ) {
    return (
      <div className="mt-5 rounded-2xl border border-violet-800/70 bg-violet-950/20 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Paiement du supplément
        </p>

        <h3 className="mt-2 text-lg font-semibold text-white">
          Tous les participants ont
          accepté
        </h3>

        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Ta part de supplément est
          maintenant à régler en ligne.
        </p>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-black/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-400">
              Montant à payer
            </span>

            <strong className="text-xl text-white">
              {supplementAmount.toFixed(
                2
              )}{" "}
              €
            </strong>
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {quantity} place
            {quantity !== 1
              ? "s"
              : ""}{" "}
            ×{" "}
            {supplementPerPerson.toFixed(
              2
            )}{" "}
            €
          </p>
        </div>

        <button
          type="button"
          onClick={paySupplement}
          disabled={paymentLoading}
          className="kre-primary-cta mt-5 rounded-full px-6 py-3 text-sm font-semibold transition"
        >
          {paymentLoading
            ? "Redirection vers Stripe..."
            : `Payer ${supplementAmount.toFixed(
                2
              )} €`}
        </button>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (
    offerStatus ===
      "refund_pending" ||
    supplementStatus ===
      "refund_pending"
  ) {
    return (
      <div className="mt-5 rounded-2xl border border-red-900/60 bg-red-950/20 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
          Remboursement en cours
        </p>

        <p className="mt-2 text-sm leading-6 text-zinc-300">
          La table ne peut pas être
          maintenue dans ces conditions.
          Le dossier est maintenant dans
          le processus de remboursement.
        </p>
      </div>
    );
  }

  if (currentChoice) {
    return (
      <div className="mt-5 rounded-2xl border border-blue-900/60 bg-blue-950/20 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
          Décision enregistrée
        </p>

        <p className="mt-2 text-sm text-zinc-300">
          Tu as choisi de{" "}
          <strong className="text-white">
            {currentChoice ===
            "maintain"
              ? "maintenir ta réservation"
              : "demander le remboursement"}
          </strong>
          .
        </p>

        <p className="mt-2 text-sm text-zinc-500">
          Nous attendons encore la
          réponse des autres participants.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-violet-900/70 bg-violet-950/10 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
        Action requise · Supplément
      </p>

      <h3 className="mt-2 text-lg font-semibold text-white">
        Souhaites-tu maintenir ta
        réservation ?
      </h3>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Le nombre minimum de participants
        n&apos;a pas été atteint. Pour
        maintenir la table avec les
        participants actuels, le prix par
        personne doit être ajusté.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <PriceCard
          label="Prix initial / personne"
          value={
            originalPricePerPerson
          }
        />

        <PriceCard
          label="Nouveau prix / personne"
          value={newPricePerPerson}
        />

        <PriceCard
          label="Supplément / personne"
          value={supplementPerPerson}
          highlight
        />
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-zinc-400">
            Supplément total pour ta
            réservation
          </span>

          <strong className="text-lg text-white">
            {supplementAmount.toFixed(
              2
            )}{" "}
            €
          </strong>
        </div>

        <p className="mt-2 text-xs text-zinc-500">
          {quantity} place
          {quantity !== 1 ? "s" : ""} ×{" "}
          {supplementPerPerson.toFixed(
            2
          )}{" "}
          €
        </p>
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-400">
        Si tu maintiens ta réservation,
        aucun paiement n&apos;est prélevé
        maintenant. Stripe sera proposé
        uniquement si tous les participants
        acceptent.
      </p>

      {deadline && (
        <p className="mt-3 text-xs text-zinc-500">
          Réponds avant le {deadline}.
          Sans réponse avant la deadline,
          la réservation ne sera pas
          considérée comme maintenue.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            decide("maintain")
          }
          disabled={
            loadingChoice !== null
          }
          className="kre-primary-cta rounded-full px-5 py-3 text-sm font-semibold transition"
        >
          {loadingChoice ===
          "maintain"
            ? "Validation..."
            : "Maintenir ma réservation"}
        </button>

        <button
          type="button"
          onClick={() =>
            decide("refund")
          }
          disabled={
            loadingChoice !== null
          }
          className="rounded-full border border-red-900 px-5 py-3 text-sm font-semibold text-red-400 transition hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingChoice ===
          "refund"
            ? "Validation..."
            : "Demander le remboursement"}
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

function PriceCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-violet-700 bg-violet-950/30"
          : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <p className="text-xs text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-2 text-lg font-semibold ${
          highlight
            ? "text-violet-300"
            : "text-white"
        }`}
      >
        {value.toFixed(2)} €
      </p>
    </div>
  );
}
