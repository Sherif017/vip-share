"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  vipOfferId: string;
  tableNumber: string;
  confirmedPeople: number;
  confirmationThreshold: number;
};

type MergeOption = {
  id: string;
  tableNumber: string;
  capacity: number;
  confirmedPeople: number;
  combinedPeople: number;
  availablePlacesAfterMerge: number;
};

type SupplementPreview = {
  tableNumber: string;
  confirmedPeople: number;
  totalTablePrice: number;
  originalPricePerPerson: number;
  newPricePerPerson: number;
  supplementPerPerson: number;
  decisionHours: number;
};

export default function AdminReviewActions({
  vipOfferId,
  tableNumber,
  confirmedPeople,
  confirmationThreshold,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [supplementLoading, setSupplementLoading] = useState(false);

  const [showMerge, setShowMerge] = useState(false);
  const [showSupplement, setShowSupplement] = useState(false);

  const [mergeOptions, setMergeOptions] = useState<MergeOption[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");

  const [supplementPreview, setSupplementPreview] =
    useState<SupplementPreview | null>(null);

  const [error, setError] = useState("");
  const mergeInFlight = useRef(false);

  async function acceptAsIs() {
    const confirmed = window.confirm(
      `Confirmer la table n°${tableNumber} avec ${confirmedPeople} participant${
        confirmedPeople !== 1 ? "s" : ""
      } au prix initial ?\n\nAucun supplément ne sera demandé aux clients.`
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/vip-offers/${vipOfferId}/accept-as-is`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Impossible de confirmer cette table."
        );
      }

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  async function openMergeOptions() {
    setMergeLoading(true);
    setError("");
    setSelectedTargetId("");
    setShowSupplement(false);

    try {
      const response = await fetch(
        `/api/admin/vip-offers/${vipOfferId}/merge-options`,
        { method: "GET", cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Impossible de rechercher les tables compatibles."
        );
      }

      setMergeOptions(data.options ?? []);
      setShowMerge(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setMergeLoading(false);
    }
  }

  async function proposeMerge() {
    if (mergeInFlight.current || loading || mergeLoading || supplementLoading) return;
    if (!selectedTargetId) {
      setError("Choisis une table avec laquelle proposer la fusion.");
      return;
    }

    const target = mergeOptions.find(
      (option) => option.id === selectedTargetId
    );

    const confirmed = window.confirm(
      `Proposer la fusion de la table n°${tableNumber} avec la table n°${
        target?.tableNumber ?? ""
      } ?\n\nLes clients de la table n°${tableNumber} devront accepter la fusion.`
    );

    if (!confirmed) return;

    mergeInFlight.current = true;
    setMergeLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/vip-offers/${vipOfferId}/propose-merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetOfferId: selectedTargetId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Impossible de proposer cette fusion."
        );
      }

      setShowMerge(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      mergeInFlight.current = false;
      setMergeLoading(false);
    }
  }

  async function openSupplementPreview() {
    setSupplementLoading(true);
    setError("");
    setShowMerge(false);

    try {
      const response = await fetch(
        `/api/admin/vip-offers/${vipOfferId}/supplement-preview`,
        { method: "GET", cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Impossible de calculer le supplément."
        );
      }

      setSupplementPreview(data.preview);
      setShowSupplement(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setSupplementLoading(false);
    }
  }

  async function startSupplement() {
    if (!supplementPreview) return;

    const confirmed = window.confirm(
      `Proposer un supplément de ${supplementPreview.supplementPerPerson.toFixed(
        2
      )} € par personne pour la table n°${tableNumber} ?\n\nLes clients auront 24 h pour maintenir leur réservation ou demander un remboursement.`
    );

    if (!confirmed) return;

    setSupplementLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/vip-offers/${vipOfferId}/start-supplement`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Impossible de lancer la proposition de supplément."
        );
      }

      setShowSupplement(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setSupplementLoading(false);
    }
  }

  const busy = loading || mergeLoading || supplementLoading;

  return (
    <div className="mt-6 rounded-2xl border border-orange-900/60 bg-orange-950/10 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
            Décision administrateur requise
          </p>

          <h4 className="mt-2 text-lg font-semibold text-white">
            Le seuil n&apos;a pas été atteint avant la deadline.
          </h4>

          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            {confirmedPeople} participant
            {confirmedPeople !== 1 ? "s" : ""} confirmé
            {confirmedPeople !== 1 ? "s" : ""} pour un seuil de{" "}
            {confirmationThreshold}. Tu peux accepter la table telle quelle,
            proposer une fusion ou proposer un supplément.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <button
            type="button"
            onClick={acceptAsIs}
            disabled={busy}
            className="rounded-full kre-primary-cta px-5 py-3 text-sm font-semibold transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Confirmation..." : "Accepter telle quelle"}
          </button>

          <button
            type="button"
            onClick={openMergeOptions}
            disabled={busy}
            className="rounded-full border border-orange-700 px-5 py-3 text-sm font-semibold text-orange-300 transition hover:border-orange-400 hover:text-orange-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mergeLoading ? "Recherche..." : "Proposer une fusion"}
          </button>

          <button
            type="button"
            onClick={openSupplementPreview}
            disabled={busy}
            className="rounded-full border border-violet-800 px-5 py-3 text-sm font-semibold text-violet-300 transition hover:border-violet-500 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {supplementLoading ? "Calcul..." : "Proposer un supplément"}
          </button>
        </div>
      </div>

      {showMerge && (
        <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h5 className="font-semibold text-white">
                Tables compatibles
              </h5>
              <p className="mt-1 text-sm text-zinc-500">
                Seules les tables de la même soirée avec une capacité et des
                conditions tarifaires compatibles sont proposées.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowMerge(false);
                setSelectedTargetId("");
              }}
              disabled={mergeLoading}
              className="text-sm text-zinc-500 hover:text-white"
            >
              Fermer
            </button>
          </div>

          {mergeOptions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm text-zinc-400">
              Aucune table compatible n&apos;est disponible pour le moment.
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                {mergeOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition ${
                      selectedTargetId === option.id
                        ? "border-orange-500 bg-orange-950/20"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`merge-target-${vipOfferId}`}
                        value={option.id}
                        checked={selectedTargetId === option.id}
                        onChange={() => setSelectedTargetId(option.id)}
                        className="h-4 w-4"
                      />

                      <div>
                        <p className="font-medium text-white">
                          Table n°{option.tableNumber}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Actuellement {option.confirmedPeople} /{" "}
                          {option.capacity} · Après fusion{" "}
                          {option.combinedPeople} / {option.capacity}
                        </p>
                      </div>
                    </div>

                    <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                      {option.availablePlacesAfterMerge} place
                      {option.availablePlacesAfterMerge !== 1 ? "s" : ""} libre
                      {option.availablePlacesAfterMerge !== 1 ? "s" : ""}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={proposeMerge}
                  disabled={!selectedTargetId || mergeLoading}
                  className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mergeLoading
                    ? "Envoi..."
                    : "Proposer la fusion aux clients"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showSupplement && supplementPreview && (
        <div className="mt-5 rounded-2xl border border-violet-900/70 bg-violet-950/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                Proposition de supplément
              </p>
              <h5 className="mt-2 text-lg font-semibold text-white">
                Vérifie les montants avant d&apos;envoyer
              </h5>
            </div>

            <button
              type="button"
              onClick={() => setShowSupplement(false)}
              disabled={supplementLoading}
              className="text-sm text-zinc-500 hover:text-white"
            >
              Fermer
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyCard
              label="Prix total table"
              value={supplementPreview.totalTablePrice}
            />
            <MoneyCard
              label="Prix initial / personne"
              value={supplementPreview.originalPricePerPerson}
            />
            <MoneyCard
              label="Nouveau prix / personne"
              value={supplementPreview.newPricePerPerson}
            />
            <MoneyCard
              label="Supplément / personne"
              value={supplementPreview.supplementPerPerson}
              highlight
            />
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-400">
            <p>
              Le calcul est basé sur{" "}
              <strong className="text-white">
                {supplementPreview.confirmedPeople} participant
                {supplementPreview.confirmedPeople !== 1 ? "s" : ""}
              </strong>{" "}
              actuellement confirmé
              {supplementPreview.confirmedPeople !== 1 ? "s" : ""}.
            </p>

            <p className="mt-2">
              Une fois envoyé, ce nouveau prix sera figé. Les clients auront{" "}
              <strong className="text-white">
                {supplementPreview.decisionHours} h
              </strong>{" "}
              pour choisir entre maintenir leur réservation ou demander un
              remboursement.
            </p>

            <p className="mt-2 text-zinc-500">
              Aucun paiement Stripe n&apos;est déclenché à cette étape. Le
              paiement du supplément sera ouvert seulement si tous les
              participants acceptent de maintenir la table.
            </p>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={startSupplement}
              disabled={supplementLoading}
              className="rounded-full bg-violet-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {supplementLoading
                ? "Envoi..."
                : "Envoyer la proposition aux clients"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-900 bg-red-950/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded-full border border-zinc-800 px-3 py-1.5">
          Remboursement direct · bientôt
        </span>
      </div>
    </div>
  );
}

function MoneyCard({
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
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-2 text-xl font-semibold ${
          highlight ? "text-violet-300" : "text-white"
        }`}
      >
        {value.toFixed(2)} €
      </p>
    </div>
  );
}
