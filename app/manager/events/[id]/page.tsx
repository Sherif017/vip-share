import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import SettlementActions from "@/components/manager/SettlementActions";
import { getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Transaction = {
  id: string;
  reservation_id: string;
  payment_type: string;

  status: string;
  transfer_status: string;

  vip_subtotal_cents: number;
  service_fee_cents: number;
  commission_cents: number;
  club_net_cents: number;
  total_customer_cents: number;

  commission_rate_bps: number;
  service_fee_rate_bps: number;

  stripe_transfer_id:
    | string
    | null;

  stripe_transfer_reversal_id:
    | string
    | null;

  confirmed_at:
    | string
    | null;

  transferred_at:
    | string
    | null;
};

type Reservation = {
  id: string;
  reservation_code: string;
  firstname: string;
  lastname: string;
  quantity: number;
  status: string;
  payment_model: string;
};

type Settlement = {
  event_id: string;

  status:
    | "pending_review"
    | "approved"
    | "held"
    | "settled";

  approved_at:
    | string
    | null;

  hold_reason:
    | string
    | null;

  settled_at:
    | string
    | null;
};

function money(
  value: number
) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      style: "currency",
      currency: "EUR",
    }
  ).format(
    value / 100
  );
}

function formatDate(
  value: string
) {
  return new Date(
    `${value}T12:00:00`
  ).toLocaleDateString(
    "fr-FR",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}

function parisToday() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(
    new Date()
  );
}

export default async function ManagerEventPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.isManager) {
    redirect("/admin");
  }

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
        status,
        club_id,
        clubs (
          id,
          name,
          city,
          commission_bps,
          stripe_account_id,
          stripe_charges_enabled,
          stripe_payouts_enabled,
          stripe_onboarding_status
        )
      `)
      .eq(
        "id",
        id
      )
      .maybeSingle();

  if (
    eventError ||
    !eventData
  ) {
    notFound();
  }

  const club =
    Array.isArray(
      eventData.clubs
    )
      ? eventData.clubs[0]
      : eventData.clubs;

  const [
    transactionsResult,
    settlementResult,
    refundsResult,
    offersResult,
  ] =
    await Promise.all([
      supabaseAdmin
        .from(
          "payment_transactions"
        )
        .select(`
          id,
          reservation_id,
          payment_type,
          status,
          transfer_status,
          vip_subtotal_cents,
          service_fee_cents,
          commission_cents,
          club_net_cents,
          total_customer_cents,
          commission_rate_bps,
          service_fee_rate_bps,
          stripe_transfer_id,
          stripe_transfer_reversal_id,
          confirmed_at,
          transferred_at
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
        ),

      supabaseAdmin
        .from(
          "event_settlements"
        )
        .select(`
          event_id,
          status,
          approved_at,
          hold_reason,
          settled_at
        `)
        .eq(
          "event_id",
          id
        )
        .maybeSingle(),

      supabaseAdmin
        .from(
          "vip_refunds"
        )
        .select(`
          id,
          reservation_id,
          payment_type,
          status,
          amount,
          reason,
          created_at
        `)
        .order(
          "created_at",
          {
            ascending: false,
          }
        ),

      supabaseAdmin
        .from(
          "vip_offers"
        )
        .select(`
          id,
          table_number,
          status,
          capacity,
          spots_reserved,
          confirmation_threshold
        `)
        .eq(
          "event_id",
          id
        )
        .order(
          "table_number",
          {
            ascending: true,
          }
        ),
    ]);

  const transactions =
    (
      transactionsResult.data ??
      []
    ) as Transaction[];

  const settlement =
    (
      settlementResult.data ??
      null
    ) as Settlement | null;

  const reservationIds =
    Array.from(
      new Set(
        transactions.map(
          (
            transaction
          ) =>
            transaction.reservation_id
        )
      )
    );

  const {
    data: reservationsData,
  } =
    reservationIds.length >
    0
      ? await supabaseAdmin
          .from(
            "reservations"
          )
          .select(`
            id,
            reservation_code,
            firstname,
            lastname,
            quantity,
            status,
            payment_model
          `)
          .in(
            "id",
            reservationIds
          )
      : {
          data: [],
        };

  const reservations =
    (
      reservationsData ??
      []
    ) as Reservation[];

  const reservationById =
    new Map(
      reservations.map(
        (
          reservation
        ) => [
          reservation.id,
          reservation,
        ]
      )
    );

  const eventRefunds =
    (
      refundsResult.data ??
      []
    ).filter(
      (
        refund
      ) =>
        reservationIds.includes(
          refund.reservation_id
        )
    );

  const confirmed =
    transactions.filter(
      (
        transaction
      ) =>
        transaction.status ===
        "confirmed"
    );

  const refunded =
    transactions.filter(
      (
        transaction
      ) =>
        transaction.status ===
        "refunded"
    );

  const vipCents =
    confirmed.reduce(
      (
        sum,
        transaction
      ) =>
        sum +
        transaction.vip_subtotal_cents,
      0
    );

  const serviceFeeCents =
    confirmed.reduce(
      (
        sum,
        transaction
      ) =>
        sum +
        transaction.service_fee_cents,
      0
    );

  const commissionCents =
    confirmed.reduce(
      (
        sum,
        transaction
      ) =>
        sum +
        transaction.commission_cents,
      0
    );

  const netClubCents =
    confirmed.reduce(
      (
        sum,
        transaction
      ) =>
        sum +
        transaction.club_net_cents,
      0
    );

  const customerCents =
    confirmed.reduce(
      (
        sum,
        transaction
      ) =>
        sum +
        transaction.total_customer_cents,
      0
    );

  const transferredCents =
    confirmed
      .filter(
        (
          transaction
        ) =>
          transaction.transfer_status ===
          "transferred"
      )
      .reduce(
        (
          sum,
          transaction
        ) =>
          sum +
          transaction.club_net_cents,
        0
      );

  const remainingTransferCents =
    confirmed
      .filter(
        (
          transaction
        ) =>
          ![
            "transferred",
            "reversed",
          ].includes(
            transaction.transfer_status
          )
      )
      .reduce(
        (
          sum,
          transaction
        ) =>
          sum +
          transaction.club_net_cents,
        0
      );

  const pendingRefunds =
    eventRefunds.filter(
      (
        refund
      ) =>
        refund.status ===
          "refund_pending" ||
        refund.status ===
          "refunding"
    );

  const eventHasPassed =
    eventData.event_date <
    parisToday();

  const offers =
    offersResult.data ??
    [];

  const reviewOffers =
    offers.filter(
      (
        offer
      ) =>
        offer.status ===
        "admin_review"
    );

  return (
    <main className="min-h-screen bg-[#080808]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        <Link
          href="/manager"
          className="text-sm text-[#858585] transition hover:text-white"
        >
          ← Retour au cockpit
        </Link>

        <section className="mt-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-[#858585]">
              {club?.name ??
                "Club"}{" "}
              ·{" "}
              {club?.city ??
                ""}
            </p>

            <h1 className="mt-3 text-4xl font-bold text-[#F7F4EE] md:text-5xl">
              {
                eventData.name
              }
            </h1>

            <p className="mt-3 capitalize text-[#A7A7A7]">
              {formatDate(
                eventData.event_date
              )}

              {eventData.start_time
                ? ` · ${eventData.start_time.slice(
                    0,
                    5
                  )}`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/admin/events/${eventData.id}`}
              className="rounded-full border border-white/15 px-5 py-3 text-sm transition hover:border-white/30"
            >
              Exploitation
            </Link>

            <Link
              href={`/events/${eventData.slug}`}
              className="rounded-full border border-white/15 px-5 py-3 text-sm transition hover:border-white/30"
            >
              Côté client
            </Link>

            {club?.id && (
              <Link
                href={`/manager/clubs/${club.id}`}
                className="rounded-full bg-[#D8B56A] px-5 py-3 text-sm font-semibold text-black"
              >
                Voir le club
              </Link>
            )}
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceMetric
            label="Encaissé clients"
            value={money(
              customerCents
            )}
            subtitle="VIP + frais K-RÉ"
          />

          <FinanceMetric
            label="Volume VIP"
            value={money(
              vipCents
            )}
            subtitle="Valeur VIP confirmée"
          />

          <FinanceMetric
            label="Commission K-RÉ"
            value={money(
              commissionCents
            )}
            subtitle="Prélevée sur le VIP"
            accent
          />

          <FinanceMetric
            label="Frais de service"
            value={money(
              serviceFeeCents
            )}
            subtitle="Payés par les clients"
            accent
          />

          <FinanceMetric
            label="Net club"
            value={money(
              netClubCents
            )}
            subtitle="Après commission"
          />

          <FinanceMetric
            label="Déjà transféré"
            value={money(
              transferredCents
            )}
            subtitle="Vers Stripe Connect"
          />

          <FinanceMetric
            label="Reste à transférer"
            value={money(
              remainingTransferCents
            )}
            subtitle="Sous contrôle K-RÉ"
            accent={
              remainingTransferCents >
              0
            }
          />

          <FinanceMetric
            label="Remboursements"
            value={
              pendingRefunds.length.toString()
            }
            subtitle={`${refunded.length} transaction(s) remboursée(s)`}
            accent={
              pendingRefunds.length >
              0
            }
          />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#111111] p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-[#858585]">
              État financier
            </p>

            <div className="mt-5 space-y-4">
              <StatusLine
                label="Règlement"
                value={
                  settlement
                    ? settlementLabel(
                        settlement.status
                      )
                    : "Non validé"
                }
              />

              <StatusLine
                label="Transactions confirmées"
                value={
                  confirmed.length.toString()
                }
              />

              <StatusLine
                label="Tables en décision"
                value={
                  reviewOffers.length.toString()
                }
                warning={
                  reviewOffers.length >
                  0
                }
              />

              <StatusLine
                label="Remboursements en cours"
                value={
                  pendingRefunds.length.toString()
                }
                warning={
                  pendingRefunds.length >
                  0
                }
              />

              <StatusLine
                label="Stripe Connect"
                value={
                  club?.stripe_charges_enabled
                    ? "Actif"
                    : "Non prêt"
                }
                warning={
                  !club?.stripe_charges_enabled
                }
              />
            </div>

            {settlement?.hold_reason && (
              <div className="mt-5 rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
                <p className="text-xs uppercase tracking-wide text-amber-400">
                  Motif d&apos;attente
                </p>

                <p className="mt-2 text-sm text-amber-100/70">
                  {
                    settlement.hold_reason
                  }
                </p>
              </div>
            )}
          </div>

          <SettlementActions
            eventId={
              eventData.id
            }
            status={
              settlement?.status ??
              null
            }
            eventHasPassed={
              eventHasPassed
            }
          />
        </section>

        <section className="mt-12">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-[#858585]">
              Ledger K-RÉ
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Transactions
            </h2>

            <p className="mt-2 text-sm text-[#858585]">
              Snapshot financier réel utilisé
              pour les commissions,
              remboursements et transferts.
            </p>
          </div>

          {transactions.length ===
          0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#111111] p-7 text-[#858585]">
              Aucune transaction en paiement intégral pour cette soirée.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#111111]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1150px] text-left text-sm">
                  <thead className="bg-black/40 text-xs uppercase tracking-wide text-[#666]">
                    <tr>
                      <th className="px-5 py-4">
                        Réservation
                      </th>

                      <th className="px-5 py-4">
                        Type
                      </th>

                      <th className="px-5 py-4">
                        VIP
                      </th>

                      <th className="px-5 py-4">
                        Frais
                      </th>

                      <th className="px-5 py-4">
                        Commission
                      </th>

                      <th className="px-5 py-4">
                        Net club
                      </th>

                      <th className="px-5 py-4">
                        Client
                      </th>

                      <th className="px-5 py-4">
                        Paiement
                      </th>

                      <th className="px-5 py-4">
                        Transfert
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.07]">
                    {transactions.map(
                      (
                        transaction
                      ) => {
                        const reservation =
                          reservationById.get(
                            transaction.reservation_id
                          );

                        return (
                          <tr
                            key={
                              transaction.id
                            }
                            className="hover:bg-white/[0.02]"
                          >
                            <td className="px-5 py-5">
                              <p className="font-medium text-[#F7F4EE]">
                                {reservation
                                  ? `${reservation.firstname} ${reservation.lastname}`
                                  : "Réservation"}
                              </p>

                              <p className="mt-1 text-xs text-[#666]">
                                {reservation?.reservation_code ??
                                  transaction.reservation_id.slice(
                                    0,
                                    8
                                  )}
                              </p>
                            </td>

                            <td className="px-5 py-5 text-[#A7A7A7]">
                              {transaction.payment_type ===
                              "supplement"
                                ? "Supplément"
                                : "Initial"}
                            </td>

                            <td className="px-5 py-5">
                              {money(
                                transaction.vip_subtotal_cents
                              )}
                            </td>

                            <td className="px-5 py-5">
                              {money(
                                transaction.service_fee_cents
                              )}
                            </td>

                            <td className="px-5 py-5">
                              {money(
                                transaction.commission_cents
                              )}
                            </td>

                            <td className="px-5 py-5 font-semibold">
                              {money(
                                transaction.club_net_cents
                              )}
                            </td>

                            <td className="px-5 py-5">
                              {money(
                                transaction.total_customer_cents
                              )}
                            </td>

                            <td className="px-5 py-5">
                              <PaymentBadge
                                status={
                                  transaction.status
                                }
                              />
                            </td>

                            <td className="px-5 py-5">
                              <TransferBadge
                                status={
                                  transaction.transfer_status
                                }
                              />
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

function FinanceMetric({
  label,
  value,
  subtitle,
  accent = false,
}: {
  label: string;
  value: string;
  subtitle: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        accent
          ? "border-[#D8B56A]/30 bg-[#D8B56A]/[0.06]"
          : "border-white/10 bg-[#111111]"
      }`}
    >
      <p className="text-sm text-[#858585]">
        {label}
      </p>

      <p className="mt-3 text-2xl font-bold">
        {value}
      </p>

      <p className="mt-2 text-xs text-[#666]">
        {subtitle}
      </p>
    </div>
  );
}

function StatusLine({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-white/[0.06] pb-4 last:border-0 last:pb-0">
      <span className="text-sm text-[#858585]">
        {label}
      </span>

      <span
        className={`text-sm font-semibold ${
          warning
            ? "text-amber-300"
            : "text-[#F7F4EE]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function settlementLabel(
  status: Settlement["status"]
) {
  if (
    status === "approved"
  ) {
    return "Validé · transfert requis";
  }

  if (
    status === "held"
  ) {
    return "En attente";
  }

  if (
    status === "settled"
  ) {
    return "Réglé";
  }

  return "À valider";
}

function PaymentBadge({
  status,
}: {
  status: string;
}) {
  const classes =
    status === "confirmed"
      ? "bg-emerald-950/40 text-emerald-300"
      : status === "refunded"
        ? "bg-blue-950/40 text-blue-300"
        : status === "expired"
          ? "bg-red-950/40 text-red-300"
          : "bg-white/[0.06] text-[#A7A7A7]";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${classes}`}
    >
      {status}
    </span>
  );
}

function TransferBadge({
  status,
}: {
  status: string;
}) {
  const labels:
    Record<
      string,
      string
    > = {
      not_ready:
        "Non prêt",
      ready:
        "Prêt",
      processing:
        "En cours",
      transferred:
        "Transféré",
      failed:
        "Échec",
      reversed:
        "Reversé",
    };

  const classes =
    status ===
    "transferred"
      ? "bg-emerald-950/40 text-emerald-300"
      : status ===
          "ready"
        ? "bg-blue-950/40 text-blue-300"
        : status ===
            "failed"
          ? "bg-red-950/40 text-red-300"
          : status ===
              "processing"
            ? "bg-amber-950/40 text-amber-300"
            : "bg-white/[0.06] text-[#A7A7A7]";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${classes}`}
    >
      {labels[status] ??
        status}
    </span>
  );
}
