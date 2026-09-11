
import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";
import UndoCheckInButton from "@/components/UndoCheckInButton";
import EventStatusActions from "@/components/EventStatusActions";
/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

type Reservation = {
  id: string;

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
  created_at: string;
};

type EventData = {
  id: string;
  slug: string;
  name: string;

  event_date: string;
  start_time: string;

  music: string | null;
  status: string;

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
    | {
        id: string;

        capacity: number;

        confirmation_threshold: number;

        price_per_person: number;
        deposit_per_person: number;
        remaining_per_person: number;

        spots_reserved: number;

        status: string;
      }[]
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
  const { id } = await params;

  /*
  |--------------------------------------------------------------------------
  | Vérification utilisateur
  |--------------------------------------------------------------------------
  */

  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
  |--------------------------------------------------------------------------
  | Vérification admin
  |--------------------------------------------------------------------------
  */

  const {
    data: profile,
    error: profileError,
  } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Erreur récupération profil admin :",
      profileError
    );
  }

  if (!profile?.is_admin) {
    redirect("/events");
  }

  /*
  |--------------------------------------------------------------------------
  | Récupération soirée
  |--------------------------------------------------------------------------
  */

  const {
    data: eventData,
    error: eventError,
  } = await supabaseAdmin
    .from("events")
    .select(`
      id,
      slug,
      name,
      event_date,
      start_time,
      music,
      status,

      clubs (
        name,
        city,
        address
      ),

      vip_offers (
        id,
        capacity,
        confirmation_threshold,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        spots_reserved,
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
    Array.isArray(event.clubs)
      ? event.clubs[0]
      : event.clubs;

  /*
  |--------------------------------------------------------------------------
  | Offre VIP
  |--------------------------------------------------------------------------
  */

  const offer =
    event.vip_offers?.[0];

  if (!offer) {
    notFound();
  }

  /*
  |--------------------------------------------------------------------------
  | Réservations
  |--------------------------------------------------------------------------
  */

  const {
    data: reservationsData,
    error: reservationsError,
  } = await supabaseAdmin
    .from("reservations")
    .select(`
      id,
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
      created_at
    `)
    .eq("event_id", id)
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (reservationsError) {
    console.error(
      "Erreur récupération participants :",
      reservationsError
    );
  }

  const reservations =
    (reservationsData ??
      []) as Reservation[];

  /*
  |--------------------------------------------------------------------------
  | Réservations confirmées
  |--------------------------------------------------------------------------
  */

  const confirmedReservations =
    reservations.filter(
      (reservation) =>
        reservation.status ===
        "confirmed"
    );

  /*
  |--------------------------------------------------------------------------
  | Statistiques
  |--------------------------------------------------------------------------
  */

  const confirmedPeople =
    confirmedReservations.reduce(
      (
        total,
        reservation
      ) =>
        total +
        Number(
          reservation.quantity
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
            .deposit_paid
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
            .total_price
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
            .remaining_amount
        ),
      0
    );

  /*
  |--------------------------------------------------------------------------
  | Capacité
  |--------------------------------------------------------------------------
  */

  const capacity =
    Number(
      offer.capacity ?? 0
    );

  const reserved =
    Number(
      offer.spots_reserved ??
        0
    );

  const remainingSpots =
    Math.max(
      0,
      capacity - reserved
    );

  /*
  |--------------------------------------------------------------------------
  | Taux de remplissage
  |--------------------------------------------------------------------------
  */

  const fillRate =
    capacity > 0
      ? Math.round(
          (reserved /
            capacity) *
            100
        )
      : 0;

  /*
  |--------------------------------------------------------------------------
  | Taux de présence
  |--------------------------------------------------------------------------
  */

  const checkInRate =
    confirmedPeople > 0
      ? Math.round(
          (totalCheckedIn /
            confirmedPeople) *
            100
        )
      : 0;

  /*
  |--------------------------------------------------------------------------
  | Date
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

        {/* Header soirée */}

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              {club?.name ??
                "Club"}

              {club?.city
                ? ` · ${club.city}`
                : ""}
            </p>

            <h1 className="mt-3 text-4xl font-bold">
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
                eventId={event.id}
                currentStatus={event.status}
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
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Modifier
            </Link>
          </div>
        </div>

        {/* Statistiques */}

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">

          <StatCard
            label="Places réservées"
            value={`${reserved}/${capacity}`}
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
            value={`${fillRate}%`}
          />

          <StatCard
            label="Acomptes encaissés"
            value={`${totalDeposits.toFixed(
              2
            )} €`}
          />

          <StatCard
            label="CA potentiel"
            value={`${totalRevenue.toFixed(
              2
            )} €`}
          />

        </section>

        {/* Remplissage VIP */}

        <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

            <div>
              <h2 className="text-xl font-semibold">
                Remplissage VIP
              </h2>

              <p className="mt-2 text-sm text-zinc-500">
                {reserved} place
                {reserved !== 1
                  ? "s"
                  : ""}{" "}
                réservée
                {reserved !== 1
                  ? "s"
                  : ""}{" "}
                sur {capacity}
              </p>
            </div>

            <p className="text-3xl font-bold">
              {fillRate}%
            </p>
          </div>

          {/* Barre remplissage */}

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{
                width: `${Math.min(
                  fillRate,
                  100
                )}%`,
              }}
            />
          </div>

          {/* Infos offre */}

          <div className="mt-6 grid gap-4 text-sm text-zinc-400 sm:grid-cols-2 lg:grid-cols-4">

            <div>
              <p className="text-zinc-600">
                Prix / personne
              </p>

              <p className="mt-1 text-white">
                {Number(
                  offer.price_per_person
                ).toFixed(2)}
                €
              </p>
            </div>

            <div>
              <p className="text-zinc-600">
                Acompte
              </p>

              <p className="mt-1 text-white">
                {Number(
                  offer.deposit_per_person
                ).toFixed(2)}
                €
              </p>
            </div>

            <div>
              <p className="text-zinc-600">
                Sur place
              </p>

              <p className="mt-1 text-white">
                {Number(
                  offer.remaining_per_person
                ).toFixed(2)}
                €
              </p>
            </div>

            <div>
              <p className="text-zinc-600">
                Seuil de confirmation
              </p>

              <p className="mt-1 text-white">
                {
                  offer.confirmation_threshold
                }{" "}
                personnes
              </p>
            </div>

          </div>
        </section>

        {/* Entrées club */}

        <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8">

          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h2 className="text-xl font-semibold">
                Entrées dans le club
              </h2>

              <p className="mt-2 text-sm text-zinc-500">
                {totalCheckedIn} personne
                {totalCheckedIn !==
                1
                  ? "s"
                  : ""}{" "}
                entrée
                {totalCheckedIn !==
                1
                  ? "s"
                  : ""}{" "}
                sur{" "}
                {confirmedPeople}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-3xl font-bold">
                {checkInRate}%
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                taux de présence
              </p>
            </div>

          </div>

          {/* Progression entrées */}

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{
                width: `${Math.min(
                  checkInRate,
                  100
                )}%`,
              }}
            />
          </div>

          {/* Résumé */}

          <div className="mt-6 grid gap-4 sm:grid-cols-3">

            <MiniStat
              label="Attendues"
              value={
                confirmedPeople
              }
            />

            <MiniStat
              label="Entrées"
              value={
                totalCheckedIn
              }
            />

            <MiniStat
              label="Pas encore arrivées"
              value={Math.max(
                0,
                confirmedPeople -
                  totalCheckedIn
              )}
            />

          </div>

        </section>

        {/* Participants */}

        <section className="mt-12">

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

            <div>
              <h2 className="text-2xl font-semibold">
                Participants
              </h2>

              <p className="mt-2 text-sm text-zinc-500">
                {confirmedPeople} place
                {confirmedPeople !==
                1
                  ? "s"
                  : ""}{" "}
                confirmée
                {confirmedPeople !==
                1
                  ? "s"
                  : ""}
              </p>
            </div>

            <div className="text-sm text-zinc-500">
              Reste à encaisser sur place :{" "}

              <span className="font-medium text-white">
                {totalRemaining.toFixed(
                  2
                )}
                €
              </span>
            </div>

          </div>

          {/* Aucun participant */}

          {reservations.length ===
          0 ? (
            <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">

              <p className="text-zinc-400">
                Aucun participant pour le moment.
              </p>

            </div>
          ) : (

            /* Tableau */

            <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-800">

              <div className="overflow-x-auto">

                <table className="w-full min-w-[1150px] text-left">

                  <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-zinc-500">

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
                        Acompte
                      </th>

                      <th className="px-5 py-4">
                        Sur place
                      </th>

                      <th className="px-5 py-4">
                        Statut
                      </th>

                      <th className="px-5 py-4">
                        Pass
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-zinc-800 bg-black">

                    {reservations.map(
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
                              reservation.quantity
                            ),
                            1
                          );

                        const progress =
                          Math.min(
                            100,
                            Math.round(
                              (checkedIn /
                                reservationQuantity) *
                                100
                            )
                          );

                        return (
                          <tr
                            key={
                              reservation.id
                            }
                            className="transition hover:bg-zinc-950"
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

                            {/* Entrées */}

<td className="px-5 py-5">
  <div>
    <p className="font-medium">
      {checkedIn}
      {" / "}
      {reservation.quantity}
    </p>

    <div className="mt-2 h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full rounded-full bg-white transition-all"
        style={{
          width: `${progress}%`,
        }}
      />
    </div>

    {checkedIn >= reservation.quantity &&
      reservation.status === "confirmed" && (
        <p className="mt-2 text-xs text-green-400">
          Complet
        </p>
      )}

    {/* Bouton pour corriger un scan */}

    {checkedIn > 0 && (
      <div className="mt-3">
        <UndoCheckInButton
          reservationCode={
            reservation.reservation_code
          }
          checkedInQuantity={
            checkedIn
          }
        />
      </div>
    )}
  </div>
</td>

                            {/* Acompte */}

                            <td className="px-5 py-5">

                              {Number(
                                reservation.deposit_paid
                              ).toFixed(
                                2
                              )}
                              €

                            </td>

                            {/* Sur place */}

                            <td className="px-5 py-5">

                              {Number(
                                reservation.remaining_amount
                              ).toFixed(
                                2
                              )}
                              €

                            </td>

                            {/* Statut */}

                            <td className="px-5 py-5">

                              <StatusBadge
                                status={
                                  reservation.status
                                }
                              />

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

        </section>

      </div>
    </main>
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

      <p className="mt-3 text-3xl font-bold">
        {value}
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
| Reservation Status
|--------------------------------------------------------------------------
*/

function StatusBadge({
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
    status === "cancelled"
  ) {
    return (
      <span className="whitespace-nowrap rounded-full border border-red-900 bg-red-950/20 px-3 py-1 text-xs font-medium text-red-400">
        Annulée
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
| Event Status
|--------------------------------------------------------------------------
*/

function EventStatusBadge({
  status,
}: {
  status: string;
}) {
  if (status === "published") {
    return (
      <span className="inline-flex rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
        Publiée
      </span>
    );
  }

  if (status === "draft") {
    return (
      <span className="inline-flex rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
        Brouillon
      </span>
    );
  }

  if (status === "cancelled") {
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