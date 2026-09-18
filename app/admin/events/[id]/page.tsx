import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import {
  canManageEvent,
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";
import { isPassAccessible } from "@/lib/vip-status";

import EventStatusActions from "@/components/EventStatusActions";
import AdminReviewActions from "../../../../components/AdminReviewActions";
import AdminRefundButton from "@/components/AdminRefundButton";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

type Reservation = {
  id: string;

  vip_offer_id: string;

  firstname: string;
  lastname: string;

  email: string;
  phone: string;

  quantity: number;

  total_price: number;
  deposit_paid: number;
  remaining_amount: number;

  status: string;

  reservation_code: string;

  checked_in_quantity: number;
  checked_in: boolean;
  checked_in_at: string | null;

  paid_at: string | null;
  stripe_checkout_session_id: string | null;
  supplement_status: string | null;
  supplement_paid_at: string | null;
  supplement_stripe_session_id: string | null;
  stripe_supplement_session_id: string | null;
  refunded_at: string | null;
  created_at: string;
};

type RefundState = {
  reservation_id: string;
  payment_type: "initial_deposit" | "supplement";
  status: "refund_pending" | "refunding" | "refunded";
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

  booking_deadline: string | null;

  status: string;
};

type EventData = {
  id: string;

  slug: string;
  name: string;

  event_date: string;
  start_time: string;

  music: string | null;
  status: string;

  commission_percentage?: number;

  clubs:
    | {
        name: string;
        city: string;
        address: string | null;
      }
    | {
        name: string;
        city: string;
        address: string | null;
      }[]
    | null;

  vip_offers:
    | VipOffer[]
    | null;
};

/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default async function AdminEventPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  /*
  |--------------------------------------------------------------------------
  | Permissions
  |--------------------------------------------------------------------------
  */

  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.canManageAnyClub) {
    if (
      access.canScanAnyClub
    ) {
      redirect("/admin/scan");
    }

    redirect("/events");
  }

  const allowed =
    await canManageEvent(
      access,
      id
    );

  if (!allowed) {
    redirect("/admin");
  }

  /*
  |--------------------------------------------------------------------------
  | Soirée + tables
  |--------------------------------------------------------------------------
  */

  const {
    data: eventData,
    error: eventError,
  } =
    await supabaseAdmin
      .from("events")
      .select(`
        id,
        slug,
        name,
        event_date,
        start_time,
        music,
        status,
        commission_percentage,

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
      .eq("id", id)
      .maybeSingle();

  if (eventError) {
    console.error(
      "Erreur récupération soirée admin :",
      eventError
    );
  }

  if (!eventData) {
    notFound();
  }

  const event =
    eventData as unknown as EventData;

  /*
  |--------------------------------------------------------------------------
  | Club
  |--------------------------------------------------------------------------
  */

  const club =
    Array.isArray(
      event.clubs
    )
      ? event.clubs[0]
      : event.clubs;

  /*
  |--------------------------------------------------------------------------
  | Tables
  |--------------------------------------------------------------------------
  */

  const tables =
    [...(event.vip_offers ?? [])]
      .sort((a, b) =>
        String(
          a.table_number
        ).localeCompare(
          String(
            b.table_number
          ),
          "fr",
          {
            numeric: true,
            sensitivity:
              "base",
          }
        )
      );

  /*
  |--------------------------------------------------------------------------
  | Réservations
  |--------------------------------------------------------------------------
  */

  const {
    data:
      reservationsData,

    error:
      reservationsError,
  } =
    await supabaseAdmin
      .from("reservations")
      .select(`
        id,
        vip_offer_id,
        firstname,
        lastname,
        email,
        phone,
        quantity,
        total_price,
        deposit_paid,
        remaining_amount,
        status,
        reservation_code,
        checked_in_quantity,
        checked_in,
        checked_in_at,
        paid_at,
        stripe_checkout_session_id,
        supplement_status,
        supplement_paid_at,
        supplement_stripe_session_id,
        stripe_supplement_session_id,
        refunded_at,
        created_at
      `)
      .eq(
        "event_id",
        id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (
    reservationsError
  ) {
    console.error(
      "Erreur récupération participants :",
      reservationsError
    );
  }

  const reservations =
    (
      reservationsData ??
      []
    ) as Reservation[];

  const refundStatesResult = reservations.length
    ? await supabaseAdmin
        .from("vip_refunds")
        .select("reservation_id, payment_type, status")
        .in(
          "reservation_id",
          reservations.map((reservation) => reservation.id)
        )
    : { data: [], error: null };

  if (refundStatesResult.error) {
    console.error("Erreur récupération états de remboursement :", refundStatesResult.error);
  }

  const refundStatesByReservation = new Map<string, RefundState[]>();
  for (const state of (refundStatesResult.data ?? []) as RefundState[]) {
    const states = refundStatesByReservation.get(state.reservation_id) ?? [];
    states.push(state);
    refundStatesByReservation.set(state.reservation_id, states);
  }

  /*
  |--------------------------------------------------------------------------
  | Réservations confirmées
  |--------------------------------------------------------------------------
  */

  const confirmedReservations =
    reservations.filter(
      (reservation) =>
        isPassAccessible(reservation.status)
    );

  /*
  |--------------------------------------------------------------------------
  | Statistiques globales
  |--------------------------------------------------------------------------
  */

  const totalCapacity =
    tables.reduce(
      (
        total,
        table
      ) =>
        total +
        Number(
          table.capacity ??
            0
        ),
      0
    );

  const confirmedPeople =
    confirmedReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation.quantity ??
            0
        ),
      0
    );

  const totalCheckedIn =
    confirmedReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation
            .checked_in_quantity ??
            0
        ),
      0
    );

  const totalDeposits =
    confirmedReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation
            .deposit_paid ??
            0
        ),
      0
    );

  const totalRevenue =
    confirmedReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation
            .total_price ??
            0
        ),
      0
    );

  const totalRemaining =
    confirmedReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation
            .remaining_amount ??
            0
        ),
      0
    );

  const remainingSpots =
    Math.max(
      0,
      totalCapacity -
        confirmedPeople
    );

  const globalFillRate =
    totalCapacity > 0
      ? Math.round(
          (
            confirmedPeople /
            totalCapacity
          ) * 100
        )
      : 0;

  const globalCheckInRate =
    confirmedPeople > 0
      ? Math.round(
          (
            totalCheckedIn /
            confirmedPeople
          ) * 100
        )
      : 0;

  /*
  |--------------------------------------------------------------------------
  | Paiements en attente
  |--------------------------------------------------------------------------
  */

  const pendingReservations =
    reservations.filter(
      (reservation) =>
        reservation.status ===
        "pending_payment"
    );

  const pendingPeople =
    pendingReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation.quantity ??
            0
        ),
      0
    );

  /*
  |--------------------------------------------------------------------------
  | Date soirée
  |--------------------------------------------------------------------------
  */

  const formattedDate =
    new Date(
      `${event.event_date}T12:00:00`
    ).toLocaleDateString(
      "fr-FR",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    );

  /*
  |--------------------------------------------------------------------------
  | Interface
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">

        {/* Retour */}

        <Link
          href="/admin"
          className="text-sm text-zinc-500 transition hover:text-white"
        >
          ← Retour au dashboard
        </Link>

        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              {club?.name ??
                "Club"}

              {club?.city
                ? ` · ${club.city}`
                : ""}
            </p>

            <h1 className="mt-3 text-4xl font-bold md:text-5xl">
              {event.name}
            </h1>

            <p className="mt-3 capitalize text-zinc-400">
              {formattedDate}
              {" · "}
              {event.start_time?.slice(
                0,
                5
              )}
            </p>

            {event.music && (
              <p className="mt-2 text-zinc-500">
                {event.music}
              </p>
            )}

            <div className="mt-4">
              <EventStatusBadge
                status={
                  event.status
                }
              />
            </div>

            <div className="mt-5">
              <EventStatusActions
                eventId={
                  event.id
                }
                currentStatus={
                  event.status
                }
              />
            </div>
          </div>

          {/* Actions */}

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/events/${event.slug}`}
              className="rounded-full border border-zinc-700 px-5 py-3 text-sm transition hover:border-white"
            >
              Voir côté client
            </Link>

            <Link
              href="/admin/scan"
              className="rounded-full border border-zinc-700 px-5 py-3 text-sm transition hover:border-white"
            >
              Scanner les entrées
            </Link>

            <Link
              href={`/admin/events/${event.id}/edit`}
              className="rounded-full kre-primary-cta px-5 py-3 text-sm font-semibold transition hover:bg-zinc-200"
            >
              Modifier
            </Link>
          </div>
        </div>

        {/* ===================================================== */}
        {/* STATISTIQUES GLOBALES */}
        {/* ===================================================== */}

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">

          <StatCard
            label="Tables"
            value={
              tables.length.toString()
            }
          />

          <StatCard
            label="Places confirmées"
            value={`${confirmedPeople}/${totalCapacity}`}
          />

          <StatCard
            label="Entrées"
            value={`${totalCheckedIn}/${confirmedPeople}`}
          />

          <StatCard
            label="Places restantes"
            value={
              remainingSpots.toString()
            }
          />

          <StatCard
            label="Remplissage"
            value={`${globalFillRate}%`}
          />

          <StatCard
            label="Deposits encaissés"
            value={
              formatMoney(
                totalDeposits
              )
            }
          />

          <StatCard
            label="CA réservé"
            value={
              formatMoney(
                totalRevenue
              )
            }
          />

        </section>

        {/* ===================================================== */}
        {/* SYNTHÈSE FINANCIÈRE */}
        {/* ===================================================== */}

        <section className="mt-6 grid gap-4 lg:grid-cols-3">

          <BigStat
            label="Deposits encaissés"
            value={
              formatMoney(
                totalDeposits
              )
            }
            subtitle="Montant payé en ligne"
          />

          <BigStat
            label="À payer sur place"
            value={
              formatMoney(
                totalRemaining
              )
            }
            subtitle="Montant restant à encaisser au club"
          />

          <BigStat
            label="Valeur des réservations"
            value={
              formatMoney(
                totalRevenue
              )
            }
            subtitle="Deposit + paiement sur place"
          />

        </section>

        {/* ===================================================== */}
        {/* ÉTAT GLOBAL */}
        {/* ===================================================== */}

        <section className="mt-6 grid gap-6 lg:grid-cols-2">

          {/* Remplissage */}

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-sm text-zinc-500">
                  Remplissage global
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  {confirmedPeople} /{" "}
                  {totalCapacity} places
                </h2>
              </div>

              <p className="text-3xl font-bold">
                {globalFillRate}%
              </p>
            </div>

            <ProgressBar
              percentage={
                globalFillRate
              }
            />

            <div className="mt-6 grid grid-cols-2 gap-4">
              <MiniStat
                label="Confirmées"
                value={
                  confirmedPeople
                }
              />

              <MiniStat
                label="Disponibles"
                value={
                  remainingSpots
                }
              />
            </div>

            {pendingPeople > 0 && (
              <div className="mt-4 rounded-2xl border border-yellow-900/50 bg-yellow-950/10 p-4">
                <p className="text-sm text-yellow-400">
                  {pendingPeople} place
                  {pendingPeople >
                  1
                    ? "s"
                    : ""}{" "}
                  actuellement en attente de paiement.
                </p>
              </div>
            )}
          </div>

          {/* Présence */}

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-sm text-zinc-500">
                  Entrées dans le club
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  {totalCheckedIn} /{" "}
                  {confirmedPeople} entrées
                </h2>
              </div>

              <p className="text-3xl font-bold">
                {globalCheckInRate}%
              </p>
            </div>

            <ProgressBar
              percentage={
                globalCheckInRate
              }
            />

            <div className="mt-6 grid grid-cols-2 gap-4">
              <MiniStat
                label="Entrées"
                value={
                  totalCheckedIn
                }
              />

              <MiniStat
                label="À venir"
                value={Math.max(
                  0,
                  confirmedPeople -
                    totalCheckedIn
                )}
              />
            </div>
          </div>

        </section>

        {/* ===================================================== */}
        {/* TABLES */}
        {/* ===================================================== */}

        <section className="mt-14">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-zinc-600">
              Gestion VIP
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Tables
            </h2>

            <p className="mt-2 text-zinc-500">
              {tables.length} table
              {tables.length !==
              1
                ? "s"
                : ""}{" "}
              configurée
              {tables.length !==
              1
                ? "s"
                : ""}{" "}
              pour cette soirée.
            </p>
          </div>

          {tables.length ===
          0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
              <p className="text-zinc-400">
                Aucune table configurée.
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-8">
              {tables.map(
                (
                  table
                ) => {
                  /*
                  |--------------------------------------------------------------------------
                  | Réservations de cette table
                  |--------------------------------------------------------------------------
                  */

                  const tableReservations =
                    reservations.filter(
                      (
                        reservation
                      ) =>
                        reservation.vip_offer_id ===
                        table.id
                    );

                  const tableConfirmedReservations =
                    tableReservations.filter(
                      (
                        reservation
                      ) =>
                        isPassAccessible(reservation.status)
                    );

                  /*
                  |--------------------------------------------------------------------------
                  | Statistiques table
                  |--------------------------------------------------------------------------
                  */

                  const tableConfirmedPeople =
                    tableConfirmedReservations.reduce(
                      (
                        total,
                        reservation
                      ) =>
                        total +
                        Number(
                          reservation.quantity ??
                            0
                        ),
                      0
                    );

                  const tableCheckedIn =
                    tableConfirmedReservations.reduce(
                      (
                        total,
                        reservation
                      ) =>
                        total +
                        Number(
                          reservation
                            .checked_in_quantity ??
                            0
                        ),
                      0
                    );

                  const tableDeposits =
                    tableConfirmedReservations.reduce(
                      (
                        total,
                        reservation
                      ) =>
                        total +
                        Number(
                          reservation
                            .deposit_paid ??
                            0
                        ),
                      0
                    );

                  const tableRemainingAmount =
                    tableConfirmedReservations.reduce(
                      (
                        total,
                        reservation
                      ) =>
                        total +
                        Number(
                          reservation
                            .remaining_amount ??
                            0
                        ),
                      0
                    );

                  const tableRevenue =
                    tableConfirmedReservations.reduce(
                      (
                        total,
                        reservation
                      ) =>
                        total +
                        Number(
                          reservation
                            .total_price ??
                            0
                        ),
                      0
                    );

                  const tableCapacity =
                    Number(
                      table.capacity ??
                        0
                    );

                  const tableRemainingSpots =
                    Math.max(
                      0,
                      tableCapacity -
                        tableConfirmedPeople
                    );

                  const tableFillRate =
                    tableCapacity >
                    0
                      ? Math.round(
                          (
                            tableConfirmedPeople /
                            tableCapacity
                          ) *
                            100
                        )
                      : 0;

                  const tableCheckInRate =
                    tableConfirmedPeople >
                    0
                      ? Math.round(
                          (
                            tableCheckedIn /
                            tableConfirmedPeople
                          ) *
                            100
                        )
                      : 0;

                  const threshold =
                    Number(
                      table.confirmation_threshold ??
                        0
                    );

                  const thresholdReached =
                    tableConfirmedPeople >=
                    threshold;

                  const temporaryHolds =
                    Math.max(
                      0,
                      Number(
                        table.spots_reserved ??
                          0
                      ) -
                        tableConfirmedPeople
                    );

                  return (
                    <article
                      key={
                        table.id
                      }
                      className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950"
                    >

                      {/* ========================================= */}
                      {/* HEADER TABLE */}
                      {/* ========================================= */}

                      <div className="border-b border-zinc-800 p-6 md:p-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-3xl font-bold">
                                Table n°
                                {
                                  table.table_number
                                }
                              </h3>

                              <TableStatusBadge
                                status={
                                  table.status
                                }
                              />

                              {thresholdReached ? (
                                <span className="rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
                                  Seuil atteint
                                </span>
                              ) : (
                                <span className="rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
                                  Seuil non atteint
                                </span>
                              )}
                            </div>

                            <p className="mt-3 text-zinc-500">
                              {
                                tableConfirmedPeople
                              }{" "}
                              /{" "}
                              {
                                tableCapacity
                              }{" "}
                              places confirmées
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

                            <CompactStat
                              label="Réservés"
                              value={`${tableConfirmedPeople}/${tableCapacity}`}
                            />

                            <CompactStat
                              label="Entrés"
                              value={`${tableCheckedIn}/${tableConfirmedPeople}`}
                            />

                            <CompactStat
                              label="Disponibles"
                              value={
                                tableRemainingSpots.toString()
                              }
                            />

                          </div>

                        </div>

                        {/* Progress bars */}

                        <div className="mt-8 grid gap-6 lg:grid-cols-2">

                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-zinc-500">
                                Remplissage
                              </span>

                              <span className="font-medium">
                                {
                                  tableFillRate
                                }
                                %
                              </span>
                            </div>

                            <ProgressBar
                              percentage={
                                tableFillRate
                              }
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-zinc-500">
                                Présence
                              </span>

                              <span className="font-medium">
                                {
                                  tableCheckInRate
                                }
                                %
                              </span>
                            </div>

                            <ProgressBar
                              percentage={
                                tableCheckInRate
                              }
                            />
                          </div>

                        </div>

                        {temporaryHolds >
                          0 && (
                          <div className="mt-5 rounded-2xl border border-yellow-900/50 bg-yellow-950/10 p-4">
                            <p className="text-sm text-yellow-400">
                              {
                                temporaryHolds
                              }{" "}
                              place
                              {temporaryHolds >
                              1
                                ? "s"
                                : ""}{" "}
                              temporairement bloquée
                              {temporaryHolds >
                              1
                                ? "s"
                                : ""}{" "}
                              par un paiement en cours.
                            </p>
                          </div>
                        )}

                        {table.status ===
                          "admin_review" && (
                          <AdminReviewActions
                            vipOfferId={
                              table.id
                            }
                            tableNumber={
                              String(
                                table.table_number
                              )
                            }
                            confirmedPeople={
                              tableConfirmedPeople
                            }
                            confirmationThreshold={
                              threshold
                            }
                          />
                        )}
                      </div>

                      {/* ========================================= */}
                      {/* INFOS TABLE */}
                      {/* ========================================= */}

                      <div className="border-b border-zinc-800 p-6 md:p-8">

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">

                          <TableInfo
                            label="Prix total table"
                            value={
                              formatMoney(
                                Number(
                                  table.total_table_price
                                )
                              )
                            }
                          />

                          <TableInfo
                            label="Prix / personne"
                            value={
                              formatMoney(
                                Number(
                                  table.price_per_person
                                )
                              )
                            }
                          />

                          <TableInfo
                            label="Deposit / personne"
                            value={
                              formatMoney(
                                Number(
                                  table.deposit_per_person
                                )
                              )
                            }
                          />

                          <TableInfo
                            label="Sur place / personne"
                            value={
                              formatMoney(
                                Number(
                                  table.remaining_per_person
                                )
                              )
                            }
                          />

                          <TableInfo
                            label="Seuil"
                            value={`${table.confirmation_threshold} pers.`}
                          />

                          <TableInfo
                            label="Capacité"
                            value={`${table.capacity} pers.`}
                          />

                          <TableInfo
                            label="Deadline"
                            value={
                              formatDeadline(
                                table.booking_deadline
                              )
                            }
                          />

                        </div>
                      </div>

                      {/* ========================================= */}
                      {/* FINANCES TABLE */}
                      {/* ========================================= */}

                      <div className="border-b border-zinc-800 bg-black/30 p-6 md:p-8">

                        <div className="grid gap-4 sm:grid-cols-3">

                          <FinanceCard
                            label="Deposits encaissés"
                            value={
                              formatMoney(
                                tableDeposits
                              )
                            }
                          />

                          <FinanceCard
                            label="À payer sur place"
                            value={
                              formatMoney(
                                tableRemainingAmount
                              )
                            }
                          />

                          <FinanceCard
                            label="CA réservé"
                            value={
                              formatMoney(
                                tableRevenue
                              )
                            }
                          />

                        </div>
                      </div>

                      {/* ========================================= */}
                      {/* PARTICIPANTS TABLE */}
                      {/* ========================================= */}

                      <div className="p-6 md:p-8">

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <h4 className="text-xl font-semibold">
                              Participants
                            </h4>

                            <p className="mt-1 text-sm text-zinc-500">
                              {
                                tableConfirmedPeople
                              }{" "}
                              place
                              {tableConfirmedPeople !==
                              1
                                ? "s"
                                : ""}{" "}
                              confirmée
                              {tableConfirmedPeople !==
                              1
                                ? "s"
                                : ""}
                            </p>
                          </div>

                          <p className="text-sm text-zinc-500">
                            {
                              tableReservations.length
                            }{" "}
                            réservation
                            {tableReservations.length !==
                            1
                              ? "s"
                              : ""}
                          </p>
                        </div>

                        {tableReservations.length ===
                        0 ? (
                          <div className="mt-6 rounded-2xl border border-zinc-800 bg-black p-8 text-center">
                            <p className="text-zinc-500">
                              Aucune réservation sur cette table.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800">

                            <div className="overflow-x-auto">

                              <table className="w-full min-w-[1250px] text-left">

                                <thead className="bg-black text-xs uppercase tracking-wider text-zinc-500">
                                  <tr>

                                    <th className="px-5 py-4">
                                      Participant
                                    </th>

                                    <th className="px-5 py-4">
                                      Contact
                                    </th>

                                    <th className="px-5 py-4">
                                      Places
                                    </th>

                                    <th className="px-5 py-4">
                                      Entrées
                                    </th>

                                    <th className="px-5 py-4">
                                      Deposit
                                    </th>

                                    <th className="px-5 py-4">
                                      Sur place
                                    </th>

                                    <th className="px-5 py-4">
                                      Total
                                    </th>

                                    <th className="px-5 py-4">
                                      Statut
                                    </th>

                                    <th className="px-5 py-4">
                                      Pass
                                    </th>

                                  </tr>
                                </thead>

                                <tbody className="divide-y divide-zinc-800">

                                  {tableReservations.map(
                                    (
                                      reservation
                                    ) => {
                                      const checkedIn =
                                        Number(
                                          reservation
                                            .checked_in_quantity ??
                                            0
                                        );

                                      const reservationQuantity =
                                        Math.max(
                                          Number(
                                            reservation.quantity ??
                                              0
                                          ),
                                          1
                                        );

                                      const progress =
                                        Math.min(
                                          100,
                                          Math.round(
                                            (
                                              checkedIn /
                                              reservationQuantity
                                            ) *
                                              100
                                          )
                                          );

                                      const refundStates =
                                        refundStatesByReservation.get(
                                          reservation.id
                                        ) ?? [];
                                      const hasInitialRefundablePayment =
                                        Boolean(
                                          reservation.paid_at &&
                                            reservation.stripe_checkout_session_id
                                        );
                                      const hasSupplementRefundablePayment =
                                        reservation.supplement_status === "paid" &&
                                        Boolean(
                                          reservation.supplement_paid_at &&
                                            (reservation.supplement_stripe_session_id ||
                                              reservation.stripe_supplement_session_id)
                                        );
                                      const hasRefundablePayment =
                                        hasInitialRefundablePayment ||
                                        hasSupplementRefundablePayment;
                                      const refundInProgress =
                                        reservation.status === "refund_pending" ||
                                        refundStates.some(
                                          (state) =>
                                            state.status === "refund_pending" ||
                                            state.status === "refunding"
                                        );
                                      const allRefundsCompleted =
                                        reservation.status === "refunded" ||
                                        (refundStates.length > 0 &&
                                          refundStates.every(
                                            (state) => state.status === "refunded"
                                          ));

                                      return (
                                        <tr
                                          key={
                                            reservation.id
                                          }
                                          className="transition hover:bg-black"
                                        >

                                          {/* Participant */}

                                          <td className="px-5 py-5">
                                            <p className="font-medium">
                                              {
                                                reservation.firstname
                                              }{" "}
                                              {
                                                reservation.lastname
                                              }
                                            </p>

                                            <p className="mt-1 text-xs text-zinc-600">
                                              {
                                                reservation.reservation_code
                                              }
                                            </p>
                                          </td>

                                          {/* Contact */}

                                          <td className="px-5 py-5 text-sm text-zinc-400">
                                            <p>
                                              {
                                                reservation.email
                                              }
                                            </p>

                                            <p className="mt-1">
                                              {
                                                reservation.phone
                                              }
                                            </p>
                                          </td>

                                          {/* Places */}

                                          <td className="px-5 py-5">
                                            <span className="font-medium">
                                              {
                                                reservation.quantity
                                              }
                                            </span>
                                          </td>

                                          {/* Entrées */}

                                          <td className="px-5 py-5">
                                            <div>
                                              <p className="font-medium">
                                                {
                                                  checkedIn
                                                }
                                                {" / "}
                                                {
                                                  reservation.quantity
                                                }
                                              </p>

                                              <div className="mt-2 h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
                                                <div
                                                  className="h-full rounded-full bg-[#111111] transition-all"
                                                  style={{
                                                    width: `${progress}%`,
                                                  }}
                                                />
                                              </div>

                                              {checkedIn >=
                                                Number(
                                                  reservation.quantity
                                                ) &&
                                                isPassAccessible(reservation.status) && (
                                                  <p className="mt-2 text-xs text-green-400">
                                                    Complet
                                                  </p>
                                                )}

                                            </div>
                                          </td>

                                          {/* Deposit */}

                                          <td className="px-5 py-5">
                                            {formatMoney(
                                              Number(
                                                reservation.deposit_paid
                                              )
                                            )}
                                          </td>

                                          {/* Sur place */}

                                          <td className="px-5 py-5">
                                            {formatMoney(
                                              Number(
                                                reservation.remaining_amount
                                              )
                                            )}
                                          </td>

                                          {/* Total */}

                                          <td className="px-5 py-5">
                                            {formatMoney(
                                              Number(
                                                reservation.total_price
                                              )
                                            )}
                                          </td>

                                          {/* Statut */}

                                          <td className="px-5 py-5">
                                              <ReservationStatusBadge
                                              status={
                                                reservation.status
                                              }
                                              />
                                            {allRefundsCompleted ? (
                                              <p className="mt-2 text-xs text-green-400">
                                                Remboursée
                                              </p>
                                            ) : refundInProgress ? (
                                              <p className="mt-2 text-xs text-amber-300">
                                                Remboursement en cours
                                              </p>
                                            ) : hasRefundablePayment ? (
                                              <AdminRefundButton reservationId={reservation.id} />
                                            ) : null}
                                          </td>

                                          {/* Pass */}

                                          <td className="px-5 py-5">
                                            {reservation.status ===
                                            "confirmed" ? (
                                              <Link
                                                href={`/confirmation/${reservation.reservation_code}`}
                                                className="text-sm text-white underline underline-offset-4 transition hover:text-zinc-300"
                                              >
                                                Voir le pass
                                              </Link>
                                            ) : (
                                              <span className="text-sm text-zinc-600">
                                                —
                                              </span>
                                            )}
                                          </td>

                                        </tr>
                                      );
                                    }
                                  )}

                                </tbody>
                              </table>

                            </div>
                          </div>
                        )}

                      </div>

                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>

        {/* ===================================================== */}
        {/* RÉSERVATIONS HORS TABLE */}
        {/* ===================================================== */}

        {reservations.filter(
          (
            reservation
          ) =>
            !tables.some(
              (
                table
              ) =>
                table.id ===
                reservation.vip_offer_id
            )
        ).length > 0 && (
          <section className="mt-10 rounded-3xl border border-red-900/50 bg-red-950/10 p-6">
            <h2 className="font-semibold text-red-400">
              Réservations non rattachées
            </h2>

            <p className="mt-2 text-sm text-red-300/70">
              Certaines réservations ne correspondent à aucune table actuellement configurée.
            </p>
          </section>
        )}

      </div>
    </main>
  );
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      style: "currency",
      currency: "EUR",

      minimumFractionDigits:
        Number.isInteger(
          value
        )
          ? 0
          : 2,

      maximumFractionDigits: 2,
    }
  ).format(value);
}

function formatDeadline(
  value: string | null
) {
  if (!value) {
    return "Aucune";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "fr-FR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/*
|--------------------------------------------------------------------------
| Progress Bar
|--------------------------------------------------------------------------
*/

function ProgressBar({
  percentage,
}: {
  percentage: number;
}) {
  return (
    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full rounded-full bg-[#111111] transition-all"
        style={{
          width: `${Math.min(
            Math.max(
              percentage,
              0
            ),
            100
          )}%`,
        }}
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Stat Card
|--------------------------------------------------------------------------
*/

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

      <p className="mt-3 text-2xl font-bold xl:text-3xl">
        {value}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Big Stat
|--------------------------------------------------------------------------
*/

function BigStat({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold">
        {value}
      </p>

      <p className="mt-2 text-xs text-zinc-600">
        {subtitle}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Mini Stat
|--------------------------------------------------------------------------
*/

function MiniStat({
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
        {value}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Compact Stat
|--------------------------------------------------------------------------
*/

function CompactStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[105px] rounded-2xl border border-zinc-800 bg-black px-4 py-3">
      <p className="text-xs text-zinc-600">
        {label}
      </p>

      <p className="mt-1 font-semibold">
        {value}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Table Info
|--------------------------------------------------------------------------
*/

function TableInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-4">
      <p className="text-xs text-zinc-600">
        {label}
      </p>

      <p className="mt-2 font-medium text-white">
        {value}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Finance Card
|--------------------------------------------------------------------------
*/

function FinanceCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-5">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {value}
      </p>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Reservation Status
|--------------------------------------------------------------------------
*/

function ReservationStatusBadge({
  status,
}: {
  status: string;
}) {
  if (
    status === "confirmed"
  ) {
    return (
      <span className="whitespace-nowrap rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
        Confirmée
      </span>
    );
  }

  if (
    status ===
    "pending_payment"
  ) {
    return (
      <span className="whitespace-nowrap rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
        Paiement en attente
      </span>
    );
  }

  if (
    status ===
    "payment_expired"
  ) {
    return (
      <span className="whitespace-nowrap rounded-full border border-red-900 bg-red-950/20 px-3 py-1 text-xs font-medium text-red-400">
        Expirée
      </span>
    );
  }

  if (
    status ===
    "admin_review"
  ) {
    return (
      <span className="rounded-full border border-orange-900 bg-orange-950/20 px-3 py-1 text-xs font-medium text-orange-400">
        Décision requise
      </span>
    );
  }

  if (
    status === "cancelled"
  ) {
    return (
      <span className="whitespace-nowrap rounded-full border border-red-900 bg-red-950/20 px-3 py-1 text-xs font-medium text-red-400">
        Annulée
      </span>
    );
  }

  if (
    status === "refunded"
  ) {
    return (
      <span className="whitespace-nowrap rounded-full border border-blue-900 bg-blue-950/20 px-3 py-1 text-xs font-medium text-blue-400">
        Remboursée
      </span>
    );
  }

  return (
    <span className="whitespace-nowrap rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
      {status}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| Table Status
|--------------------------------------------------------------------------
*/

function TableStatusBadge({
  status,
}: {
  status: string;
}) {
  if (
    status === "forming"
  ) {
    return (
      <span className="rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
        En formation
      </span>
    );
  }

  if (
    status ===
    "confirmed"
  ) {
    return (
      <span className="rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
        Confirmée
      </span>
    );
  }

  if (
    status === "full"
  ) {
    return (
      <span className="rounded-full border border-white/20 bg-[#111111]/10 px-3 py-1 text-xs font-medium text-white">
        Complète
      </span>
    );
  }

  if (
    status === "cancelled"
  ) {
    return (
      <span className="rounded-full border border-red-900 bg-red-950/20 px-3 py-1 text-xs font-medium text-red-400">
        Annulée
      </span>
    );
  }

  return (
    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
      {status}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| Event Status
|--------------------------------------------------------------------------
*/

function EventStatusBadge({
  status,
}: {
  status: string;
}) {
  if (
    status ===
    "published"
  ) {
    return (
      <span className="inline-flex rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
        Publiée
      </span>
    );
  }

  if (
    status === "draft"
  ) {
    return (
      <span className="inline-flex rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
        Brouillon
      </span>
    );
  }

  if (
    status ===
    "cancelled"
  ) {
    return (
      <span className="inline-flex rounded-full border border-red-900 bg-red-950/20 px-3 py-1 text-xs font-medium text-red-400">
        Annulée
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
      {status}
    </span>
  );
}
