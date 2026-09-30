import {
  eventHasStarted,
} from "@/lib/event-time";
import {
  notFound,
} from "next/navigation";

import {
  supabase,
} from "@/lib/supabase";

import { supabaseAdmin } from "@/lib/supabase-admin";

import CheckoutClient from "./CheckoutClient";

type Club = {
  id: string;
  name: string;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  end_time: string;

  clubs:
    | Club
    | Club[]
    | null;
};

type VipOffer = {
  id: string;

  table_number: string;

  capacity: number;

  spots_reserved: number;

  price_per_person: number;

  deposit_per_person: number;

  remaining_per_person: number;

  booking_deadline:
    | string
    | null;
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    table?: string;
    quantity?: string;
  }>;
}) {
  const { id } =
    await params;

  const query =
    await searchParams;

  const tableId =
    query.table?.trim();

  const quantity =
    Number(
      query.quantity ?? 1
    );

  if (
    !tableId ||
    !Number.isInteger(
      quantity
    ) ||
    quantity < 1
  ) {
    notFound();
  }

  const {
    data: eventData,
    error: eventError,
  } =
    await supabase
      .from("events")
      .select(`
        id,
        slug,
        name,
        event_date,
        start_time,
        end_time,

        clubs (
          id,
          name
        )
      `)
      .eq(
        "slug",
        id
      )
      .eq(
        "status",
        "published"
      )
      .single();

  if (
    eventError ||
    !eventData
  ) {
    console.error(
      "Erreur checkout event :",
      eventError
    );

    notFound();
  }

  const event =
    eventData as EventItem;

  if (
    eventHasStarted({
      eventDate:
        event.event_date,
      startTime:
        event.start_time,
      endTime:
        event.end_time,
    })
  ) {
    notFound();
  }

  const club =
    Array.isArray(
      event.clubs
    )
      ? event.clubs[0]
      : event.clubs;

  if (!club) {
    notFound();
  }

  const {
    data: offerData,
    error: offerError,
  } =
    await supabase
      .from("vip_offers")
      .select(`
        id,
        table_number,
        capacity,
        spots_reserved,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        booking_deadline
      `)
      .eq(
        "id",
        tableId
      )
      .eq(
        "event_id",
        event.id
      )
      .single();

  if (
    offerError ||
    !offerData
  ) {
    console.error(
      "Erreur checkout table :",
      offerError
    );

    notFound();
  }

  const offer =
    offerData as VipOffer;

  const availableSpots =
    Number(
      offer.capacity
    ) -
    Number(
      offer.spots_reserved
    );

  if (
    quantity >
    availableSpots
  ) {
    notFound();
  }

  if (
    offer.booking_deadline &&
    new Date(
      offer.booking_deadline
    ).getTime() <=
      new Date().getTime()
  ) {
    notFound();
  }

  const pricePerPerson =
    Number(
      offer.price_per_person
    );

  const depositPerPerson =
    Number(
      offer.deposit_per_person
    );

  const remainingPerPerson =
    Number(
      offer.remaining_per_person
    );

  // ==========================================================
  // Nouveau parcours K-RÉ :
  // - aucune nouvelle réservation ne repasse par legacy_deposit ;
  // - la disponibilité commerciale est déterminée côté serveur ;
  // - commission et identifiants Stripe internes ne sont jamais
  //   envoyés au navigateur.
  //
  // La RPC create_full_payment_reservation revérifie également
  // ces conditions au moment de la réservation.
  // ==========================================================

  const { data: clubFinancialState, error: clubFinancialError } =
    await supabaseAdmin
      .from("clubs")
      .select("stripe_account_id,stripe_charges_enabled,commission_bps")
      .eq("id", club.id)
      .single();

  const clubReady =
    !clubFinancialError &&
    clubFinancialState?.stripe_charges_enabled === true &&
    Boolean(clubFinancialState?.stripe_account_id) &&
    clubFinancialState?.commission_bps != null;

  const vipSubtotal = pricePerPerson * quantity;

  const { data: feeConfig } = await supabaseAdmin
    .from("platform_settings")
    .select("service_fee_bps, service_fee_minimum_cents")
    .single();

  const serviceFeeBps = feeConfig?.service_fee_bps ?? 275;
  const serviceFeeMinimumCents =
    feeConfig?.service_fee_minimum_cents ?? 30;

  const vipSubtotalCents = Math.round(vipSubtotal * 100);

  const serviceFeeCents = Math.max(
    Math.round((vipSubtotalCents * serviceFeeBps) / 10000),
    serviceFeeMinimumCents
  );

  const serviceFee = serviceFeeCents / 100;

  const fullPaymentTotal =
    (vipSubtotalCents + serviceFeeCents) / 100;

  return (
    <CheckoutClient
      slug={
        event.slug
      }
      vipOfferId={
        offer.id
      }
      tableNumber={
        offer.table_number
      }
      clubName={
        club.name
      }
      eventName={
        event.name
      }
      quantity={
        quantity
      }
      paymentModel="full_payment"
      salesEnabled={clubReady}
      totalPrice={
        pricePerPerson *
        quantity
      }
      totalDeposit={
        depositPerPerson *
        quantity
      }
      totalRemaining={
        remainingPerPerson *
        quantity
      }
      vipSubtotal={vipSubtotal}
      serviceFee={serviceFee}
      fullPaymentTotal={fullPaymentTotal}
    />
  );
}
