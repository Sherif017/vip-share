"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SettlementStatus =
  | "pending_review"
  | "approved"
  | "held"
  | "settled"
  | null;

type Props = {
  eventId: string;
  status: SettlementStatus;
  eventHasPassed: boolean;
};

export default function SettlementActions({
  eventId,
  status,
  eventHasPassed,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState<
    "approve" | "transfer" | "hold" | null
  >(null);

  const [message, setMessage] =
    useState<string | null>(null);

  async function callSettlement(
    action: "approve" | "transfer" | "hold",
    reason?: string
  ) {
    setLoading(action);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/manager/events/${eventId}/settlement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            reason,
          }),
        }
      );

      const body = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        setMessage(
          body?.error ??
            "L'opération n'a pas pu être effectuée."
        );

        return;
      }

      if (action === "approve") {
        setMessage(
          "Règlement validé. Aucun transfert Stripe n'a encore été effectué."
        );
      }

      if (action === "hold") {
        setMessage(
          "Le règlement de cette soirée est maintenant en attente."
        );
      }

      if (action === "transfer") {
        const transfers =
          Array.isArray(body?.transfers)
            ? body.transfers
            : [];

        setMessage(
          transfers.length > 0
            ? `${transfers.length} transfert(s) traité(s).`
            : "Aucun nouveau transfert n'était nécessaire."
        );
      }

      router.refresh();
    } catch {
      setMessage(
        "Erreur réseau pendant l'opération."
      );
    } finally {
      setLoading(null);
    }
  }

  function approve() {
    if (!eventHasPassed) {
      setMessage(
        "Le règlement n'est disponible qu'après la soirée."
      );
      return;
    }

    const confirmed = window.confirm(
      "Valider financièrement cette soirée ?\n\nCette étape ne transfère PAS encore les fonds. Elle rend seulement les transactions éligibles au transfert après les contrôles de sécurité."
    );

    if (!confirmed) {
      return;
    }

    void callSettlement("approve");
  }

  function hold() {
    const reason = window.prompt(
      "Pourquoi mettre ce règlement en attente ?"
    );

    if (reason === null) {
      return;
    }

    void callSettlement(
      "hold",
      reason.trim()
    );
  }

  function transfer() {
    const confirmation = window.prompt(
      'DERNIÈRE VALIDATION K-RÉ\n\nCette action peut réellement transférer le net club vers son compte Stripe Connect.\n\nTape exactement : TRANSFERER'
    );

    if (confirmation !== "TRANSFERER") {
      setMessage(
        "Transfert annulé : confirmation incorrecte."
      );
      return;
    }

    void callSettlement("transfer");
  }

  if (status === "settled") {
    return (
      <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/15 p-5">
        <p className="font-semibold text-emerald-300">
          Règlement terminé
        </p>

        <p className="mt-1 text-sm text-emerald-200/60">
          Les transactions éligibles de cette soirée ont été traitées.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111111] p-5">
      <p className="text-sm font-semibold text-[#F7F4EE]">
        Contrôle du règlement
      </p>

      <p className="mt-1 text-xs leading-5 text-[#858585]">
        Validation et transfert sont volontairement séparés.
        Aucun transfert automatique n&apos;est effectué.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {status !== "approved" && (
          <button
            type="button"
            onClick={approve}
            disabled={
              loading !== null ||
              !eventHasPassed
            }
            className="rounded-full bg-[#D8B56A] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#e4c67f] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading === "approve"
              ? "Validation..."
              : "Valider le règlement"}
          </button>
        )}

        {status === "approved" && (
          <button
            type="button"
            onClick={transfer}
            disabled={loading !== null}
            className="rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:opacity-40"
          >
            {loading === "transfer"
              ? "Transfert..."
              : "Transférer le net club"}
          </button>
        )}

        <button
          type="button"
          onClick={hold}
          disabled={loading !== null}
          className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-[#F7F4EE] transition hover:border-white/30 disabled:opacity-40"
        >
          {loading === "hold"
            ? "Mise en attente..."
            : "Mettre en attente"}
        </button>
      </div>

      {!eventHasPassed && (
        <p className="mt-4 text-xs text-amber-300">
          Disponible à partir du lendemain de la soirée.
        </p>
      )}

      {message && (
        <p className="mt-4 text-sm text-[#C0BBB1]">
          {message}
        </p>
      )}
    </div>
  );
}
