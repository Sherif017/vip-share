"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";
import Image from "next/image";

type TableValue = {
  id: string | null;

  tableNumber: string;

  totalTablePrice: number;

  capacity: number;

  confirmationThreshold:
    number;

  bookingDeadline: string;

  spotsReserved: number;

  status: string;
};

type InitialValues = {
  name: string;
  slug: string;

  eventDate: string;
  startTime: string;

  music: string;

  depositPercentage:
    number;

  imageUrl:
    | string
    | null;

  tableMapUrl:
    | string
    | null;

  tables: TableValue[];
};

type EditableTable =
  TableValue & {
    clientKey: string;
  };

export default function EditEventForm({
  eventId,
  initialValues,
}: {
  eventId: string;

  initialValues:
    InitialValues;
}) {
  const router =
    useRouter();

  /*
  |--------------------------------------------------------------------------
  | Soirée
  |--------------------------------------------------------------------------
  */

  const [
    name,
    setName,
  ] = useState(
    initialValues.name
  );

  const [
    slug,
    setSlug,
  ] = useState(
    initialValues.slug
  );

  const [
    eventDate,
    setEventDate,
  ] = useState(
    initialValues.eventDate
  );

  const [
    startTime,
    setStartTime,
  ] = useState(
    initialValues.startTime
  );

  const [
    music,
    setMusic,
  ] = useState(
    initialValues.music
  );

  const [
    depositPercentage,
    setDepositPercentage,
  ] = useState(
    initialValues.depositPercentage
  );

  /*
  |--------------------------------------------------------------------------
  | Images
  |--------------------------------------------------------------------------
  */

  const [
    poster,
    setPoster,
  ] =
    useState<File | null>(
      null
    );

  const [
    tableMap,
    setTableMap,
  ] =
    useState<File | null>(
      null
    );

  /*
  |--------------------------------------------------------------------------
  | Tables
  |--------------------------------------------------------------------------
  */

  const [
    tables,
    setTables,
  ] =
    useState<
      EditableTable[]
    >(
      initialValues.tables.map(
        (
          table
        ) => ({
          ...table,

          clientKey:
            table.id ??
            crypto.randomUUID(),
        })
      )
    );

  /*
  |--------------------------------------------------------------------------
  | UI
  |--------------------------------------------------------------------------
  */

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  /*
  |--------------------------------------------------------------------------
  | Totaux
  |--------------------------------------------------------------------------
  */

  const totalCapacity =
    useMemo(
      () =>
        tables.reduce(
          (
            total,
            table
          ) =>
            total +
            Number(
              table.capacity ||
                0
            ),
          0
        ),
      [tables]
    );

  const totalTableValue =
    useMemo(
      () =>
        tables.reduce(
          (
            total,
            table
          ) =>
            total +
            Number(
              table.totalTablePrice ||
                0
            ),
          0
        ),
      [tables]
    );

  /*
  |--------------------------------------------------------------------------
  | Table helpers
  |--------------------------------------------------------------------------
  */

  function updateTable<
    K extends keyof EditableTable
  >(
    clientKey: string,
    field: K,
    value: EditableTable[K]
  ) {
    setTables(
      (
        current
      ) =>
        current.map(
          (
            table
          ) =>
            table.clientKey ===
            clientKey
              ? {
                  ...table,
                  [field]:
                    value,
                }
              : table
        )
    );
  }

  function addTable() {
    setTables(
      (
        current
      ) => [
        ...current,

        {
          id: null,

          clientKey:
            crypto.randomUUID(),

          tableNumber:
            String(
              current.length +
                1
            ),

          totalTablePrice:
            1500,

          capacity:
            10,

          confirmationThreshold:
            6,

          bookingDeadline:
            "",

          spotsReserved:
            0,

          status:
            "forming",
        },
      ]
    );
  }

  function removeTable(
    clientKey: string
  ) {
    if (
      tables.length <= 1
    ) {
      setError(
        "Une soirée doit conserver au moins une table."
      );

      return;
    }

    const table =
      tables.find(
        (
          item
        ) =>
          item.clientKey ===
          clientKey
      );

    if (!table) {
      return;
    }

    if (
      table.id &&
      table.spotsReserved >
        0
    ) {
      setError(
        `La table n°${table.tableNumber} possède déjà des places réservées. Elle ne peut pas être supprimée.`
      );

      return;
    }

    if (
      !window.confirm(
        `Supprimer la table n°${table.tableNumber} ?`
      )
    ) {
      return;
    }

    setError("");

    setTables(
      (
        current
      ) =>
        current.filter(
          (
            item
          ) =>
            item.clientKey !==
            clientKey
        )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Submit
  |--------------------------------------------------------------------------
  */

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");

    /*
    |--------------------------------------------------------------------------
    | Vérifications client
    |--------------------------------------------------------------------------
    */

    if (
      tables.length === 0
    ) {
      setError(
        "Ajoute au moins une table."
      );

      return;
    }

    if (
      depositPercentage <
        0 ||
      depositPercentage >
        100
    ) {
      setError(
        "Le Deposit doit être compris entre 0% et 100%."
      );

      return;
    }

    const tableNumbers =
      tables.map(
        (
          table
        ) =>
          table.tableNumber
            .trim()
            .toLowerCase()
      );

    if (
      new Set(
        tableNumbers
      ).size !==
      tableNumbers.length
    ) {
      setError(
        "Deux tables ne peuvent pas avoir le même numéro."
      );

      return;
    }

    for (
      const table of tables
    ) {
      if (
        !table.tableNumber.trim()
      ) {
        setError(
          "Toutes les tables doivent avoir un numéro."
        );

        return;
      }

      if (
        !Number.isFinite(
          table.totalTablePrice
        ) ||
        table.totalTablePrice <=
          0
      ) {
        setError(
          `Prix invalide pour la table n°${table.tableNumber}.`
        );

        return;
      }

      if (
        !Number.isInteger(
          table.capacity
        ) ||
        table.capacity <
          1
      ) {
        setError(
          `Capacité invalide pour la table n°${table.tableNumber}.`
        );

        return;
      }

      if (
        table.capacity <
        table.spotsReserved
      ) {
        setError(
          `La table n°${table.tableNumber} possède déjà ${table.spotsReserved} places réservées.`
        );

        return;
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
        setError(
          `Seuil de confirmation invalide pour la table n°${table.tableNumber}.`
        );

        return;
      }
    }

    setLoading(true);

    try {
      const formData =
        new FormData();

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
        "depositPercentage",
        String(
          depositPercentage
        )
      );

      formData.append(
        "tables",
        JSON.stringify(
          tables.map(
            (
              table
            ) => ({
              id:
                table.id,

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
                table.bookingDeadline ||
                null,
            })
          )
        )
      );

      if (poster) {
        formData.append(
          "poster",
          poster
        );
      }

      if (
        tableMap
      ) {
        formData.append(
          "tableMap",
          tableMap
        );
      }

      const response =
        await fetch(
          `/api/admin/events/${eventId}`,
          {
            method:
              "PATCH",

            body:
              formData,
          }
        );

      const result =
        await response.json();

      if (
        !response.ok
      ) {
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

      setLoading(
        false
      );
    }
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-8"
    >

      {/* ===================================================== */}
      {/* SOIRÉE */}
      {/* ===================================================== */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">

        <h2 className="text-xl font-semibold">
          Informations de la soirée
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">

          <Input
            label="Nom"
            value={name}
            onChange={
              setName
            }
            required
          />

          <Input
            label="Slug"
            value={slug}
            onChange={
              setSlug
            }
            required
          />

          <Input
            label="Date"
            type="date"
            value={
              eventDate
            }
            onChange={
              setEventDate
            }
            required
          />

          <Input
            label="Heure"
            type="time"
            value={
              startTime
            }
            onChange={
              setStartTime
            }
            required
          />

          <div className="md:col-span-2">
            <Input
              label="Musique"
              value={
                music
              }
              onChange={
                setMusic
              }
            />
          </div>

        </div>
      </section>

      {/* ===================================================== */}
      {/* DEPOSIT */}
      {/* ===================================================== */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">

        <h2 className="text-xl font-semibold">
          Deposit
        </h2>

        <p className="mt-2 text-sm text-zinc-500">
          Pourcentage payé en ligne par le client au moment de la réservation.
        </p>

        <div className="mt-6 max-w-md">
          <NumberInput
            label="Deposit (%)"
            value={
              depositPercentage
            }
            onChange={
              setDepositPercentage
            }
            min={0}
            max={100}
            step={0.1}
          />
        </div>

      </section>

      {/* ===================================================== */}
      {/* MÉDIAS */}
      {/* ===================================================== */}

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">

        <h2 className="text-xl font-semibold">
          Visuels
        </h2>

        <div className="mt-6 grid gap-6 md:grid-cols-2">

          <FileBlock
            label="Affiche de la soirée"
            currentUrl={
              initialValues.imageUrl
            }
            file={
              poster
            }
            onChange={
              setPoster
            }
          />

          <FileBlock
            label="Plan des tables"
            currentUrl={
              initialValues.tableMapUrl
            }
            file={
              tableMap
            }
            onChange={
              setTableMap
            }
          />

        </div>

        <p className="mt-5 text-xs text-zinc-600">
          JPG, PNG ou WebP · 8 MB maximum. Si aucun nouveau fichier n&apos;est choisi, le visuel actuel est conservé.
        </p>

      </section>

      {/* ===================================================== */}
      {/* TABLES */}
      {/* ===================================================== */}

      <section>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

          <div>
            <h2 className="text-2xl font-semibold">
              Tables VIP
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              {tables.length} table
              {tables.length !==
              1
                ? "s"
                : ""}{" "}
              · capacité totale :{" "}
              {totalCapacity} personnes
            </p>
          </div>

          <button
            type="button"
            onClick={
              addTable
            }
            className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-semibold transition hover:border-white"
          >
            + Ajouter une table
          </button>

        </div>

        <div className="mt-6 space-y-6">

          {tables.map(
            (
              table,
              index
            ) => {
              const pricePerPerson =
                table.capacity >
                0
                  ? table.totalTablePrice /
                    table.capacity
                  : 0;

              const depositPerPerson =
                pricePerPerson *
                (
                  depositPercentage /
                  100
                );

              const remainingPerPerson =
                Math.max(
                  0,
                  pricePerPerson -
                    depositPerPerson
                );

              return (
                <div
                  key={
                    table.clientKey
                  }
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8"
                >

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-zinc-600">
                        Table{" "}
                        {index +
                          1}
                      </p>

                      <h3 className="mt-2 text-2xl font-bold">
                        Table n°
                        {table.tableNumber ||
                          "—"}
                      </h3>

                      {table.id && (
                        <p className="mt-2 text-xs text-zinc-600">
                          {
                            table.spotsReserved
                          }{" "}
                          place
                          {table.spotsReserved !==
                          1
                            ? "s"
                            : ""}{" "}
                          actuellement réservée
                          {table.spotsReserved !==
                          1
                            ? "s"
                            : ""}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeTable(
                          table.clientKey
                        )
                      }
                      className="rounded-full border border-red-900 px-4 py-2 text-sm text-red-400 transition hover:border-red-500"
                    >
                      Supprimer
                    </button>

                  </div>

                  <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">

                    <Input
                      label="Numéro de table"
                      value={
                        table.tableNumber
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.clientKey,
                          "tableNumber",
                          value
                        )
                      }
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
                          table.clientKey,
                          "totalTablePrice",
                          value
                        )
                      }
                      min={1}
                      step={0.01}
                    />

                    <NumberInput
                      label="Capacité"
                      value={
                        table.capacity
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.clientKey,
                          "capacity",
                          value
                        )
                      }
                      min={Math.max(
                        1,
                        table.spotsReserved
                      )}
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
                          table.clientKey,
                          "confirmationThreshold",
                          value
                        )
                      }
                      min={1}
                      max={
                        table.capacity
                      }
                      step={1}
                    />

                    <Input
                      label="Deadline de réservation"
                      type="datetime-local"
                      value={
                        table.bookingDeadline
                      }
                      onChange={(
                        value
                      ) =>
                        updateTable(
                          table.clientKey,
                          "bookingDeadline",
                          value
                        )
                      }
                    />

                  </div>

                  {/* Calculs */}

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                    <CalculatedValue
                      label="Prix / personne"
                      value={
                        pricePerPerson
                      }
                    />

                    <CalculatedValue
                      label={`Deposit (${depositPercentage}%)`}
                      value={
                        depositPerPerson
                      }
                    />

                    <CalculatedValue
                      label="À payer sur place"
                      value={
                        remainingPerPerson
                      }
                    />

                    <div className="rounded-2xl border border-zinc-800 bg-black p-5">
                      <p className="text-sm text-zinc-500">
                        Capacité
                      </p>

                      <p className="mt-2 text-2xl font-bold">
                        {
                          table.capacity
                        }{" "}
                        pers.
                      </p>
                    </div>

                  </div>

                </div>
              );
            }
          )}

        </div>

        <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">

          <p className="text-sm text-zinc-500">
            Valeur totale de toutes les tables
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatMoney(
              totalTableValue
            )}
          </p>

        </div>

      </section>

      {/* ===================================================== */}
      {/* ERROR */}
      {/* ===================================================== */}

      {error && (
        <div className="rounded-2xl border border-red-900 bg-red-950/20 px-5 py-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ===================================================== */}
      {/* SUBMIT */}
      {/* ===================================================== */}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

        <button
          type="button"
          disabled={
            loading
          }
          onClick={() =>
            router.push(
              `/admin/events/${eventId}`
            )
          }
          className="rounded-full border border-zinc-700 px-8 py-4 font-semibold transition hover:border-white disabled:opacity-50"
        >
          Annuler
        </button>

        <button
          type="submit"
          disabled={
            loading
          }
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

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

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
        required={
          required
        }
        onChange={(
          e
        ) =>
          onChange(
            e.target.value
          )
        }
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none transition focus:border-zinc-500"
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Number input
|--------------------------------------------------------------------------
*/

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
        onChange={(
          e
        ) =>
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

/*
|--------------------------------------------------------------------------
| Calcul
|--------------------------------------------------------------------------
*/

function CalculatedValue({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-5">

      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {formatMoney(
          value
        )}
      </p>

    </div>
  );
}

/*
|--------------------------------------------------------------------------
| File
|--------------------------------------------------------------------------
*/

function FileBlock({
  label,
  currentUrl,
  file,
  onChange,
}: {
  label: string;

  currentUrl:
    | string
    | null;

  file:
    | File
    | null;

  onChange: (
    file:
      | File
      | null
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-5">

      <p className="font-medium">
        {label}
      </p>

      {currentUrl && (
        <div className="mt-4">

          <Image
            width={800}
            height={400}
            src={
              currentUrl
            }
            alt={
              label
            }
            className="h-44 w-full rounded-xl object-cover"
          />

          <p className="mt-2 text-xs text-zinc-600">
            Visuel actuel
          </p>

        </div>
      )}

      <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-zinc-700 px-4 py-4 text-center text-sm text-zinc-400 transition hover:border-white hover:text-white">

        {file
          ? file.name
          : currentUrl
            ? "Choisir un nouveau fichier"
            : "Ajouter un fichier"}

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(
            e
          ) =>
            onChange(
              e.target
                .files?.[0] ??
                null
            )
          }
        />

      </label>

    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Money
|--------------------------------------------------------------------------
*/

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
