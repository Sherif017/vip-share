"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

type InitialValues = {
  name: string;
  slug: string;
  eventDate: string;
  startTime: string;
  music: string;
  capacity: number;
  confirmationThreshold: number;
  pricePerPerson: number;
  depositPerPerson: number;
  spotsReserved: number;
};

export default function EditEventForm({
  eventId,
  initialValues,
}: {
  eventId: string;
  initialValues: InitialValues;
}) {
  const router = useRouter();

  const [name, setName] =
    useState(initialValues.name);

  const [slug, setSlug] =
    useState(initialValues.slug);

  const [eventDate, setEventDate] =
    useState(initialValues.eventDate);

  const [startTime, setStartTime] =
    useState(initialValues.startTime);

  const [music, setMusic] =
    useState(initialValues.music);

  const [capacity, setCapacity] =
    useState(initialValues.capacity);

  const [
    confirmationThreshold,
    setConfirmationThreshold,
  ] = useState(
    initialValues.confirmationThreshold
  );

  const [
    pricePerPerson,
    setPricePerPerson,
  ] = useState(
    initialValues.pricePerPerson
  );

  const [
    depositPerPerson,
    setDepositPerPerson,
  ] = useState(
    initialValues.depositPerPerson
  );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const remainingPerPerson =
    useMemo(() => {
      return Math.max(
        0,
        Number(pricePerPerson) -
          Number(depositPerPerson)
      );
    }, [
      pricePerPerson,
      depositPerPerson,
    ]);

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/events/${eventId}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            name,
            slug,
            eventDate,
            startTime,
            music,

            capacity:
              Number(capacity),

            confirmationThreshold:
              Number(
                confirmationThreshold
              ),

            pricePerPerson:
              Number(
                pricePerPerson
              ),

            depositPerPerson:
              Number(
                depositPerPerson
              ),
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Impossible de modifier la soirée."
        );
      }

      router.push(
        `/admin/events/${eventId}`
      );

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );

      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-8"
    >
      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <h2 className="text-xl font-semibold">
          Informations
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input
            label="Nom"
            value={name}
            onChange={setName}
            required
          />

          <Input
            label="Slug"
            value={slug}
            onChange={setSlug}
            required
          />

          <Input
            label="Date"
            type="date"
            value={eventDate}
            onChange={setEventDate}
            required
          />

          <Input
            label="Heure"
            type="time"
            value={startTime}
            onChange={setStartTime}
            required
          />

          <div className="md:col-span-2">
            <Input
              label="Musique"
              value={music}
              onChange={setMusic}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <h2 className="text-xl font-semibold">
          Offre VIP
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <NumberInput
            label="Capacité"
            value={capacity}
            onChange={setCapacity}
            min={
              initialValues.spotsReserved
            }
          />

          <NumberInput
            label="Seuil de confirmation"
            value={
              confirmationThreshold
            }
            onChange={
              setConfirmationThreshold
            }
            min={1}
          />

          <NumberInput
            label="Prix par personne (€)"
            value={
              pricePerPerson
            }
            onChange={
              setPricePerPerson
            }
            min={1}
          />

          <NumberInput
            label="Acompte par personne (€)"
            value={
              depositPerPerson
            }
            onChange={
              setDepositPerPerson
            }
            min={0}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-black p-5">
          <p className="text-sm text-zinc-500">
            Reste à payer sur place
          </p>

          <p className="mt-2 text-3xl font-bold">
            {remainingPerPerson.toFixed(
              2
            )}
            €
          </p>
        </div>

        <p className="mt-4 text-xs text-zinc-600">
          {initialValues.spotsReserved} place
          {initialValues.spotsReserved > 1
            ? "s"
            : ""}{" "}
          actuellement réservée
          {initialValues.spotsReserved > 1
            ? "s"
            : ""}.
          La capacité ne peut pas être inférieure à ce nombre.
        </p>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-900 bg-red-950/20 px-5 py-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading
            ? "Enregistrement..."
            : "Enregistrer les modifications"}
        </button>
      </div>
    </form>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400">
        {label}
      </label>

      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none transition focus:border-zinc-500"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (
    value: number
  ) => void;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400">
        {label}
      </label>

      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) =>
          onChange(
            Number(
              e.target.value
            )
          )
        }
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none transition focus:border-zinc-500"
      />
    </div>
  );
}