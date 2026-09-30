import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type ClubRow = {
  id: string;
  name: string;
  city: string;
  commission_bps: number | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_onboarding_status:
    | "not_started"
    | "pending"
    | "complete";
};

type EventRow = {
  id: string;
  club_id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string | null;
  status: string;

  clubs:
    | {
        id: string;
        name: string;
        city: string;
      }
    | {
        id: string;
        name: string;
        city: string;
      }[]
    | null;
};

type TransactionRow = {
  id: string;
  event_id: string;
  club_id: string;
  payment_type: string;
  status: string;
  transfer_status: string;

  vip_subtotal_cents: number;
  service_fee_cents: number;
  commission_cents: number;
  club_net_cents: number;
  total_customer_cents: number;
};

type SettlementRow = {
  event_id: string;
  status:
    | "pending_review"
    | "approved"
    | "held"
    | "settled";

  hold_reason: string | null;
  approved_at: string | null;
  settled_at: string | null;
};

type RefundRow = {
  id: string;
  reservation_id: string;
  status: string;
};

type OfferRow = {
  id: string;
  event_id: string;
  status: string;
  capacity: number;
  spots_reserved: number;
};

type MembershipRow = {
  club_id: string;
  status: string;
};

function cents(value: number) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      style: "currency",
      currency: "EUR",
    }
  ).format(value / 100);
}

function parisToday() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(new Date());
}

function formatDate(value: string) {
  return new Date(
    `${value}T12:00:00`
  ).toLocaleDateString(
    "fr-FR",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function relationOne<T>(
  value: T | T[] | null
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export default async function ManagerPage() {
  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.isManager) {
    redirect("/admin");
  }

  const [
    clubsResult,
    eventsResult,
    transactionsResult,
    settlementsResult,
    refundsResult,
    offersResult,
    membershipsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("clubs")
      .select(`
        id,
        name,
        city,
        commission_bps,
        stripe_account_id,
        stripe_charges_enabled,
        stripe_payouts_enabled,
        stripe_onboarding_status
      `)
      .order(
        "name",
        {
          ascending: true,
        }
      ),

    supabaseAdmin
      .from("events")
      .select(`
        id,
        club_id,
        slug,
        name,
        event_date,
        start_time,
        status,
        clubs (
          id,
          name,
          city
        )
      `)
      .order(
        "event_date",
        {
          ascending: false,
        }
      ),

    supabaseAdmin
      .from("payment_transactions")
      .select(`
        id,
        event_id,
        club_id,
        payment_type,
        status,
        transfer_status,
        vip_subtotal_cents,
        service_fee_cents,
        commission_cents,
        club_net_cents,
        total_customer_cents
      `),

    supabaseAdmin
      .from("event_settlements")
      .select(`
        event_id,
        status,
        hold_reason,
        approved_at,
        settled_at
      `),

    supabaseAdmin
      .from("vip_refunds")
      .select(`
        id,
        reservation_id,
        status
      `),

    supabaseAdmin
      .from("vip_offers")
      .select(`
        id,
        event_id,
        status,
        capacity,
        spots_reserved
      `),

    supabaseAdmin
      .from("club_memberships")
      .select(`
        club_id,
        status
      `)
      .eq(
        "role",
        "admin"
      ),
  ]);

  const clubs =
    (clubsResult.data ??
      []) as ClubRow[];

  const events =
    (eventsResult.data ??
      []) as unknown as EventRow[];

  const transactions =
    (transactionsResult.data ??
      []) as TransactionRow[];

  const settlements =
    (settlementsResult.data ??
      []) as SettlementRow[];

  const refunds =
    (refundsResult.data ??
      []) as RefundRow[];

  const offers =
    (offersResult.data ??
      []) as OfferRow[];

  const memberships =
    (membershipsResult.data ??
      []) as MembershipRow[];

  const settlementByEvent =
    new Map(
      settlements.map(
        (settlement) => [
          settlement.event_id,
          settlement,
        ]
      )
    );

  const activeAdminCountByClub =
    new Map<string, number>();

  for (
    const membership
    of memberships
  ) {
    if (
      membership.status !==
      "active"
    ) {
      continue;
    }

    activeAdminCountByClub.set(
      membership.club_id,
      (
        activeAdminCountByClub.get(
          membership.club_id
        ) ?? 0
      ) + 1
    );
  }

  const confirmedTransactions =
    transactions.filter(
      (transaction) =>
        transaction.status ===
        "confirmed"
    );

  const totalCustomerCents =
    confirmedTransactions.reduce(
      (sum, transaction) =>
        sum +
        Number(
          transaction.total_customer_cents ??
            0
        ),
      0
    );

  const vipVolumeCents =
    confirmedTransactions.reduce(
      (sum, transaction) =>
        sum +
        Number(
          transaction.vip_subtotal_cents ??
            0
        ),
      0
    );

  const serviceFeesCents =
    confirmedTransactions.reduce(
      (sum, transaction) =>
        sum +
        Number(
          transaction.service_fee_cents ??
            0
        ),
      0
    );

  const commissionsCents =
    confirmedTransactions.reduce(
      (sum, transaction) =>
        sum +
        Number(
          transaction.commission_cents ??
            0
        ),
      0
    );

  const clubNetCents =
    confirmedTransactions.reduce(
      (sum, transaction) =>
        sum +
        Number(
          transaction.club_net_cents ??
            0
        ),
      0
    );

  const transferredCents =
    confirmedTransactions
      .filter(
        (transaction) =>
          transaction.transfer_status ===
          "transferred"
      )
      .reduce(
        (sum, transaction) =>
          sum +
          Number(
            transaction.club_net_cents ??
              0
          ),
        0
      );

  const awaitingTransferCents =
    confirmedTransactions
      .filter(
        (transaction) =>
          ![
            "transferred",
            "reversed",
          ].includes(
            transaction.transfer_status
          )
      )
      .reduce(
        (sum, transaction) =>
          sum +
          Number(
            transaction.club_net_cents ??
              0
          ),
        0
      );

  const kreRevenueCents =
    serviceFeesCents +
    commissionsCents;

  const pendingRefunds =
    refunds.filter(
      (refund) =>
        refund.status ===
          "refund_pending" ||
        refund.status ===
          "refunding"
    ).length;

  const stripeReadyClubs =
    clubs.filter(
      (club) =>
        Boolean(
          club.stripe_account_id
        ) &&
        club.stripe_charges_enabled &&
        club.commission_bps !== null
    ).length;

  const today =
    parisToday();

  const actionEvents =
    events.filter(
      (event) => {
        const settlement =
          settlementByEvent.get(
            event.id
          );

        const eventOffers =
          offers.filter(
            (offer) =>
              offer.event_id ===
              event.id
          );

        const hasReview =
          eventOffers.some(
            (offer) =>
              offer.status ===
              "admin_review"
          );

        const hasMoney =
          confirmedTransactions.some(
            (transaction) =>
              transaction.event_id ===
              event.id
          );

        const past =
          event.event_date <
          today;

        return (
          hasReview ||
          settlement?.status ===
            "held" ||
          settlement?.status ===
            "approved" ||
          (
            past &&
            hasMoney &&
            settlement?.status !==
              "settled"
          )
        );
      }
    );

  return (
    <main className="min-h-screen bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#858585]">
              K-RÉ · Administration plateforme
            </p>

            <h1 className="mt-3 text-4xl font-bold text-[#F7F4EE] md:text-5xl">
              Cockpit
            </h1>

            <p className="mt-3 max-w-2xl text-[#A7A7A7]">
              Vue consolidée des ventes,
              commissions, règlements clubs
              et opérations nécessitant une
              validation K-RÉ.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-[#F7F4EE] transition hover:border-white/30"
            >
              Exploitation des soirées
            </Link>

            <Link
              href="/admin/events/new"
              className="rounded-full bg-[#D8B56A] px-5 py-3 text-sm font-semibold text-black transition hover:bg-[#e4c67f]"
            >
              + Nouvelle soirée
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Total encaissé clients"
            value={cents(
              totalCustomerCents
            )}
            subtitle="VIP + frais de service"
          />

          <Metric
            label="Volume VIP"
            value={cents(
              vipVolumeCents
            )}
            subtitle="Hors frais K-RÉ"
          />

          <Metric
            label="Revenus K-RÉ"
            value={cents(
              kreRevenueCents
            )}
            subtitle={`${cents(
              commissionsCents
            )} commissions · ${cents(
              serviceFeesCents
            )} frais`}
            important
          />

          <Metric
            label="Net clubs"
            value={cents(
              clubNetCents
            )}
            subtitle="Après commission K-RÉ"
          />

          <Metric
            label="À transférer"
            value={cents(
              awaitingTransferCents
            )}
            subtitle="Transactions confirmées"
            important={
              awaitingTransferCents >
              0
            }
          />

          <Metric
            label="Déjà transféré"
            value={cents(
              transferredCents
            )}
            subtitle="Vers comptes Stripe Connect"
          />

          <Metric
            label="Clubs prêts"
            value={`${stripeReadyClubs}/${clubs.length}`}
            subtitle="Stripe + commission configurés"
          />

          <Metric
            label="Remboursements"
            value={pendingRefunds.toString()}
            subtitle="En attente ou en cours"
            important={
              pendingRefunds > 0
            }
          />
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-5">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-[#858585]">
                File opérationnelle
              </p>

              <h2 className="mt-2 text-2xl font-bold text-[#F7F4EE]">
                Actions requises
              </h2>
            </div>

            <span className="rounded-full bg-white/[0.07] px-3 py-1 text-sm text-[#C0BBB1]">
              {actionEvents.length}
            </span>
          </div>

          {actionEvents.length ===
          0 ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-[#111111] p-7">
              <p className="font-medium text-[#F7F4EE]">
                Rien à traiter.
              </p>

              <p className="mt-1 text-sm text-[#858585]">
                Les décisions VIP,
                règlements et transferts
                apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {actionEvents
                .slice(0, 12)
                .map(
                  (event) => (
                    <EventRowCard
                      key={
                        event.id
                      }
                      event={
                        event
                      }
                      transactions={
                        confirmedTransactions.filter(
                          (
                            transaction
                          ) =>
                            transaction.event_id ===
                            event.id
                        )
                      }
                      offers={
                        offers.filter(
                          (offer) =>
                            offer.event_id ===
                            event.id
                        )
                      }
                      settlement={
                        settlementByEvent.get(
                          event.id
                        ) ?? null
                      }
                    />
                  )
                )}
            </div>
          )}
        </section>

        <section className="mt-14">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-[#858585]">
              Réseau K-RÉ
            </p>

            <h2 className="mt-2 text-2xl font-bold text-[#F7F4EE]">
              Clubs
            </h2>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {clubs.map(
              (club) => {
                const ready =
                  Boolean(
                    club.stripe_account_id
                  ) &&
                  club.stripe_charges_enabled &&
                  club.commission_bps !==
                    null;

                const admins =
                  activeAdminCountByClub.get(
                    club.id
                  ) ?? 0;

                return (
                  <Link
                    key={
                      club.id
                    }
                    href={`/manager/clubs/${club.id}`}
                    className="group rounded-2xl border border-white/10 bg-[#111111] p-6 transition hover:-translate-y-0.5 hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-[#F7F4EE]">
                          {
                            club.name
                          }
                        </h3>

                        <p className="mt-1 text-sm text-[#858585]">
                          {
                            club.city
                          }
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          ready
                            ? "bg-emerald-950/40 text-emerald-300"
                            : "bg-amber-950/40 text-amber-300"
                        }`}
                      >
                        {ready
                          ? "Paiements actifs"
                          : "Configuration requise"}
                      </span>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <SmallMetric
                        label="Commission"
                        value={
                          club.commission_bps ===
                          null
                            ? "—"
                            : `${(
                                club.commission_bps /
                                100
                              ).toFixed(
                                2
                              )}%`
                        }
                      />

                      <SmallMetric
                        label="Admins"
                        value={admins.toString()}
                      />
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4 text-sm">
                      <span className="text-[#C0BBB1]">
                        Gérer le club
                      </span>

                      <span className="transition group-hover:translate-x-1">
                        →
                      </span>
                    </div>
                  </Link>
                );
              }
            )}
          </div>
        </section>

        <section className="mt-14">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-[#858585]">
              Historique
            </p>

            <h2 className="mt-2 text-2xl font-bold text-[#F7F4EE]">
              Soirées
            </h2>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#111111]">
            {events.length === 0 ? (
              <p className="p-7 text-[#858585]">
                Aucune soirée.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {events
                  .slice(0, 30)
                  .map(
                    (event) => {
                      const club =
                        relationOne(
                          event.clubs
                        );

                      const txs =
                        confirmedTransactions.filter(
                          (
                            transaction
                          ) =>
                            transaction.event_id ===
                            event.id
                        );

                      const vip =
                        txs.reduce(
                          (
                            sum,
                            transaction
                          ) =>
                            sum +
                            transaction.vip_subtotal_cents,
                          0
                        );

                      const settlement =
                        settlementByEvent.get(
                          event.id
                        );

                      return (
                        <Link
                          key={
                            event.id
                          }
                          href={`/manager/events/${event.id}`}
                          className="grid gap-4 p-5 transition hover:bg-white/[0.03] md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"
                        >
                          <div>
                            <p className="font-semibold text-[#F7F4EE]">
                              {
                                event.name
                              }
                            </p>

                            <p className="mt-1 text-sm text-[#858585]">
                              {club?.name ??
                                "Club"}{" "}
                              ·{" "}
                              {formatDate(
                                event.event_date
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-wide text-[#666]">
                              Volume VIP
                            </p>

                            <p className="mt-1 font-semibold">
                              {cents(
                                vip
                              )}
                            </p>
                          </div>

                          <SettlementBadge
                            status={
                              settlement?.status ??
                              null
                            }
                          />

                          <span className="text-[#858585]">
                            →
                          </span>
                        </Link>
                      );
                    }
                  )}
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  subtitle,
  important = false,
}: {
  label: string;
  value: string;
  subtitle: string;
  important?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        important
          ? "border-[#D8B56A]/30 bg-[#D8B56A]/[0.06]"
          : "border-white/10 bg-[#111111]"
      }`}
    >
      <p className="text-sm text-[#858585]">
        {label}
      </p>

      <p className="mt-3 text-2xl font-bold text-[#F7F4EE]">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-[#666]">
        {subtitle}
      </p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-black/40 p-3">
      <p className="text-xs text-[#666]">
        {label}
      </p>

      <p className="mt-1 font-semibold text-[#F7F4EE]">
        {value}
      </p>
    </div>
  );
}

function SettlementBadge({
  status,
}: {
  status:
    | SettlementRow["status"]
    | null;
}) {
  const map = {
    pending_review: {
      label: "À valider",
      classes:
        "bg-amber-950/40 text-amber-300",
    },

    approved: {
      label: "Validé · transfert requis",
      classes:
        "bg-blue-950/40 text-blue-300",
    },

    held: {
      label: "En attente",
      classes:
        "bg-orange-950/40 text-orange-300",
    },

    settled: {
      label: "Réglé",
      classes:
        "bg-emerald-950/40 text-emerald-300",
    },
  } as const;

  if (!status) {
    return (
      <span className="w-fit rounded-full bg-white/[0.06] px-3 py-1 text-xs text-[#858585]">
        Non traité
      </span>
    );
  }

  const item =
    map[status];

  return (
    <span
      className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${item.classes}`}
    >
      {item.label}
    </span>
  );
}

function EventRowCard({
  event,
  transactions,
  offers,
  settlement,
}: {
  event: EventRow;
  transactions: TransactionRow[];
  offers: OfferRow[];
  settlement:
    | SettlementRow
    | null;
}) {
  const club =
    relationOne(
      event.clubs
    );

  const net =
    transactions.reduce(
      (
        sum,
        transaction
      ) =>
        sum +
        transaction.club_net_cents,
      0
    );

  const reviewCount =
    offers.filter(
      (offer) =>
        offer.status ===
        "admin_review"
    ).length;

  return (
    <Link
      href={`/manager/events/${event.id}`}
      className="rounded-2xl border border-white/10 bg-[#111111] p-5 transition hover:border-white/20"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-[#858585]">
            {club?.name ??
              "Club"}{" "}
            ·{" "}
            {formatDate(
              event.event_date
            )}
          </p>

          <h3 className="mt-1 text-lg font-bold text-[#F7F4EE]">
            {event.name}
          </h3>

          {reviewCount > 0 && (
            <p className="mt-2 text-sm text-amber-300">
              {reviewCount} table
              {reviewCount > 1
                ? "s"
                : ""}{" "}
              en décision
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl bg-black/40 px-4 py-3">
            <p className="text-xs text-[#666]">
              Net club
            </p>

            <p className="mt-1 font-semibold">
              {cents(net)}
            </p>
          </div>

          <SettlementBadge
            status={
              settlement?.status ??
              null
            }
          />

          <span className="text-[#858585]">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
