import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type EventRow = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  status: string;

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

  vip_offers:
    | {
        id: string;
        capacity: number;
        spots_reserved: number;
        price_per_person: number;
        deposit_per_person: number;
        status: string;
      }[]
    | null;
};

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/events");
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .select(`
      id,
      slug,
      name,
      event_date,
      start_time,
      status,
      clubs (
        name,
        city
      ),
      vip_offers (
        id,
        capacity,
        spots_reserved,
        price_per_person,
        deposit_per_person,
        status
      )
    `)
    .order("event_date", {
      ascending: true,
    });

  if (error) {
    console.error(
      "Erreur chargement dashboard admin :",
      error
    );
  }

  const events =
    (data ?? []) as unknown as EventRow[];

  let totalCapacity = 0;
  let totalReserved = 0;
  let estimatedDeposits = 0;

  for (const event of events) {
    const offer = event.vip_offers?.[0];

    if (!offer) {
      continue;
    }

    totalCapacity += Number(offer.capacity);
    totalReserved += Number(
      offer.spots_reserved ?? 0
    );

    estimatedDeposits +=
      Number(offer.spots_reserved ?? 0) *
      Number(offer.deposit_per_person);
  }

  const fillRate =
    totalCapacity > 0
      ? Math.round(
          (totalReserved / totalCapacity) * 100
        )
      : 0;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              VIP Share
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Dashboard admin
            </h1>

            <p className="mt-3 text-zinc-400">
              Gère les événements, les places VIP
              et les réservations.
            </p>
          </div>

          <Link
            href="/admin/events/new"
            className="rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            + Créer une soirée
          </Link>
        </div>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Soirées"
            value={events.length.toString()}
          />

          <StatCard
            label="Places réservées"
            value={totalReserved.toString()}
          />

          <StatCard
            label="Taux de remplissage"
            value={`${fillRate}%`}
          />

          <StatCard
            label="Acomptes estimés"
            value={`${estimatedDeposits.toFixed(
              2
            )} €`}
          />
        </section>

        <section className="mt-12">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              Événements
            </h2>

            <span className="text-sm text-zinc-500">
              {events.length} événement
              {events.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-5">
            {events.length === 0 && (
              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
                <p className="text-zinc-400">
                  Aucune soirée pour le moment.
                </p>
              </div>
            )}

            {events.map((event) => {
              const club = Array.isArray(
                event.clubs
              )
                ? event.clubs[0]
                : event.clubs;

              const offer =
                event.vip_offers?.[0];

              const capacity = Number(
                offer?.capacity ?? 0
              );

              const reserved = Number(
                offer?.spots_reserved ?? 0
              );

              const percentage =
                capacity > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (reserved / capacity) * 100
                      )
                    )
                  : 0;

              const date =
                new Date(
                  `${event.event_date}T12:00:00`
                ).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                });

              return (
                <article
                  key={event.id}
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8"
                >
                  <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-zinc-500">
                          {club?.name ??
                            "Club inconnu"}
                          {club?.city
                            ? ` · ${club.city}`
                            : ""}
                        </p>

                        <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                          {event.status}
                        </span>
                      </div>

                      <h3 className="mt-3 text-2xl font-semibold">
                        {event.name}
                      </h3>

                      <p className="mt-2 capitalize text-zinc-400">
                        {date} ·{" "}
                        {event.start_time?.slice(
                          0,
                          5
                        )}
                      </p>

                      {offer && (
                        <div className="mt-6 max-w-xl">
                          <div className="mb-2 flex justify-between text-sm">
                            <span className="text-zinc-400">
                              Remplissage
                            </span>

                            <span>
                              {reserved} /{" "}
                              {capacity}
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

                          <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-400">
                            <span>
                              {Number(
                                offer.price_per_person
                              ).toFixed(0)}
                              € / personne
                            </span>

                            <span>·</span>

                            <span>
                              Acompte{" "}
                              {Number(
                                offer.deposit_per_person
                              ).toFixed(0)}
                              €
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
                      <Link
                        href={`/admin/events/${event.id}`}
                        className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-zinc-200"
                      >
                        Gérer
                      </Link>

                      <Link
                        href={`/events/${event.slug}`}
                        className="rounded-full border border-zinc-700 px-5 py-3 text-center text-sm transition hover:border-white"
                      >
                        Voir côté client
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold">
        {value}
      </p>
    </div>
  );
}