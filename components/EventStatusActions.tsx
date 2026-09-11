"use client";

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type EventStatus =
  | "published"
  | "draft"
  | "cancelled";

export default function EventStatusActions({
  eventId,
  currentStatus,
}: {
  eventId: string;
  currentStatus: string;
}) {
  const router = useRouter();

  const [
    loadingStatus,
    setLoadingStatus,
  ] =
    useState<EventStatus | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState("");

  async function updateStatus(
    newStatus: EventStatus
  ) {
    if (newStatus === currentStatus) {
      return;
    }

    if (
      newStatus === "cancelled"
    ) {
      const confirmed =
        window.confirm(
          "Annuler cette soirée ? Elle ne sera plus réservable."
        );

      if (!confirmed) {
        return;
      }
    }

    setLoadingStatus(
      newStatus
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/events/${eventId}/status`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              status:
                newStatus,
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
            "Impossible de modifier le statut."
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
      setLoadingStatus(
        null
      );
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">

        <button
          type="button"
          disabled={
            currentStatus ===
              "published" ||
            loadingStatus !==
              null
          }
          onClick={() =>
            updateStatus(
              "published"
            )
          }
          className="rounded-full border border-green-900 px-4 py-2 text-sm text-green-400 transition hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingStatus ===
          "published"
            ? "Publication..."
            : "Publier"}
        </button>

        <button
          type="button"
          disabled={
            currentStatus ===
              "draft" ||
            loadingStatus !==
              null
          }
          onClick={() =>
            updateStatus(
              "draft"
            )
          }
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingStatus ===
          "draft"
            ? "Modification..."
            : "Brouillon"}
        </button>

        <button
          type="button"
          disabled={
            currentStatus ===
              "cancelled" ||
            loadingStatus !==
              null
          }
          onClick={() =>
            updateStatus(
              "cancelled"
            )
          }
          className="rounded-full border border-red-900 px-4 py-2 text-sm text-red-400 transition hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingStatus ===
          "cancelled"
            ? "Annulation..."
            : "Annuler la soirée"}
        </button>

      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}