"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

const events = [
  {
    id: "shadow-saturday",
    club: "Shadow Club",
    city: "Paris",
    date: "Samedi 19 septembre",
    time: "23:30",
    price: 150,
    deposit: 50,
    remaining: 100,
    spots: 7,
    capacity: 10,
  },
  {
    id: "arc-friday",
    club: "L'Arc Paris",
    city: "Paris",
    date: "Vendredi 25 septembre",
    time: "23:30",
    price: 180,
    deposit: 60,
    remaining: 120,
    spots: 5,
    capacity: 10,
  },
  {
    id: "medellin-saturday",
    club: "Medellin Paris",
    city: "Paris",
    date: "Samedi 26 septembre",
    time: "23:30",
    price: 160,
    deposit: 50,
    remaining: 110,
    spots: 8,
    capacity: 10,
  },
];

export default function BookingPage() {
  const params = useParams();

  const id = params.id as string;

  const event = events.find((item) => item.id === id);

  const [quantity, setQuantity] = useState(1);

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            Soirée introuvable
          </h1>

          <Link
            href="/events"
            className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-black"
          >
            Retour aux soirées
          </Link>
        </div>
      </main>
    );
  }

  const availableSpots = event.capacity - event.spots;

  const totalPrice = event.price * quantity;

  const totalDeposit = event.deposit * quantity;

  const totalRemaining = event.remaining * quantity;

  function increaseQuantity() {
    if (quantity < availableSpots) {
      setQuantity(quantity + 1);
    }
  }

  function decreaseQuantity() {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            VIP SHARE
          </Link>

          <Link
            href={`/events/${event.id}`}
            className="rounded-full border border-white/20 px-5 py-2 text-sm transition hover:border-white/40"
          >
            ← Retour
          </Link>
        </nav>

        <section className="grid gap-10 py-16 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/40">
              Réservation
            </p>

            <h1 className="mt-4 text-4xl font-bold md:text-5xl">
              Combien de places
              <br />
              souhaites-tu réserver ?
            </h1>

            <p className="mt-5 max-w-xl text-white/50">
              Réserve une ou plusieurs places pour toi et ton groupe.
              Chaque place correspond à une participation individuelle à
              la table VIP partagée.
            </p>

            <div className="mt-12 max-w-xl rounded-[32px] border border-white/10 bg-white/[0.03] p-8">
              <p className="text-sm text-white/40">
                Nombre de places
              </p>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={decreaseQuantity}
                  disabled={quantity === 1}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 text-2xl transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
                >
                  −
                </button>

                <div className="text-center">
                  <p className="text-6xl font-bold">
                    {quantity}
                  </p>

                  <p className="mt-2 text-sm text-white/40">
                    {quantity > 1 ? "places" : "place"}
                  </p>
                </div>

                <button
                  onClick={increaseQuantity}
                  disabled={quantity === availableSpots}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 text-2xl transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
                >
                  +
                </button>
              </div>

              <p className="mt-8 text-center text-sm text-white/40">
                {availableSpots} place
                {availableSpots > 1 ? "s" : ""} disponible
                {availableSpots > 1 ? "s" : ""} actuellement
              </p>
            </div>
          </div>

          <div>
            <div className="sticky top-8 rounded-[32px] border border-white/10 bg-white/[0.03] p-7">
              <p className="text-sm uppercase tracking-[0.25em] text-white/40">
                Récapitulatif
              </p>

              <div className="mt-6">
                <h2 className="text-2xl font-bold">
                  {event.club}
                </h2>

                <p className="mt-2 text-sm text-white/50">
                  {event.date}
                </p>

                <p className="mt-1 text-sm text-white/50">
                  {event.time} · {event.city}
                </p>
              </div>

              <div className="my-7 border-t border-white/10" />

              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/50">
                    Prix par personne
                  </span>

                  <span>
                    {event.price}€
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/50">
                    Nombre de places
                  </span>

                  <span>
                    {quantity}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/50">
                    Prix total
                  </span>

                  <span>
                    {totalPrice}€
                  </span>
                </div>
              </div>

              <div className="my-7 border-t border-white/10" />

              <div className="space-y-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/40">
                      Aujourd'hui
                    </p>

                    <p className="mt-1 text-sm text-white/40">
                      Dépôt de réservation
                    </p>
                  </div>

                  <p className="text-3xl font-bold">
                    {totalDeposit}€
                  </p>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/40">
                      Sur place
                    </p>

                    <p className="mt-1 text-sm text-white/40">
                      Solde au club
                    </p>
                  </div>

                  <p className="text-2xl font-semibold text-white/70">
                    {totalRemaining}€
                  </p>
                </div>
              </div>

              <Link
                href={`/checkout/${event.id}?quantity=${quantity}`}
                className="mt-8 block w-full rounded-full bg-white px-6 py-4 text-center font-semibold text-black transition hover:bg-white/80"
              >
                Continuer · {totalDeposit}€
              </Link>

              <p className="mt-4 text-center text-xs leading-5 text-white/30">
                Le solde de {totalRemaining}€ sera réglé directement
                auprès du club.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}