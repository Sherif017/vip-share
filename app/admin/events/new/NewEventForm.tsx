"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

type Club = {
  id: string;
  name: string;
  city: string;
};

export default function NewEventForm({
  clubs,
}: {
  clubs: Club[];
}) {
  const router = useRouter();

  const [clubMode, setClubMode] =
    useState<"existing" | "new">(
      clubs.length > 0
        ? "existing"
        : "new"
    );

  const [clubId, setClubId] =
    useState(
      clubs[0]?.id ?? ""
    );

  const [clubName, setClubName] =
    useState("");

  const [clubCity, setClubCity] =
    useState("");

  const [clubAddress, setClubAddress] =
    useState("");

  const [name, setName] =
    useState("");

  const [slug, setSlug] =
    useState("");

  const [eventDate, setEventDate] =
    useState("");

  const [startTime, setStartTime] =
    useState("23:30");

  const [music, setMusic] =
    useState("");

  const [capacity, setCapacity] =
    useState(10);

  const [
    confirmationThreshold,
    setConfirmationThreshold,
  ] = useState(8);

  const [
    pricePerPerson,
    setPricePerPerson,
  ] = useState(150);

  const [
    depositPerPerson,
    setDepositPerPerson,
  ] = useState(50);

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

  function generateSlug(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function handleNameChange(
    value: string
  ) {
    setName(value);

    if (!slug) {
      setSlug(
        generateSlug(value)
      );
    }
  }

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/events",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            clubMode,

            clubId:
              clubMode ===
              "existing"
                ? clubId
                : null,

            clubName:
              clubMode ===
              "new"
                ? clubName
                : null,

            clubCity:
              clubMode ===
              "new"
                ? clubCity
                : null,

            clubAddress:
              clubMode ===
              "new"
                ? clubAddress
                : null,

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
            "Impossible de créer la soirée."
        );
      }

      router.push("/admin");
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
          Club
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          Sélectionne un club existant
          ou ajoute-en un nouveau.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() =>
              setClubMode(
                "existing"
              )
            }
            className={`rounded-full px-4 py-2 text-sm transition ${
              clubMode ===
              "existing"
                ? "bg-white text-black"
                : "border border-zinc-700 text-zinc-300"
            }`}
          >
            Club existant
          </button>

          <button
            type="button"
            onClick={() =>
              setClubMode(
                "new"
              )
            }
            className={`rounded-full px-4 py-2 text-sm transition ${
              clubMode === "new"
                ? "bg-white text-black"
                : "border border-zinc-700 text-zinc-300"
            }`}
          >
            Nouveau club
          </button>
        </div>

        {clubMode ===
        "existing" ? (
          <div className="mt-6">
            <label className="block text-sm text-zinc-400">
              Club
            </label>

            <select
              value={clubId}
              onChange={(e) =>
                setClubId(
                  e.target.value
                )
              }
              className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none"
            >
              {clubs.map((club) => (
                <option
                  key={club.id}
                  value={club.id}
                >
                  {club.name} ·{" "}
                  {club.city}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Input
              label="Nom du club"
              value={clubName}
              onChange={
                setClubName
              }
              required
            />

            <Input
              label="Ville"
              value={clubCity}
              onChange={
                setClubCity
              }
              required
            />

            <div className="md:col-span-2">
              <Input
                label="Adresse"
                value={
                  clubAddress
                }
                onChange={
                  setClubAddress
                }
              />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <h2 className="text-xl font-semibold">
          Soirée
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input
            label="Nom de la soirée"
            value={name}
            onChange={
              handleNameChange
            }
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
            onChange={
              setEventDate
            }
            required
          />

          <Input
            label="Heure"
            type="time"
            value={startTime}
            onChange={
              setStartTime
            }
            required
          />

          <div className="md:col-span-2">
            <Input
              label="Musique"
              value={music}
              onChange={setMusic}
              placeholder="Rap · Afro · Hip-Hop"
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
            min={1}
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

          <p className="mt-1 text-sm text-zinc-600">
            par personne
          </p>
        </div>
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
          className="rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Création..."
            : "Créer la soirée"}
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400">
        {label}
      </label>

      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
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