import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAdminAccess,
} from "@/lib/admin-access";

import { supabaseAdmin } from "@/lib/supabase-admin";

type Club = {
  id: string;
  name: string;
  city: string;
};

type VipOffer = {
  id: string;
  table_number: string;
  capacity: number;
  confirmation_threshold: number;
  spots_reserved: number;
  status: string;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  status: string;

  clubs:
    | Club
    | Club[]
    | null;

  vip_offers:
    | VipOffer[]
    | null;
};

export default async function AdminPage() {
  // ==========================================================
  // ACCESS
  // ==========================================================

  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.canManageAnyClub) {
    if (access.canScanAnyClub) {
      redirect("/admin/scan");
    }

    redirect("/events");
  }

  // ==========================================================
  // EVENTS
  // ==========================================================

  let query =
    supabaseAdmin
      .from("events")
      .select(`
        id,
        slug,
        name,
        event_date,
        start_time,
        status,

        clubs (
          id,
          name,
          city
        ),

        vip_offers (
          id,
          table_number,
          capacity,
          confirmation_threshold,
          spots_reserved,
          status
        )
      `)
      .order(
        "event_date",
        {
          ascending: false,
        }
      );

  // Club Admin :
  // uniquement ses clubs.
  //
  // Manager :
  // aucune restriction.

  if (!access.isManager) {
    query =
      query.in(
        "club_id",
        access.managedClubIds
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    console.error(
      "Erreur dashboard admin :",
      error
    );
  }

  const events =
    (data ?? []) as unknown as EventItem[];

  // ==========================================================
  // STATS
  // ==========================================================

  let totalTables = 0;
  let totalCapacity = 0;
  let totalReserved = 0;
  let tablesToReview = 0;

  for (const event of events) {
    for (
      const offer of
      event.vip_offers ?? []
    ) {
      totalTables += 1;

      totalCapacity +=
        Number(
          offer.capacity
        );

      totalReserved +=
        Number(
          offer.spots_reserved
        );

      if (
        offer.status ===
        "admin_review"
      ) {
        tablesToReview += 1;
      }
    }
  }

  const fillRate =
    totalCapacity > 0
      ? Math.round(
          (
            totalReserved /
            totalCapacity
          ) *
            100
        )
      : 0;

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* ==================================================
            HEADER
        ================================================== */}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              VIP Share · Admin
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Dashboard
            </h1>

            <p className="mt-3 text-zinc-400">
              {access.isManager
                ? "Vue globale de tous les clubs VIP Share."
                : "Gère les soirées et tables de ton club."}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {access.isManager && (
              <Link
                href="/manager"
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm transition hover:border-white"
              >
                Espace Manager
              </Link>
            )}

            <Link
              href="/admin/scan"
              className="rounded-full border border-zinc-700 px-5 py-3 text-sm transition hover:border-white"
            >
              Scanner
            </Link>

            <Link
              href="/admin/events/new"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              + Créer une soirée
            </Link>
          </div>
        </div>

        {/* ==================================================
            STATS
        ================================================== */}

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Soirées"
            value={events.length.toString()}
          />

          <StatCard
            label="Tables"
            value={totalTables.toString()}
          />

          <StatCard
            label="Places réservées"
            value={`${totalReserved}/${totalCapacity}`}
          />

          <StatCard
            label="Remplissage"
            value={`${fillRate}%`}
          />

          <StatCard
            label="Décisions requises"
            value={tablesToReview.toString()}
            important={
              tablesToReview > 0
            }
          />
        </section>

        {/* ==================================================
            EVENTS
        ================================================== */}

        <section className="mt-12">
          <div>
            <h2 className="text-2xl font-semibold">
              Soirées
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              {events.length} événement
              {events.length > 1
                ? "s"
                : ""}
            </p>
          </div>

          {events.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
              <h3 className="text-xl font-semibold">
                Aucune soirée
              </h3>

              <p className="mt-3 text-zinc-500">
                Commence par créer une
                soirée.
              </p>

              <Link
                href="/admin/events/new"
                className="mt-6 inline-block rounded-full bg-white px-6 py-3 font-semibold text-black"
              >
                Créer une soirée
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-5">
              {events.map(
                (event) => {
                  const club =
                    Array.isArray(
                      event.clubs
                    )
                      ? event.clubs[0]
                      : event.clubs;

                  const offers =
                    event.vip_offers ??
                    [];

                  const eventCapacity =
                    offers.reduce(
                      (
                        total,
                        offer
                      ) =>
                        total +
                        Number(
                          offer.capacity
                        ),
                      0
                    );

                  const eventReserved =
                    offers.reduce(
                      (
                        total,
                        offer
                      ) =>
                        total +
                        Number(
                          offer.spots_reserved
                        ),
                      0
                    );

                  const reviewCount =
                    offers.filter(
                      (offer) =>
                        offer.status ===
                        "admin_review"
                    ).length;

                  const formattedDate =
                    new Date(
                      `${event.event_date}T12:00:00`
                    ).toLocaleDateString(
                      "fr-FR",
                      {
                        weekday:
                          "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    );

                  return (
                    <Link
                      key={event.id}
                      href={`/admin/events/${event.id}`}
                      className="group rounded-3xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-zinc-600"
                    >
                      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm text-zinc-500">
                            {club?.name ??
                              "Club"}

                            {club?.city
                              ? ` · ${club.city}`
                              : ""}
                          </p>

                          <h3 className="mt-2 text-2xl font-semibold">
                            {event.name}
                          </h3>

                          <p className="mt-2 capitalize text-zinc-400">
                            {
                              formattedDate
                            }

                            {" · "}

                            {event.start_time?.slice(
                              0,
                              5
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <InfoBadge>
                            {
                              offers.length
                            }{" "}
                            table
                            {offers.length >
                            1
                              ? "s"
                              : ""}
                          </InfoBadge>

                          <InfoBadge>
                            {
                              eventReserved
                            }
                            /
                            {
                              eventCapacity
                            }{" "}
                            places
                          </InfoBadge>

                          {reviewCount >
                            0 && (
                            <span className="rounded-full border border-amber-800 bg-amber-950/30 px-3 py-2 text-sm text-amber-400">
                              {
                                reviewCount
                              }{" "}
                              décision
                              {reviewCount >
                              1
                                ? "s"
                                : ""}{" "}
                              requise
                              {reviewCount >
                              1
                                ? "s"
                                : ""}
                            </span>
                          )}

                          <span className="text-zinc-600 transition group-hover:translate-x-1">
                            →
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ============================================================
// COMPONENTS
// ============================================================

function StatCard({
  label,
  value,
  important = false,
}: {
  label: string;
  value: string;
  important?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        important
          ? "border-amber-900 bg-amber-950/20"
          : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          important
            ? "text-amber-400"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InfoBadge({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="rounded-full border border-zinc-800 px-3 py-2 text-sm text-zinc-400">
      {children}
    </span>
  );
}