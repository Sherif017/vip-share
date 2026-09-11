"use client";

import { QRCodeSVG } from "qrcode.react";
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
};

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
}: ConfirmationClientProps) {
  const formattedDate = new Intl.DateTimeFormat(
    "fr-FR",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(
    new Date(`${eventDate}T12:00:00`)
  );

  const qrValue = JSON.stringify({
    type: "vip-share-reservation",
    code: reservationCode,
  });

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="max-w-3xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white text-black text-3xl">
            ✓
          </div>

          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
            VIP Share
          </p>

          <h1 className="text-4xl md:text-5xl font-bold">
            Réservation confirmée
          </h1>

          <p className="text-zinc-400 mt-4">
            Merci {firstname}, ta place VIP est réservée.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="p-7 md:p-9 border-b border-zinc-800">
            <p className="text-sm text-zinc-500 mb-2">
              Ta soirée
            </p>

            <h2 className="text-3xl font-semibold">
              {clubName}
            </h2>

            <p className="text-zinc-400 mt-1">
              {eventName}
            </p>

            <div className="mt-6 space-y-2 text-zinc-400">
              <p className="capitalize">
                {formattedDate}
              </p>

              <p>{startTime.slice(0, 5)}</p>

              <p>{clubCity}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2">
            <div className="p-7 md:p-9 border-b md:border-b-0 md:border-r border-zinc-800">
              <h3 className="font-semibold text-lg mb-6">
                Récapitulatif
              </h3>

              <div className="space-y-5">
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
                    {totalPrice.toFixed(0)}€
                  </span>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-5">
                  <span className="text-zinc-400">
                    Acompte
                  </span>

                  <span className="font-semibold">
                    {depositPaid.toFixed(0)}€
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    À payer sur place
                  </span>

                  <span className="font-semibold">
                    {remainingAmount.toFixed(0)}€
                  </span>
                </div>
              </div>

              <div className="mt-7 rounded-xl border border-zinc-800 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  Référence
                </p>

                <p className="font-mono mt-2 text-sm break-all">
                  {reservationCode}
                </p>
              </div>
            </div>

            <div className="p-7 md:p-9 flex flex-col items-center justify-center text-center">
              <p className="text-sm text-zinc-500 mb-5">
                Ton pass VIP
              </p>

              <div className="bg-white rounded-2xl p-5">
                <QRCodeSVG
                  value={qrValue}
                  size={190}
                  level="H"
                />
              </div>

              <p className="text-sm text-zinc-400 mt-5">
                Présente ce QR code à ton arrivée.
              </p>

              <p className="text-xs text-zinc-600 mt-2">
                Statut : {status}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href={`/events/${eventSlug}`}
            className="rounded-2xl border border-zinc-800 text-center py-4 font-semibold hover:border-zinc-600 transition"
          >
            Voir la soirée
          </Link>

          <Link
            href="/events"
            className="rounded-2xl bg-white text-black text-center py-4 font-semibold hover:bg-zinc-200 transition"
          >
            Voir les autres soirées
          </Link>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-8">
          Conserve ta référence de réservation.
        </p>
      </section>
    </main>
  );
}