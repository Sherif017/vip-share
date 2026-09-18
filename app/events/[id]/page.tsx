import Link from "next/link";
import {
  notFound,
} from "next/navigation";

import {
  supabase,
} from "@/lib/supabase";

type Club = {
  name: string;
  city: string;
  address: string | null;
};

type VipOffer = {
  id: string;

  table_number: string;

  total_table_price: number;

  capacity: number;

  confirmation_threshold: number;

  price_per_person: number;

  deposit_per_person: number;

  remaining_per_person: number;

  spots_reserved: number;

  booking_deadline:
    | string
    | null;

  status: string | null;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;

  event_date: string;
  start_time: string;

  music: string | null;

  image_url:
    | string
    | null;

  table_map_url:
    | string
    | null;

  clubs:
    | Club
    | Club[]
    | null;

  vip_offers:
    | VipOffer[]
    | null;
};

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      minimumFractionDigits:
        Number.isInteger(value)
          ? 0
          : 2,

      maximumFractionDigits: 2,
    }
  ).format(value);
}

export default async function EventPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  const {
    data,
    error,
  } =
    await supabase
      .from("events")
      .select(`
        id,
        slug,
        name,
        event_date,
        start_time,
        music,
        image_url,
        table_map_url,

        clubs (
          name,
          city,
          address
        ),

        vip_offers (
          id,
          table_number,
          total_table_price,
          capacity,
          confirmation_threshold,
          price_per_person,
          deposit_per_person,
          remaining_per_person,
          spots_reserved,
          booking_deadline,
          status
        )
      `)
      .eq(
        "slug",
        id
      )
      .eq(
        "status",
        "published"
      )
      .single();

  if (
    error ||
    !data
  ) {
    console.error(
      "Erreur chargement événement :",
      error
    );

    notFound();
  }

  const event =
    data as EventItem;

  const club =
    Array.isArray(
      event.clubs
    )
      ? event.clubs[0]
      : event.clubs;

  const offers =
    [
      ...(event.vip_offers ??
        []),
    ].sort(
      (a, b) =>
        a.table_number.localeCompare(
          b.table_number,
          "fr",
          {
            numeric: true,
          }
        )
    );

  if (
    !club ||
    offers.length === 0
  ) {
    notFound();
  }

  const formattedDate =
    new Intl.DateTimeFormat(
      "fr-FR",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    ).format(
      new Date(
        `${event.event_date}T12:00:00`
      )
    );

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-6xl px-6 py-14">
        <Link
          href="/events"
          className="mb-10 inline-block text-sm text-zinc-400 transition hover:text-white"
        >
          ← Retour aux soirées
        </Link>

        {/* HERO */}

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
              VIP Share
            </p>

            <h1 className="text-4xl font-bold md:text-5xl">
              {club.name}
            </h1>

            <p className="mt-3 text-xl text-zinc-400">
              {event.name}
            </p>

            <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <h2 className="text-xl font-semibold">
                Informations
              </h2>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Info
                  label="Date"
                  value={
                    formattedDate
                  }
                />

                <Info
                  label="Heure"
                  value={event.start_time.slice(
                    0,
                    5
                  )}
                />

                <Info
                  label="Ville"
                  value={
                    club.city
                  }
                />

                <Info
                  label="Musique"
                  value={
                    event.music ??
                    "Non précisé"
                  }
                />

                {club.address && (
                  <div className="sm:col-span-2">
                    <Info
                      label="Adresse"
                      value={
                        club.address
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {event.image_url ? (
            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  event.image_url
                }
                alt={
                  event.name
                }
                className="h-full min-h-[360px] w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950">
              <p className="text-zinc-600">
                VIP Share
              </p>
            </div>
          )}
        </div>

        {/* MAP */}

        {event.table_map_url && (
          <section className="mt-12">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold">
                Plan des tables
              </h2>

              <p className="mt-2 text-sm text-zinc-500">
                Repère les numéros
                des tables disponibles
                pour cette soirée.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  event.table_map_url
                }
                alt="Plan des tables"
                className="mx-auto max-h-[700px] w-full object-contain"
              />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-zinc-600">
              Le dispositif et les
              numéros de tables peuvent
              être modifiés par le club.
              En cas de changement sur
              place, l&apos;équipe du
              club indiquera la table
              correspondante.
            </p>
          </section>
        )}

        {/* TABLES */}

        <section className="mt-14">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              Tables VIP
            </p>

            <h2 className="mt-3 text-3xl font-bold">
              Choisis ta table
            </h2>

            <p className="mt-3 max-w-2xl text-zinc-400">
              Chaque table est
              partagée entre plusieurs
              participants. Choisis la
              table sur laquelle tu
              souhaites réserver tes
              places.
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {offers.map(
              (offer) => {
                const capacity =
                  Number(
                    offer.capacity
                  );

                const reserved =
                  Number(
                    offer.spots_reserved
                  );

                const remaining =
                  Math.max(
                    capacity -
                      reserved,
                    0
                  );

                const percentage =
                  capacity > 0
                    ? Math.min(
                        (
                          reserved /
                          capacity
                        ) *
                          100,
                        100
                      )
                    : 0;

                const thresholdReached =
                  reserved >=
                  Number(
                    offer.confirmation_threshold
                  );

                const deadlinePassed =
                  offer.booking_deadline
                    ? new Date(
                        offer.booking_deadline
                      ).getTime() <=
                      new Date().getTime()
                    : false;

                const available =
                  remaining > 0 &&
                  !deadlinePassed;

                return (
                  <article
                    key={
                      offer.id
                    }
                    className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                          Table
                        </p>

                        <h3 className="mt-2 text-3xl font-bold">
                          N°{" "}
                          {
                            offer.table_number
                          }
                        </h3>
                      </div>

                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">
                        VIP
                      </span>
                    </div>

                    <div className="mt-7">
                      <p className="text-sm text-zinc-500">
                        Prix par
                        personne
                      </p>

                      <p className="mt-1 text-4xl font-bold">
                        {formatMoney(
                          Number(
                            offer.price_per_person
                          )
                        )}
                        €
                      </p>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <PriceBox
                        label="Deposit"
                        value={`${formatMoney(
                          Number(
                            offer.deposit_per_person
                          )
                        )}€`}
                      />

                      <PriceBox
                        label="Sur place"
                        value={`${formatMoney(
                          Number(
                            offer.remaining_per_person
                          )
                        )}€`}
                      />
                    </div>

                    <div className="mt-7">
                      <div className="mb-3 flex justify-between text-sm">
                        <span>
                          {reserved}/
                          {capacity}{" "}
                          participants
                        </span>

                        <span className="text-zinc-500">
                          {remaining}{" "}
                          place
                          {remaining >
                          1
                            ? "s"
                            : ""}{" "}
                          restante
                          {remaining >
                          1
                            ? "s"
                            : ""}
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-white"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-5">
                      {thresholdReached ? (
                        <p className="text-sm text-green-400">
                          ✓ Seuil de
                          confirmation
                          atteint
                        </p>
                      ) : (
                        <p className="text-sm text-zinc-500">
                          Confirmation
                          à partir de{" "}
                          <span className="text-white">
                            {
                              offer.confirmation_threshold
                            }{" "}
                            participants
                          </span>
                        </p>
                      )}
                    </div>

                    {deadlinePassed && (
                      <p className="mt-5 text-sm text-red-400">
                        Les
                        réservations
                        sont terminées
                        pour cette
                        table.
                      </p>
                    )}

                    {available ? (
                      <Link
                        href={`/booking/${event.slug}?table=${offer.id}`}
                        className="mt-7 block w-full rounded-2xl bg-white py-4 text-center font-semibold text-black transition hover:bg-zinc-200"
                      >
                        Choisir cette
                        table
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="mt-7 block w-full cursor-not-allowed rounded-2xl bg-zinc-800 py-4 text-center font-semibold text-zinc-500"
                      >
                        {deadlinePassed
                          ? "Réservations terminées"
                          : "Complet"}
                      </button>
                    )}
                  </article>
                );
              }
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="capitalize">
        {value}
      </p>
    </div>
  );
}

function PriceBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-4">
      <p className="text-xs text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold">
        {value}
      </p>
    </div>
  );
}
