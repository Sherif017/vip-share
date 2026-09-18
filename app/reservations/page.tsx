import Link from "next/link";
import { isPassAccessible } from "@/lib/vip-status";
import { redirect } from "next/navigation";

import MergeDecisionActions from "@/components/MergeDecisionActions";
import SupplementDecisionActions from "@/components/SupplementDecisionActions";
import { createClient } from "@/lib/supabase/server";

type MergeChoice =
  | "accept"
  | "refuse"
  | null;

type DecisionChoice =
  | "maintain"
  | "refund"
  | null;

type VipOffer = {
  id: string;
  table_number: string | null;
  status: string;

  price_per_person: number;
  decision_price_per_person: number | null;
  supplement_per_person: number | null;
  decision_expires_at: string | null;

  merge_status: string | null;
  merge_target_offer_id: string | null;
  merge_expires_at: string | null;

};

type MergeTarget = {
  id: string;
  table_number: string | null;
};

type Reservation = {
  id: string;
  reservation_code: string;
  quantity: number;
  total_price: number;
  deposit_paid: number;
  remaining_amount: number;
  status: string;
  created_at: string;

  merge_choice: MergeChoice;
  merge_choice_at: string | null;

  decision_choice: DecisionChoice;
  decision_choice_at: string | null;
  supplement_amount: number | null;
  supplement_status: string | null;

  vip_offers:
    | VipOffer
    | VipOffer[]
    | null;

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

  const {
    data,
    error,
  } = await supabase
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

      merge_choice,
      merge_choice_at,

      decision_choice,
      decision_choice_at,
      supplement_amount,
      supplement_status,

      vip_offers (
        id,
        table_number,
        status,

        price_per_person,
        decision_price_per_person,
        supplement_per_person,
        decision_expires_at,

        merge_status,
        merge_target_offer_id,
        merge_expires_at
      ),

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
    .eq(
      "user_id",
      user.id
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (error) {
    console.error(
      "Erreur récupération réservations :",
      error
    );
  }

  const reservations =
    (data ?? []) as unknown as Reservation[];

  const mergeTargetIds = Array.from(
    new Set(
      reservations
        .flatMap((reservation) => {
          const offer = Array.isArray(reservation.vip_offers)
            ? reservation.vip_offers[0]
            : reservation.vip_offers;

          return offer?.merge_target_offer_id
            ? [offer.merge_target_offer_id]
            : [];
        })
    )
  );

  const mergeTargetsById = new Map<string, MergeTarget>();

  if (mergeTargetIds.length > 0) {
    const { data: mergeTargets, error: mergeTargetsError } =
      await supabase
        .from("vip_offers")
        .select("id, table_number")
        .in("id", mergeTargetIds);

    if (mergeTargetsError) {
      console.error(
        "Erreur récupération tables de fusion :",
        mergeTargetsError
      );
    } else {
      for (const target of mergeTargets ?? []) {
        mergeTargetsById.set(
          target.id,
          target as MergeTarget
        );
      }
    }
  }

  return (
    <main className="kre-customer min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
              K-RÉ
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              Mes réservations
            </h1>

            <p className="mt-3 text-zinc-400">
              Retrouve toutes tes expériences VIP,
              tes pass et les éventuelles décisions
              à prendre.
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
                            className="kre-primary-cta mt-7 inline-block rounded-full px-6 py-3 font-semibold transition"
            >
              Découvrir les soirées
            </Link>
          </div>
        ) : (
          <div className="mt-12 grid gap-6">
            {reservations.map(
              (
                reservation
              ) => {
                const event =
                  Array.isArray(
                    reservation.events
                  )
                    ? reservation
                        .events[0]
                    : reservation.events;

                const club =
                  Array.isArray(
                    event?.clubs
                  )
                    ? event?.clubs[0]
                    : event?.clubs;

                const offer =
                  Array.isArray(
                    reservation.vip_offers
                  )
                    ? reservation
                        .vip_offers[0]
                    : reservation.vip_offers;


                const mergeTarget =
                  offer?.merge_target_offer_id
                    ? mergeTargetsById.get(
                        offer.merge_target_offer_id
                      ) ?? null
                    : null;

                const hasPendingMerge =
                  reservation.status === "confirmed" &&
                  offer?.status === "merge_pending" &&
                  offer?.merge_status === "pending" &&
                  !!offer.merge_target_offer_id &&
                  !!mergeTarget;

                const date =
                  event?.event_date
                    ? new Date(
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
                      )
                    : "";

                const hasSupplementDecision =
                  offer?.status ===
                    "decision_pending" ||
                  offer?.status ===
                    "supplement_payment_pending" ||
                  offer?.status ===
                    "refund_pending";

                return (
                  <article
                    key={
                      reservation.id
                    }
                    className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 md:p-8"
                  >
                    <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-zinc-500">
                            {club?.name ??
                              "Club"}
                            {club?.city
                              ? ` · ${club.city}`
                              : ""}
                          </p>

                          <StatusBadge
                            status={
                              reservation.status
                            }
                          />

                          {offer
                            ?.table_number && (
                            <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                              K-RÉ
                              {
                                offer.table_number
                              }
                            </span>
                          )}

                          {(hasPendingMerge ||
                            offer?.status === "decision_pending") && (
                            <span className="rounded-full border border-orange-900 bg-orange-950/20 px-3 py-1 text-xs font-medium text-orange-400">
                              Décision requise
                            </span>
                          )}
                        </div>

                        <h2 className="mt-3 text-2xl font-semibold">
                          {event?.name ??
                            "Soirée VIP"}
                        </h2>

                        <p className="mt-2 text-zinc-400 capitalize">
                          {date}

                          {event
                            ?.start_time
                            ? ` · ${event.start_time.slice(
                                0,
                                5
                              )}`
                            : ""}
                        </p>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <InfoBadge>
                            {
                              reservation.quantity
                            }{" "}
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
                            ).toFixed(
                              2
                            )}
                            €
                          </InfoBadge>

                          <InfoBadge>
                            Deposit payé :{" "}
                            {Number(
                              reservation.deposit_paid
                            ).toFixed(
                              2
                            )}
                            €
                          </InfoBadge>

                          <InfoBadge>
                            Sur place :{" "}
                            {Number(
                              reservation.remaining_amount
                            ).toFixed(
                              2
                            )}
                            €
                          </InfoBadge>
                        </div>

                        <p className="mt-5 text-xs text-zinc-600">
                          Réservation{" "}
                          {
                            reservation.reservation_code
                          }
                        </p>


                        {hasPendingMerge &&
                          offer &&
                          mergeTarget && (
                            <MergeDecisionActions
                              reservationId={
                                reservation.id
                              }
                              sourceTableNumber={String(
                                offer.table_number ?? "—"
                              )}
                              targetTableNumber={String(
                                mergeTarget.table_number ?? "—"
                              )}
                              expiresAt={
                                offer.merge_expires_at
                              }
                              currentChoice={
                                reservation.merge_choice
                              }
                            />
                          )}

                        {hasSupplementDecision &&
                          offer &&
                          offer.decision_price_per_person !== null &&
                          offer.supplement_per_person !== null && (
                            <SupplementDecisionActions
                              reservationId={
                                reservation.id
                              }
                              quantity={
                                Number(
                                  reservation.quantity
                                )
                              }
                              originalPricePerPerson={
                                Number(
                                  offer.price_per_person
                                )
                              }
                              newPricePerPerson={
                                Number(
                                  offer.decision_price_per_person
                                )
                              }
                              supplementPerPerson={
                                Number(
                                  offer.supplement_per_person
                                )
                              }
                              supplementAmount={
                                Number(
                                  reservation.supplement_amount ??
                                    0
                                )
                              }
                              expiresAt={
                                offer.decision_expires_at
                              }
                              currentChoice={
                                reservation.decision_choice
                              }
                              offerStatus={
                                offer.status
                              }
                              supplementStatus={
                                reservation.supplement_status
                              }
                            />
                          )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-3">
                        {isPassAccessible(reservation.status) && (
                          <Link
                            href={`/confirmation/${reservation.reservation_code}`}
                            className="kre-primary-cta rounded-full px-6 py-3 text-center text-sm font-semibold transition"
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
              }
            )}
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
  if (
    status === "confirmed"
  ) {
    return (
      <span className="rounded-full border border-green-900 bg-green-950/20 px-3 py-1 text-xs font-medium text-green-400">
        Confirmée
      </span>
    );
  }

  if (
    status === "checked_in"
  ) {
    return (
      <span className="rounded-full border border-blue-900 bg-blue-950/20 px-3 py-1 text-xs font-medium text-blue-400">
        Entrée validée
      </span>
    );
  }

  if (
    status ===
    "pending_payment"
  ) {
    return (
      <span className="rounded-full border border-yellow-900 bg-yellow-950/20 px-3 py-1 text-xs font-medium text-yellow-400">
        Paiement en attente
      </span>
    );
  }

  if (
    status ===
    "payment_expired"
  ) {
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
