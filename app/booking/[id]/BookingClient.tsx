"use client";

import Link from "next/link";

import {
  useState,
} from "react";

type BookingClientProps = {
  slug: string;

  clubName: string;
  eventName: string;

  eventDate: string;
  startTime: string;

  vipOfferId: string;
  tableNumber: string;

  capacity: number;
  spotsReserved: number;

  pricePerPerson: number;
  depositPerPerson: number;
  remainingPerPerson: number;

  bookingDeadline:
    | string
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

export default function BookingClient({
  slug,
  clubName,
  eventName,
  eventDate,
  startTime,

  vipOfferId,
  tableNumber,

  capacity,
  spotsReserved,

  pricePerPerson,
  depositPerPerson,
  remainingPerPerson,

  bookingDeadline,
}: BookingClientProps) {
  const availableSpots =
    Math.max(
      capacity -
        spotsReserved,
      0
    );

  const [
    quantity,
    setQuantity,
  ] = useState(1);

  const [now] = useState(() => Date.now());

  const deadlinePassed =
    bookingDeadline
      ? new Date(
          bookingDeadline
        ).getTime() <=
        now
      : false;

  const canBook =
    availableSpots > 0 &&
    !deadlinePassed;

  const totalPrice =
    pricePerPerson *
    quantity;

  const totalDeposit =
    depositPerPerson *
    quantity;

  const totalRemaining =
    remainingPerPerson *
    quantity;

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
        `${eventDate}T12:00:00`
      )
    );

  function decreaseQuantity() {
    setQuantity(
      (current) =>
        Math.max(
          1,
          current - 1
        )
    );
  }

  function increaseQuantity() {
    setQuantity(
      (current) =>
        Math.min(
          availableSpots,
          current + 1
        )
    );
  }

  return (
    <main className="kre-customer min-h-screen bg-black text-white">
      <section className="mx-auto max-w-5xl px-6 py-14">
        <Link
          href={`/events/${slug}`}
          className="mb-10 inline-block text-sm text-zinc-400 transition hover:text-white"
        >
          ← Retour à la soirée
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
              Réservation
            </p>

            <h1 className="mb-3 text-4xl font-bold md:text-5xl">
              Choisis ta place
            </h1>

            <p className="mb-10 text-zinc-400">
              Réserve seulement les places dont tu as besoin.
            </p>

            <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <p className="mb-2 text-sm text-zinc-500">
                Ta soirée
              </p>

              <h2 className="text-2xl font-semibold">
                {clubName}
              </h2>

              <p className="mt-1 text-zinc-400">
                {eventName}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-zinc-700 px-4 py-2 text-sm">
                  K-RÉ
                  {tableNumber}
                </span>

                <span className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-400 capitalize">
                  {formattedDate}
                </span>

                <span className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-400">
                  {startTime.slice(
                    0,
                    5
                  )}
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <div className="mb-8 flex items-center justify-between gap-5">
                <div>
                  <p className="mb-1 text-sm text-zinc-500">
                    Nombre de
                    places
                  </p>

                  <p className="text-zinc-300">
                    {
                      availableSpots
                    }{" "}
                    disponible
                    {availableSpots >
                    1
                      ? "s"
                      : ""}
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    onClick={
                      decreaseQuantity
                    }
                    disabled={
                      quantity <= 1
                    }
                    className="h-12 w-12 rounded-full border border-zinc-700 text-xl transition hover:border-white disabled:opacity-30"
                  >
                    −
                  </button>

                  <span className="min-w-8 text-center text-3xl font-semibold">
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={
                      increaseQuantity
                    }
                    disabled={
                      quantity >=
                      availableSpots
                    }
                    className="h-12 w-12 rounded-full border border-zinc-700 text-xl transition hover:border-white disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-4 border-t border-zinc-800 pt-6">
                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Prix par
                    personne
                  </span>

                  <span>
                    {formatMoney(
                      pricePerPerson
                    )}
                    €
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Nombre de
                    places
                  </span>

                  <span>
                    × {quantity}
                  </span>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-4 text-lg font-semibold">
                  <span>
                    Total
                  </span>

                  <span>
                    {formatMoney(
                      totalPrice
                    )}
                    €
                  </span>
                </div>
              </div>
            </div>
          </div>

          <aside>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 lg:sticky lg:top-8">
              <h2 className="mb-7 text-xl font-semibold">
                Récapitulatif
              </h2>

              <div className="space-y-5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Table
                  </span>

                  <span className="font-semibold">
                    N°{" "}
                    {tableNumber}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    {quantity}{" "}
                    place
                    {quantity > 1
                      ? "s"
                      : ""}
                  </span>

                  <span className="font-semibold">
                    {formatMoney(
                      totalPrice
                    )}
                    €
                  </span>
                </div>

                <div className="border-t border-zinc-800 pt-5">
                  <div className="mb-2 flex justify-between">
                    <span className="text-zinc-400">
                      Deposit
                    </span>

                    <span className="text-xl font-bold">
                      {formatMoney(
                        totalDeposit
                      )}
                      €
                    </span>
                  </div>

                  <p className="text-xs text-zinc-500">
                    {formatMoney(
                      depositPerPerson
                    )}
                    € de Deposit par
                    personne.
                  </p>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-5">
                  <span className="text-zinc-400">
                    À payer sur
                    place
                  </span>

                  <span className="font-semibold">
                    {formatMoney(
                      totalRemaining
                    )}
                    €
                  </span>
                </div>
              </div>

              {deadlinePassed && (
                <p className="mt-6 text-sm text-red-400">
                  Les réservations
                  sont terminées
                  pour cette table.
                </p>
              )}

              {canBook ? (
                <Link
                  href={`/checkout/${slug}?table=${encodeURIComponent(
                    vipOfferId
                  )}&quantity=${quantity}`}
                  className="kre-primary-cta mt-8 block w-full rounded-2xl py-4 text-center font-semibold transition"
                >
                  Continuer ·{" "}
                  {formatMoney(
                    totalDeposit
                  )}
                  €
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="kre-primary-cta mt-8 block w-full cursor-not-allowed rounded-2xl py-4 text-center font-semibold"
                >
                  {deadlinePassed
                    ? "Réservations terminées"
                    : "Complet"}
                </button>
              )}

              <p className="mt-4 text-center text-xs text-zinc-500">
                Tu paies le
                Deposit maintenant.
                Le reste sera réglé
                directement sur
                place.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
