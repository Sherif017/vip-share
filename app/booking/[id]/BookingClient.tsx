"use client";

import Link from "next/link";
import { useState } from "react";

type BookingClientProps = {
  slug: string;
  clubName: string;
  eventName: string;
  eventDate: string;
  startTime: string;
  capacity: number;
  spotsReserved: number;
  pricePerPerson: number;
  depositPerPerson: number;
  remainingPerPerson: number;
};

export default function BookingClient({
  slug,
  clubName,
  eventName,
  eventDate,
  startTime,
  capacity,
  spotsReserved,
  pricePerPerson,
  depositPerPerson,
  remainingPerPerson,
}: BookingClientProps) {
  const availableSpots = Math.max(
    capacity - spotsReserved,
    0
  );

  const [quantity, setQuantity] = useState(1);

  const totalPrice = pricePerPerson * quantity;
  const totalDeposit = depositPerPerson * quantity;
  const totalRemaining = remainingPerPerson * quantity;

  const formattedDate = new Intl.DateTimeFormat(
    "fr-FR",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(new Date(`${eventDate}T12:00:00`));

  function decreaseQuantity() {
    setQuantity((current) =>
      Math.max(1, current - 1)
    );
  }

  function increaseQuantity() {
    setQuantity((current) =>
      Math.min(availableSpots, current + 1)
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="max-w-5xl mx-auto px-6 py-14">
        <Link
          href={`/events/${slug}`}
          className="inline-block text-sm text-zinc-400 hover:text-white mb-10 transition"
        >
          ← Retour à la soirée
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
              Réservation
            </p>

            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Choisis tes places
            </h1>

            <p className="text-zinc-400 mb-10">
              Réserve une ou plusieurs places sur la table VIP
              partagée.
            </p>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 mb-6">
              <p className="text-sm text-zinc-500 mb-2">
                Ta soirée
              </p>

              <h2 className="text-2xl font-semibold">
                {clubName}
              </h2>

              <p className="text-zinc-400 mt-1">
                {eventName}
              </p>

              <div className="mt-6 space-y-2 text-sm text-zinc-400">
                <p className="capitalize">
                  {formattedDate}
                </p>

                <p>
                  {startTime.slice(0, 5)}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-sm text-zinc-500 mb-1">
                    Nombre de places
                  </p>

                  <p className="text-zinc-300">
                    {availableSpots} disponible
                    {availableSpots > 1 ? "s" : ""}
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    onClick={decreaseQuantity}
                    disabled={quantity <= 1}
                    className="w-12 h-12 rounded-full border border-zinc-700 text-xl disabled:opacity-30 hover:border-white transition"
                  >
                    −
                  </button>

                  <span className="text-3xl font-semibold min-w-8 text-center">
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={increaseQuantity}
                    disabled={quantity >= availableSpots}
                    className="w-12 h-12 rounded-full border border-zinc-700 text-xl disabled:opacity-30 hover:border-white transition"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-6 space-y-4">
                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Prix par personne
                  </span>

                  <span>
                    {pricePerPerson.toFixed(0)}€
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Nombre de places
                  </span>

                  <span>× {quantity}</span>
                </div>

                <div className="flex justify-between text-lg font-semibold border-t border-zinc-800 pt-4">
                  <span>Total</span>

                  <span>
                    {totalPrice.toFixed(0)}€
                  </span>
                </div>
              </div>
            </div>
          </div>

          <aside>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 lg:sticky lg:top-8">
              <h2 className="text-xl font-semibold mb-7">
                Récapitulatif
              </h2>

              <div className="space-y-5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    {quantity} place
                    {quantity > 1 ? "s" : ""}
                  </span>

                  <span className="font-semibold">
                    {totalPrice.toFixed(0)}€
                  </span>
                </div>

                <div className="border-t border-zinc-800 pt-5">
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">
                      À payer maintenant
                    </span>

                    <span className="text-xl font-bold">
                      {totalDeposit.toFixed(0)}€
                    </span>
                  </div>

                  <p className="text-xs text-zinc-500">
                    Acompte de{" "}
                    {depositPerPerson.toFixed(0)}€ par personne.
                  </p>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-5">
                  <span className="text-zinc-400">
                    À payer sur place
                  </span>

                  <span className="font-semibold">
                    {totalRemaining.toFixed(0)}€
                  </span>
                </div>
              </div>

              {availableSpots > 0 ? (
                <Link
                    href={`/checkout/${slug}?quantity=${quantity}`}
                    className="block w-full mt-8 rounded-2xl bg-white text-black text-center font-semibold py-4 hover:bg-zinc-200 transition"
                >
                     Continuer
                 </Link>
              ) : (
                <button
                    type="button"
                    disabled
                    className="block w-full mt-8 rounded-2xl bg-zinc-800 text-zinc-500 text-center font-semibold py-4 cursor-not-allowed"
                >
                    Complet
                </button>
              )}

              <p className="text-xs text-zinc-500 text-center mt-4">
                Le montant restant sera payé sur place.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}