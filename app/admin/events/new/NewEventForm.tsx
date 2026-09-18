"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

type Club = {
  id: string;
  name: string;
  city: string;
};

type VipTableDraft = {
  localId: string;
  tableNumber: string;
  totalTablePrice: number;
  capacity: number;
  confirmationThreshold: number;
  bookingDeadline: string;
};

function createEmptyTable(
  number = "1"
): VipTableDraft {
  return {
    localId: crypto.randomUUID(),
    tableNumber: number,
    totalTablePrice: 1000,
    capacity: 10,
    confirmationThreshold: 8,
    bookingDeadline: "",
  };
}

export default function NewEventForm({
  clubs,
  isManager,
}: {
  clubs: Club[];
  isManager: boolean;
}) {
  const router = useRouter();

  const [clubMode, setClubMode] =
    useState<"existing" | "new">(
      clubs.length > 0
        ? "existing"
        : isManager
          ? "new"
          : "existing"
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

  const [
    commissionPercentage,
    setCommissionPercentage,
  ] = useState(20);

  const [tables, setTables] =
    useState<VipTableDraft[]>([
      createEmptyTable("1"),
    ]);

  const [posterFile, setPosterFile] =
    useState<File | null>(null);

  const [mapFile, setMapFile] =
    useState<File | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const posterPreview =
    useMemo(() => {
      if (!posterFile) {
        return null;
      }

      return URL.createObjectURL(
        posterFile
      );
    }, [posterFile]);

  const mapPreview =
    useMemo(() => {
      if (!mapFile) {
        return null;
      }

      return URL.createObjectURL(
        mapFile
      );
    }, [mapFile]);

  useEffect(() => {
    return () => {
      if (posterPreview) {
        URL.revokeObjectURL(
          posterPreview
        );
      }
    };
  }, [posterPreview]);

  useEffect(() => {
    return () => {
      if (mapPreview) {
        URL.revokeObjectURL(
          mapPreview
        );
      }
    };
  }, [mapPreview]);

  function generateSlug(
    value: string
  ) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );
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

  function updateTable(
    localId: string,
    changes: Partial<VipTableDraft>
  ) {
    setTables((current) =>
      current.map((table) =>
        table.localId === localId
          ? {
              ...table,
              ...changes,
            }
          : table
      )
    );
  }

  function addTable() {
    setTables((current) => {
      const nextNumber =
        current.length + 1;

      return [
        ...current,
        createEmptyTable(
          String(nextNumber)
        ),
      ];
    });
  }

  function removeTable(
    localId: string
  ) {
    setTables((current) => {
      if (current.length === 1) {
        return current;
      }

      return current.filter(
        (table) =>
          table.localId !== localId
      );
    });
  }

  function validateForm() {
    if (
      clubMode === "new" &&
      !isManager
    ) {
      throw new Error(
        "Seul le Manager VIP Share peut créer un nouveau club."
      );
    }

    if (
      clubMode === "existing" &&
      !clubId
    ) {
      throw new Error(
        "Sélectionne un club."
      );
    }

    if (
      clubMode === "new" &&
      (!clubName.trim() ||
        !clubCity.trim())
    ) {
      throw new Error(
        "Le nom et la ville du club sont obligatoires."
      );
    }

    if (
      !Number.isFinite(
        commissionPercentage
      ) ||
      commissionPercentage <= 0 ||
      commissionPercentage > 100
    ) {
      throw new Error(
        "Le Deposit doit être compris entre 1 % et 100 %."
      );
    }

    if (tables.length === 0) {
      throw new Error(
        "Ajoute au moins une table."
      );
    }

    const usedNumbers =
      new Set<string>();

    for (const table of tables) {
      const number =
        table.tableNumber
          .trim()
          .toLowerCase();

      if (!number) {
        throw new Error(
          "Chaque table doit avoir un numéro."
        );
      }

      if (
        usedNumbers.has(number)
      ) {
        throw new Error(
          `Le numéro de table "${table.tableNumber}" est utilisé plusieurs fois.`
        );
      }

      usedNumbers.add(number);

      if (
        !Number.isFinite(
          table.totalTablePrice
        ) ||
        table.totalTablePrice <= 0
      ) {
        throw new Error(
          `Le prix de la table ${table.tableNumber} est invalide.`
        );
      }

      if (
        !Number.isInteger(
          table.capacity
        ) ||
        table.capacity < 1
      ) {
        throw new Error(
          `La capacité de la table ${table.tableNumber} est invalide.`
        );
      }

      if (
        !Number.isInteger(
          table.confirmationThreshold
        ) ||
        table.confirmationThreshold <
          1 ||
        table.confirmationThreshold >
          table.capacity
      ) {
        throw new Error(
          `Le seuil de la table ${table.tableNumber} doit être compris entre 1 et ${table.capacity}.`
        );
      }
    }
  }

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      validateForm();

      const formData =
        new FormData();

      formData.append(
        "clubMode",
        clubMode
      );

      if (
        clubMode === "existing"
      ) {
        formData.append(
          "clubId",
          clubId
        );
      } else {
        formData.append(
          "clubName",
          clubName
        );

        formData.append(
          "clubCity",
          clubCity
        );

        formData.append(
          "clubAddress",
          clubAddress
        );
      }

      formData.append(
        "name",
        name
      );

      formData.append(
        "slug",
        slug
      );

      formData.append(
        "eventDate",
        eventDate
      );

      formData.append(
        "startTime",
        startTime
      );

      formData.append(
        "music",
        music
      );

      formData.append(
        "commissionPercentage",
        String(
          commissionPercentage
        )
      );

      const serializedTables =
        tables.map((table) => ({
          tableNumber:
            table.tableNumber.trim(),

          totalTablePrice:
            Number(
              table.totalTablePrice
            ),

          capacity:
            Number(
              table.capacity
            ),

          confirmationThreshold:
            Number(
              table.confirmationThreshold
            ),

          bookingDeadline:
            table.bookingDeadline
              ? new Date(
                  table.bookingDeadline
                ).toISOString()
              : null,
        }));

      formData.append(
        "tables",
        JSON.stringify(
          serializedTables
        )
      );

      if (posterFile) {
        formData.append(
          "poster",
          posterFile
        );
      }

      if (mapFile) {
        formData.append(
          "tableMap",
          mapFile
        );
      }

      const response =
        await fetch(
          "/api/admin/events",
          {
            method: "POST",
            body: formData,
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

      router.push(
        `/admin/events/${result.eventId}`
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
      {/* CLUB */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <h2 className="text-xl font-semibold">
          Club
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          {isManager
            ? "Sélectionne un club existant ou ajoute-en un nouveau."
            : clubs.length > 1
              ? "Sélectionne le club pour lequel tu veux créer cette soirée."
              : "La soirée sera créée pour le club associé à ton compte."}
        </p>

        {isManager && (
          <div className="mt-6 flex gap-3">
            {clubs.length > 0 && (
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
            )}

            <button
              type="button"
              onClick={() =>
                setClubMode("new")
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
        )}

        {clubMode ===
        "existing" ? (
          <div className="mt-6">
            <label className="block text-sm text-zinc-400">
              Club
            </label>

            {!isManager &&
            clubs.length === 1 ? (
              <div className="mt-2 rounded-xl border border-zinc-800 bg-black px-4 py-3">
                <p className="font-medium text-white">
                  {clubs[0].name}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {clubs[0].city}
                </p>
              </div>
            ) : (
              <select
                value={clubId}
                onChange={(e) =>
                  setClubId(
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none"
              >
                {clubs.map(
                  (club) => (
                    <option
                      key={club.id}
                      value={club.id}
                    >
                      {club.name} ·{" "}
                      {club.city}
                    </option>
                  )
                )}
              </select>
            )}
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

      {/* SOIRÉE */}

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

      {/* VISUELS */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <h2 className="text-xl font-semibold">
          Visuels
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          Ajoute l&apos;affiche de la
          soirée et, si disponible, le
          plan des tables du club.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ImagePicker
            label="Affiche / photo de la soirée"
            file={posterFile}
            preview={posterPreview}
            onChange={
              setPosterFile
            }
          />

          <ImagePicker
            label="Map des tables / carrés"
            file={mapFile}
            preview={mapPreview}
            onChange={setMapFile}
          />
        </div>

        <p className="mt-5 text-xs text-zinc-600">
          Formats acceptés : JPG, PNG
          et WebP. Maximum 8 Mo par
          image.
        </p>
      </section>

      {/* COMMISSION */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <h2 className="text-xl font-semibold">
          Deposit
        </h2>

        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Définis le pourcentage du prix
qui sera payé en ligne sous forme
de Deposit. Le reste sera réglé
directement sur place.
        </p>

        <div className="mt-6 max-w-xs">
          <NumberInput
            label="Deposit (%)"
            value={
              commissionPercentage
            }
            onChange={
              setCommissionPercentage
            }
            min={1}
            max={100}
            step={0.1}
          />
        </div>
      </section>

      {/* TABLES */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Tables VIP
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Crée toutes les tables
              proposées pour cette
              soirée.
            </p>
          </div>

          <button
            type="button"
            onClick={addTable}
            className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-medium transition hover:border-white"
          >
            + Ajouter une table
          </button>
        </div>

        <div className="mt-8 space-y-6">
          {tables.map(
            (table, index) => {
              const pricePerPerson =
                table.capacity > 0
                  ? table.totalTablePrice /
                    table.capacity
                  : 0;

              const commissionPerPerson =
                pricePerPerson *
                (commissionPercentage /
                  100);

              const remainingPerPerson =
                Math.max(
                  0,
                  pricePerPerson -
                    commissionPerPerson
                );

              return (
                <div
                  key={
                    table.localId
                  }
                  className="rounded-3xl border border-zinc-800 bg-black p-5 md:p-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-zinc-600">
                        Table{" "}
                        {index + 1}
                      </p>

                      <h3 className="mt-2 text-lg font-semibold">
                        Table n°
                        {table.tableNumber ||
                          "—"}
                      </h3>
                    </div>

                    {tables.length >
                      1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeTable(
                            table.localId
                          )
                        }
                        className="text-sm text-red-400 transition hover:text-red-300"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <Input
                      label="Numéro de table"
                      value={
                        table.tableNumber
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.localId,
                          {
                            tableNumber:
                              value,
                          }
                        )
                      }
                      placeholder="04"
                      required
                    />

                    <NumberInput
                      label="Prix total de la table (€)"
                      value={
                        table.totalTablePrice
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.localId,
                          {
                            totalTablePrice:
                              value,
                          }
                        )
                      }
                      min={1}
                      step={0.01}
                    />

                    <NumberInput
                      label="Capacité maximale"
                      value={
                        table.capacity
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.localId,
                          {
                            capacity:
                              value,
                          }
                        )
                      }
                      min={1}
                      step={1}
                    />

                    <NumberInput
                      label="Seuil de confirmation"
                      value={
                        table.confirmationThreshold
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.localId,
                          {
                            confirmationThreshold:
                              value,
                          }
                        )
                      }
                      min={1}
                      max={
                        table.capacity
                      }
                      step={1}
                    />

                    <div className="md:col-span-2">
                      <Input
                        label="Échéance des réservations"
                        type="datetime-local"
                        value={
                          table.bookingDeadline
                        }
                        onChange={(
                          value
                        ) =>
                          updateTable(
                            table.localId,
                            {
                              bookingDeadline:
                                value,
                            }
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <SummaryCard
                      label="Prix / personne"
                      value={`${pricePerPerson.toFixed(
                        2
                      )} €`}
                    />

                    <SummaryCard
                      label={`Deposit (${commissionPercentage} %)`}
                      value={`${commissionPerPerson.toFixed(
                        2
                      )} €`}
                    />

                    <SummaryCard
                      label="À payer sur place"
                      value={`${remainingPerPerson.toFixed(
                        2
                      )} €`}
                    />
                  </div>
                </div>
              );
            }
          )}
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
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (
    value: number
  ) => void;
  min?: number;
  max?: number;
  step?: number;
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
        max={max}
        step={step}
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

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold">
        {value}
      </p>
    </div>
  );
}

function ImagePicker({
  label,
  file,
  preview,
  onChange,
}: {
  label: string;
  file: File | null;
  preview: string | null;
  onChange: (
    file: File | null
  ) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400">
        {label}
      </label>

      <label className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-black px-5 py-8 text-center transition hover:border-zinc-500">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) =>
            onChange(
              e.target
                .files?.[0] ??
                null
            )
          }
        />

        <div>
          <p className="font-medium">
            {file
              ? "Changer l'image"
              : "Choisir une image"}
          </p>

          {file && (
            <p className="mt-1 max-w-xs truncate text-xs text-zinc-500">
              {file.name}
            </p>
          )}
        </div>
      </label>

      {preview && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={label}
            className="h-64 w-full object-cover"
          />
        </div>
      )}

      {file && (
        <button
          type="button"
          onClick={() =>
            onChange(null)
          }
          className="mt-3 text-sm text-red-400 transition hover:text-red-300"
        >
          Retirer l&apos;image
        </button>
      )}
    </div>
  );
}