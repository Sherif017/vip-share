import Link from "next/link";
import EventShareActions from "@/components/EventShareActions";

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

  payment_model: "legacy_deposit" | "full_payment" | string;

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
  payment_type: string;
  status: "refund_pending" | "refunding" | "refunded";
};

type PaymentTransaction = {
  id: string;
  reservation_id: string;
  event_id: string;
  club_id: string;

  payment_type: "initial" | "supplement" | string;
  status: "pending" | "confirmed" | "expired" | "refunded" | string;

  transfer_status:
    | "not_ready"
    | "ready"
    | "processing"
    | "transferred"
    | "failed"
    | "reversed"
    | string;

  vip_subtotal_cents: number;
  service_fee_cents: number;
  commission_cents: number;
  club_net_cents: number;
  total_customer_cents: number;

  commission_rate_bps: number;
  service_fee_rate_bps: number;

  stripe_transfer_id: string | null;
  stripe_transfer_reversal_id: string | null;
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
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
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
        payment_model,
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

  /*
  |--------------------------------------------------------------------------
  | Ledger financier paiement intégral
  |--------------------------------------------------------------------------
  |
  | payment_transactions est la source de vérité pour les nouvelles
  | réservations K-RÉ :
  |
  | - montant VIP payé
  | - commission K-RÉ
  | - net club
  | - état du transfert Stripe Connect
  |
  | Les anciens champs deposit_paid / remaining_amount ne sont conservés
  | que pour l'historique legacy.
  |
  */

  const {
    data: paymentTransactionsData,
    error: paymentTransactionsError,
  } =
    await supabaseAdmin
      .from("payment_transactions")
      .select(`
        id,
        reservation_id,
        event_id,
        club_id,
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
        stripe_transfer_reversal_id
      `)
      .eq(
        "event_id",
        id
      );

  if (paymentTransactionsError) {
    console.error(
      "Erreur récupération ledger financier :",
      paymentTransactionsError
    );
  }

  const paymentTransactions =
    (
      paymentTransactionsData ??
      []
    ) as PaymentTransaction[];

  const confirmedPaymentTransactions =
    paymentTransactions.filter(
      (transaction) =>
        transaction.status ===
        "confirmed"
    );

  const transactionsByReservation =
    new Map<string, PaymentTransaction[]>();

  for (const transaction of paymentTransactions) {
    const current =
      transactionsByReservation.get(
        transaction.reservation_id
      ) ?? [];

    current.push(transaction);

    transactionsByReservation.set(
      transaction.reservation_id,
      current
    );
  }

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

  /*
  |--------------------------------------------------------------------------
  | Finance — nouveau modèle full payment
  |--------------------------------------------------------------------------
  */

  const fullPaymentVipCents =
    confirmedPaymentTransactions.reduce(
      (total, transaction) =>
        total +
        Number(
          transaction.vip_subtotal_cents ??
            0
        ),
      0
    );

  const fullPaymentCommissionCents =
    confirmedPaymentTransactions.reduce(
      (total, transaction) =>
        total +
        Number(
          transaction.commission_cents ??
            0
        ),
      0
    );

  const fullPaymentClubNetCents =
    confirmedPaymentTransactions.reduce(
      (total, transaction) =>
        total +
        Number(
          transaction.club_net_cents ??
            0
        ),
      0
    );

  const transferredClubNetCents =
    confirmedPaymentTransactions
      .filter(
        (transaction) =>
          transaction.transfer_status ===
          "transferred"
      )
      .reduce(
        (total, transaction) =>
          total +
          Number(
            transaction.club_net_cents ??
              0
          ),
        0
      );

  const pendingClubNetCents =
    confirmedPaymentTransactions
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
        (total, transaction) =>
          total +
          Number(
            transaction.club_net_cents ??
              0
          ),
        0
      );

  /*
  |--------------------------------------------------------------------------
  | Compatibilité historique legacy
  |--------------------------------------------------------------------------
  */

  const legacyConfirmedReservations =
    confirmedReservations.filter(
      (reservation) =>
        reservation.payment_model !==
        "full_payment"
    );

  const legacyDeposits =
    legacyConfirmedReservations.reduce(
      (total, reservation) =>
        total +
        Number(
          reservation.deposit_paid ??
            0
        ),
      0
    );

  const legacyRemaining =
    legacyConfirmedReservations.reduce(
      (total, reservation) =>
        total +
        Number(
          reservation.remaining_amount ??
            0
        ),
      0
    );

  const legacyRevenue =
    legacyConfirmedReservations.reduce(
      (total, reservation) =>
        total +
        Number(
          reservation.total_price ??
            0
        ),
      0
    );

  const totalOnlineVip =
    fullPaymentVipCents / 100 +
    legacyDeposits;



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

  const requestedTab = (await searchParams)?.tab;
  const tab = requestedTab === "reservations" || requestedTab === "finances" ? requestedTab : "tables";
  const reviewCount = tables.filter(t => t.status === "admin_review").length;
  const orphanReservations = reservations.filter(r => !tables.some(t => t.id === r.vip_offer_id));
  function renderReservation(reservation: Reservation, tableName: string) {
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

                                      const reservationTransactions =
                                        (
                                          transactionsByReservation.get(
                                            reservation.id
                                          ) ?? []
                                        ).filter(
                                          (transaction) =>
                                            transaction.status === "confirmed"
                                        );

                                      const isFullPayment =
                                        reservation.payment_model ===
                                        "full_payment";

                                      const reservationVipPaid =
                                        isFullPayment
                                          ? reservationTransactions.reduce(
                                              (total, transaction) =>
                                                total +
                                                Number(
                                                  transaction.vip_subtotal_cents ??
                                                    0
                                                ),
                                              0
                                            ) / 100
                                          : Number(
                                              reservation.deposit_paid ??
                                                0
                                            );

                                      const reservationClubNet =
                                        isFullPayment
                                          ? reservationTransactions.reduce(
                                              (total, transaction) =>
                                                total +
                                                Number(
                                                  transaction.club_net_cents ??
                                                    0
                                                ),
                                              0
                                            ) / 100
                                          : Number(
                                              reservation.total_price ??
                                                0
                                            );

                                      const reservationTransferStatus =
                                        isFullPayment
                                          ? getReservationTransferLabel(
                                              reservationTransactions
                                            )
                                          : "Legacy";
      return (
        <details key={reservation.id} className="group rounded-2xl border border-zinc-800 bg-zinc-950">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0"><p className="break-words font-semibold">{reservation.firstname} {reservation.lastname}</p><p className="mt-1 text-xs text-zinc-400">{tableName} · {reservation.quantity} places · {checkedIn} entrée(s)</p></div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><ReservationStatusBadge status={reservation.status}/><span aria-hidden="true" className="text-zinc-400 group-open:rotate-180">⌄</span></div>
          </summary>
          <div className="space-y-4 border-t border-zinc-800 p-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <TableInfo label="Référence" value={reservation.reservation_code}/>
              <TableInfo label="Contact" value={`${reservation.email ?? "—"} · ${reservation.phone ?? "—"}`}/>
              <TableInfo label="VIP payé" value={formatMoney(reservationVipPaid)}/>
              <TableInfo label={isFullPayment ? "Net club" : "Valeur VIP (ancien modèle)"} value={formatMoney(reservationClubNet)}/>
              <TableInfo label="Paiement" value={isFullPayment ? reservationTransferStatus : `Ancien modèle · ${formatMoney(Number(reservation.remaining_amount ?? 0))} sur place`}/>
              <TableInfo label="Entrées" value={`${checkedIn}/${reservation.quantity}`}/>
            </div>
            <ProgressBar percentage={progress}/>
            <div className="flex flex-wrap items-center gap-4">
              {allRefundsCompleted ? <span className="text-green-400">Remboursée</span> : refundInProgress ? <span className="text-amber-300">Remboursement en cours</span> : hasRefundablePayment ? <AdminRefundButton reservationId={reservation.id}/> : null}
              {reservation.status === "confirmed" && <Link href={`/confirmation/${reservation.reservation_code}`} className="underline underline-offset-4">Voir le pass</Link>}
            </div>
          </div>
        </details>
      );
  }
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 md:py-10">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-white">← Mes soirées</Link>
        <header className="mt-6 flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs uppercase tracking-widest text-zinc-400">{club?.name ?? "Club"}{club?.city ? ` · ${club.city}` : ""}</p><h1 className="mt-2 text-3xl font-bold tracking-tight md:text-5xl">{event.name}</h1><p className="mt-2 capitalize text-sm text-zinc-400">{formattedDate} · {event.start_time?.slice(0,5)}{event.music ? ` · ${event.music}` : ""}</p><div className="mt-3"><EventStatusBadge status={event.status}/></div></div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/events/${event.id}/edit`} className="rounded-full kre-primary-cta px-5 py-3 text-sm font-semibold">Modifier</Link>
            <Link href={`/events/${encodeURIComponent(event.slug)}`} className="rounded-full border border-zinc-700 px-4 py-3 text-sm">Aperçu</Link>
            <Link href="/admin/scan" className="rounded-full border border-zinc-700 px-4 py-3 text-sm">Scanner</Link>
          </div>
        </header>
        <details className="mt-4 rounded-2xl border border-zinc-800 p-4"><summary className="cursor-pointer text-sm font-medium">Publication et partage</summary><div className="mt-4 space-y-4"><EventStatusActions eventId={event.id} currentStatus={event.status}/><EventShareActions slug={event.slug} name={event.name} status={event.status}/></div></details>
        <section className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          <StatCard label="Places confirmées" value={`${confirmedPeople}/${totalCapacity}`}/>
          <StatCard label="Net club (intégral)" value={formatMoney(fullPaymentClubNetCents/100)}/>
          <StatCard label="Entrées" value={`${totalCheckedIn}/${confirmedPeople}`}/>
        </section>
        {reviewCount > 0 && <Link href="?tab=tables#tables" className="mt-4 block rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-300">{reviewCount} table(s) nécessitent une décision →</Link>}
        {pendingPeople > 0 && <p className="mt-3 text-sm text-amber-300">{pendingPeople} place(s) en attente de paiement.</p>}
        <nav aria-label="Gestion de la soirée" className="mt-8 grid grid-cols-3 gap-1 rounded-2xl bg-zinc-900 p-1">
          {([{id:"tables",label:"Tables VIP"},{id:"reservations",label:"Réservations"},{id:"finances",label:"Finances"}] as const).map(item => <Link key={item.id} href={`?tab=${item.id}`} scroll={false} aria-current={tab === item.id ? "page" : undefined} className={`rounded-xl px-2 py-3 text-center text-xs font-semibold sm:text-sm ${tab === item.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>{item.label}</Link>)}
        </nav>
        {tab === "finances" && <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><p className="text-sm text-zinc-400">Revenu net du club · paiement intégral</p><p className="mt-2 text-4xl font-bold">{formatMoney(fullPaymentClubNetCents/100)}</p></div>
          <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950 px-5">
            {[["VIP payé en ligne",totalOnlineVip],["Commission K-RÉ",fullPaymentCommissionCents/100],["Déjà transféré",transferredClubNetCents/100],["À recevoir",pendingClubNetCents/100]].map(([label,value]) => <div key={label} className="flex justify-between gap-4 py-4 text-sm"><span className="text-zinc-400">{label}</span><strong>{formatMoney(Number(value))}</strong></div>)}
          </div>
          {legacyConfirmedReservations.length > 0 && <div className="rounded-xl border border-amber-900/50 p-4 text-sm text-amber-300">Ancien modèle : {legacyConfirmedReservations.length} réservation(s) · {formatMoney(legacyDeposits)} d’acomptes · {formatMoney(legacyRemaining)} à encaisser au club · valeur VIP {formatMoney(legacyRevenue)}.</div>}
        </section>}
        {tab === "reservations" && <section className="mt-6 space-y-3"><h2 className="text-xl font-semibold">Réservations ({reservations.length})</h2>{reservations.length === 0 && <p className="text-zinc-400">Aucune réservation.</p>}{reservations.map(r => {const t = tables.find(t => t.id === r.vip_offer_id); return renderReservation(r, t ? `Table ${t.table_number}` : "Sans table");})}</section>}
        {tab === "tables" && <section id="tables" className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Tables VIP ({tables.length})</h2><p className="text-xs text-zinc-400">{remainingSpots} places restantes · {globalFillRate}% de remplissage · {globalCheckInRate}% d’entrées</p></div>
          {tables.length === 0 && <p className="rounded-2xl border border-zinc-800 p-6 text-zinc-400">Aucune table configurée.</p>}
          {tables.map(table => {
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

                  const tableReservationIds =
                    new Set(
                      tableReservations.map(
                        (reservation) =>
                          reservation.id
                      )
                    );

                  const tableConfirmedTransactions =
                    confirmedPaymentTransactions.filter(
                      (transaction) =>
                        tableReservationIds.has(
                          transaction.reservation_id
                        )
                    );

                  const tableVipCents =
                    tableConfirmedTransactions.reduce(
                      (total, transaction) =>
                        total +
                        Number(
                          transaction.vip_subtotal_cents ??
                            0
                        ),
                      0
                    );

                  const tableCommissionCents =
                    tableConfirmedTransactions.reduce(
                      (total, transaction) =>
                        total +
                        Number(
                          transaction.commission_cents ??
                            0
                        ),
                      0
                    );

                  const tableClubNetCents =
                    tableConfirmedTransactions.reduce(
                      (total, transaction) =>
                        total +
                        Number(
                          transaction.club_net_cents ??
                            0
                        ),
                      0
                    );

                  const tableTransferredCents =
                    tableConfirmedTransactions
                      .filter(
                        (transaction) =>
                          transaction.transfer_status ===
                          "transferred"
                      )
                      .reduce(
                        (total, transaction) =>
                          total +
                          Number(
                            transaction.club_net_cents ??
                              0
                          ),
                        0
                      );

                  const tableLegacyReservations =
                    tableConfirmedReservations.filter(
                      (reservation) =>
                        reservation.payment_model !==
                        "full_payment"
                    );

                  const tableLegacyDeposits =
                    tableLegacyReservations.reduce(
                      (total, reservation) =>
                        total +
                        Number(
                          reservation.deposit_paid ??
                            0
                        ),
                      0
                    );

                  const tableLegacyRemaining =
                    tableLegacyReservations.reduce(
                      (total, reservation) =>
                        total +
                        Number(
                          reservation.remaining_amount ??
                            0
                        ),
                      0
                    );

                  const tableOnlineVip =
                    tableVipCents / 100 +
                    tableLegacyDeposits;

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

            return <details key={table.id} className="group rounded-2xl border border-zinc-800 bg-zinc-950">
              <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">Table {table.table_number}</h3><div className="flex items-center gap-2"><TableStatusBadge status={table.status}/><span aria-hidden="true" className="text-zinc-400 group-open:rotate-180">⌄</span></div></div><div className="mt-3 flex justify-between gap-3 text-sm"><span className="text-zinc-400">{tableConfirmedPeople}/{tableCapacity} places confirmées</span><strong>{formatMoney(tableClubNetCents/100)} <span className="text-xs font-normal text-zinc-400">net intégral</span></strong></div><ProgressBar percentage={tableFillRate}/></summary>
              <div className="space-y-5 border-t border-zinc-800 p-4 sm:p-5">
                <p className="text-sm text-zinc-400">{tableRemainingSpots} disponibles · {tableCheckedIn}/{tableConfirmedPeople} entrées ({tableCheckInRate}%) · {thresholdReached ? "Seuil atteint" : "Seuil non atteint"}</p>
                {temporaryHolds > 0 && <p className="text-sm text-amber-300">{temporaryHolds} place(s) temporairement bloquées.</p>}
                {table.status === "admin_review" && <AdminReviewActions vipOfferId={table.id} tableNumber={String(table.table_number)} confirmedPeople={tableConfirmedPeople} confirmationThreshold={threshold}/>}
                <details className="rounded-xl border border-zinc-800 p-3"><summary className="cursor-pointer text-sm font-medium">Informations et finances de la table</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <TableInfo label="Prix table" value={formatMoney(Number(table.total_table_price))}/><TableInfo label="Prix / personne" value={formatMoney(Number(table.price_per_person))}/><TableInfo label="Seuil" value={`${threshold} pers.`}/><TableInfo label="Date limite" value={formatDeadline(table.booking_deadline)}/><TableInfo label="Paiement" value="100 % en ligne (nouveau modèle)"/><TableInfo label="Frais client" value="Ajoutés au checkout K-RÉ"/><TableInfo label="VIP payé en ligne" value={formatMoney(tableOnlineVip)}/><TableInfo label="Commission K-RÉ" value={formatMoney(tableCommissionCents/100)}/><TableInfo label="Déjà transféré" value={formatMoney(tableTransferredCents/100)}/>
                </div>{tableLegacyReservations.length > 0 && <p className="mt-3 text-sm text-amber-300">Ancien modèle : {formatMoney(tableLegacyRemaining)} à encaisser au club.</p>}</details>
                <h4 className="font-semibold">Participants ({tableReservations.length})</h4>{tableReservations.length === 0 ? <p className="text-sm text-zinc-400">Aucune réservation.</p> : tableReservations.map(r => renderReservation(r, `Table ${table.table_number}`))}
              </div>
            </details>;
          })}
        </section>}
        {orphanReservations.length > 0 && <Link href="?tab=reservations" className="mt-5 block rounded-xl border border-red-900/50 p-4 text-sm text-red-300">{orphanReservations.length} réservation(s) sans table configurée →</Link>}
      </div>
    </main>
  );
}
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

function getReservationTransferLabel(
  transactions: PaymentTransaction[]
) {
  if (transactions.length === 0) {
    return "Paiement intégral";
  }

  const statuses =
    transactions.map(
      (transaction) =>
        transaction.transfer_status
    );

  if (
    statuses.every(
      (status) =>
        status === "transferred"
    )
  ) {
    return "Transféré au club";
  }

  if (
    statuses.some(
      (status) =>
        status === "processing"
    )
  ) {
    return "Transfert en cours";
  }

  if (
    statuses.some(
      (status) =>
        status === "failed"
    )
  ) {
    return "Transfert à reprendre";
  }

  if (
    statuses.some(
      (status) =>
        status === "ready"
    )
  ) {
    return "Prêt au transfert";
  }

  return "Payé en ligne";
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
        className="h-full rounded-full bg-[#D4B77D] transition-all"
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-5">
      <p className="text-xs text-zinc-400 sm:text-sm">
        {label}
      </p>

      <p className="mt-2 break-words text-xl font-bold sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

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

      <p className="mt-2 break-words font-medium text-white">
        {value}
      </p>
    </div>
  );
}

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
  if (status === "admin_review") return <span className="rounded-full bg-amber-950/30 px-3 py-1 text-xs text-amber-300">Décision requise</span>;
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
