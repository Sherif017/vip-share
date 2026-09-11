import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type Reservation = {
  id: string;
  reservation_code: string;
  quantity: number;
  total_price: number;
  deposit_paid: number;
  remaining_amount: number;
  status: string;
  created_at: string;

  events:
    | {
        slug: string;
        name: string;
        event_date: string;
        start_time: string;
        clubs:
          | {
              name: string;
              city: string;
            }
          | {
              name: string;
              city: string;
            }[]
          | null;
      }
    | {
        slug: string;
        name: string;
        event_date: string;
        start_time: string;
        clubs:
          | {
              name: string;
              city: string;
            }
          | {
              name: string;
              city: string;
            }[]
          | null;
      }[]
    | null;
};

export default async function ReservationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("reservations")
    .select(`
      id,
      reservation_code,
      quantity,
      total_price,
      deposit_paid,
      remaining_amount,
      status,
      created_at,
      events (
        slug,
        name,
        event_date,
        start_time,
        clubs (
          name,
          city
        )
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "Erreur récupération réservations :",
      error
    );
  }

  const reservations =
    (data ?? []) as unknown as Reservation[];

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              VIP Share
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Mes réservations
            </h1>

            <p className="mt-3 text-zinc-400">
              Retrouve toutes tes expériences VIP et tes pass.
            </p>
          </div>

          <Link
            href="/events"
            className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-medium transition hover:border-white"
          >
            Voir les soirées
          </Link>
        </div>

        {reservations.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
            <h2 className="text-2xl font-semibold">
              Aucune réservation
            </h2>

            <p className="mt-3 text-zinc-500">
              Tu n&apos;as pas encore réservé de place VIP.
            </p>

            <Link
              href="/events"
              className="mt-7 inline-block rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-zinc-200"
            >
              Découvrir les soirées
            </Link>
          </div>
        ) : (
          <div className="mt-12 grid gap-6">
            {reservations.map((reservation) => {
              const event = Array.isArray(
                reservation.events
              )
                ? reservation.events[0]
                : reservation.events;

              const club = Array.isArray(
                event?.clubs
              )
                ? event?.clubs[0]
                : event?.clubs;

              const date = event?.event_date
                ? new Date(
                    `${event.event_date}T12:00:00`
                  ).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "";

              return (
                <article
                  key={reservation.id}
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8"
                >
                  <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-zinc-500">
                          {club?.name ?? "Club"}
                          {club?.city
                            ? ` · ${club.city}`
                            : ""}
                        </p>

                        <StatusBadge
                          status={
                            reservation.status
                          }
                        />
                      </div>

                      <h2 className="mt-3 text-2xl font-semibold">
                        {event?.name ??
                          "Soirée VIP"}
                      </h2>

                      <p className="mt-2 text-zinc-400 capitalize">
                        {date}
                        {event?.start_time
                          ? ` · ${event.start_time.slice(
                              0,
                              5
                            )}`
                          : ""}
                      </p>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <InfoBadge>
                          {reservation.quantity}{" "}
                          place
                          {reservation.quantity >
                          1
                            ? "s"
                            : ""}
                        </InfoBadge>

                        <InfoBadge>
                          Total :{" "}
                          {Number(
                            reservation.total_price
                          ).toFixed(2)}
                          €
                        </InfoBadge>

                        <InfoBadge>
                          Payé :{" "}
                          {Number(
                            reservation.deposit_paid
                          ).toFixed(2)}
                          €
                        </InfoBadge>

                        <InfoBadge>
                          Sur place :{" "}
                          {Number(
                            reservation.remaining_amount
                          ).toFixed(2)}
                          €
                        </InfoBadge>
                      </div>

                      <p className="mt-5 text-xs text-zinc-600">
                        Réservation{" "}
                        {
                          reservation.reservation_code
                        }
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-3">
                      {reservation.status ===
                        "confirmed" && (
                        <Link
                          href={`/confirmation/${reservation.reservation_code}`}
                          className="rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-black transition hover:bg-zinc-200"
                        >
                          Voir mon pass VIP
                        </Link>
                      )}

                      {event?.slug && (
                        <Link
                          href={`/events/${event.slug}`}
                          className="rounded-full border border-zinc-700 px-6 py-3 text-center text-sm font-medium transition hover:border-white"
                        >
                          Voir la soirée
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function InfoBadge({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
      {children}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  if (status === "confirmed") {
    return (
      <span className="rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
        Confirmée
      </span>
    );
  }

  if (status === "pending_payment") {
    return (
      <span className="rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
        Paiement en attente
      </span>
    );
  }

  if (status === "payment_expired") {
    return (
      <span className="rounded-full border border-red-900 bg-red-950/20 px-3 py-1 text-xs font-medium text-red-400">
        Expirée
      </span>
    );
  }

  return (
    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
      {status}
    </span>
  );
}