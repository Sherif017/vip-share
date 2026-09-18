import {
  notFound,
} from "next/navigation";

import {
  supabase,
} from "@/lib/supabase";

import CheckoutClient from "./CheckoutClient";

type Club = {
  name: string;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;

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

        clubs (
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
    />
  );
}
