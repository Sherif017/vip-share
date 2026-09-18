"use client";

import {
  QRCodeSVG,
} from "qrcode.react";

import Link from "next/link";

type ConfirmationClientProps = {
  reservationCode: string;
  firstname: string;

  quantity: number;

  totalPrice: number;
  depositPaid: number;
  remainingAmount: number;

  status: string;

  eventSlug: string;
  eventName: string;
  eventDate: string;
  startTime: string;

  clubName: string;
  clubCity: string;

  tableNumber: string;

  tableParticipants: number;
  tableCapacity: number;
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

export default function ConfirmationClient({
  reservationCode,
  firstname,

  quantity,

  totalPrice,
  depositPaid,
  remainingAmount,

  status,

  eventSlug,
  eventName,
  eventDate,
  startTime,

  clubName,
  clubCity,

  tableNumber,

  tableParticipants,
  tableCapacity,
}: ConfirmationClientProps) {
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

  /*
   * Le QR reste volontairement stable.
   * Les données variables de la table
   * sont récupérées au moment du scan.
   */
  const qrValue =
    JSON.stringify({
      type:
        "vip-share-reservation",

      code:
        reservationCode,
    });

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white text-3xl text-black">
            ✓
          </div>

          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
            VIP Share
          </p>

          <h1 className="text-4xl font-bold md:text-5xl">
            Réservation confirmée
          </h1>

          <p className="mt-4 text-zinc-400">
            Merci {firstname}, ta réservation VIP est confirmée.
          </p>
        </div>

        {/* TABLE */}

        <div className="mb-5 rounded-3xl border border-white/20 bg-white p-7 text-black">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Ta table
          </p>

          <div className="mt-3 flex items-end justify-between gap-5">
            <div>
              <p className="text-4xl font-bold md:text-5xl">
                Table n°{tableNumber}
              </p>

              <p className="mt-3 text-sm text-zinc-600">
                {tableParticipants} /{" "}
                {tableCapacity} participants réservés
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white">
              VIP
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 p-7 md:p-9">
            <p className="mb-2 text-sm text-zinc-500">
              Ta soirée
            </p>

            <h2 className="text-3xl font-semibold">
              {clubName}
            </h2>

            <p className="mt-1 text-zinc-400">
              {eventName}
            </p>

            <div className="mt-6 space-y-2 text-zinc-400">
              <p className="capitalize">
                {formattedDate}
              </p>

              <p>
                {startTime.slice(
                  0,
                  5
                )}
              </p>

              <p>
                {clubCity}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2">
            {/* RECAP */}

            <div className="border-b border-zinc-800 p-7 md:border-b-0 md:border-r md:p-9">
              <h3 className="mb-6 text-lg font-semibold">
                Récapitulatif
              </h3>

              <div className="space-y-5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Table
                  </span>

                  <span className="font-semibold">
                    N° {tableNumber}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Nombre de places
                  </span>

                  <span className="font-semibold">
                    {quantity}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Valeur totale
                  </span>

                  <span>
                    {formatMoney(
                      totalPrice
                    )}
                    €
                  </span>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-5">
                  <span className="text-zinc-400">
                    Deposit payé
                  </span>

                  <span className="font-semibold">
                    {formatMoney(
                      depositPaid
                    )}
                    €
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    À payer sur place
                  </span>

                  <span className="font-semibold">
                    {formatMoney(
                      remainingAmount
                    )}
                    €
                  </span>
                </div>
              </div>

              <div className="mt-7 rounded-xl border border-zinc-800 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Référence
                </p>

                <p className="mt-2 break-all font-mono text-sm">
                  {reservationCode}
                </p>
              </div>
            </div>

            {/* QR */}

            <div className="flex flex-col items-center justify-center p-7 text-center md:p-9">
              <p className="mb-2 text-sm text-zinc-500">
                Ton pass VIP
              </p>

              <p className="mb-5 font-semibold">
                Table n°{tableNumber}
              </p>

              <div className="rounded-2xl bg-white p-5">
                <QRCodeSVG
                  value={
                    qrValue
                  }
                  size={190}
                  level="H"
                />
              </div>

              <p className="mt-5 text-sm text-zinc-400">
                Présente ce QR code à ton arrivée.
              </p>

              <p className="mt-2 text-xs text-zinc-600">
                {quantity} entrée
                {quantity > 1
                  ? "s"
                  : ""} disponible
                {quantity > 1
                  ? "s"
                  : ""}
              </p>

              <p className="mt-1 text-xs text-zinc-700">
                Statut : {status}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href={`/events/${eventSlug}`}
            className="rounded-2xl border border-zinc-800 py-4 text-center font-semibold transition hover:border-zinc-600"
          >
            Voir la soirée
          </Link>

          <Link
            href="/events"
            className="rounded-2xl bg-white py-4 text-center font-semibold text-black transition hover:bg-zinc-200"
          >
            Voir les autres soirées
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          Conserve ton pass et ta référence de réservation.
        </p>
      </section>
    </main>
  );
}