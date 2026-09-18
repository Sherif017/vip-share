import {
  notFound,
} from "next/navigation";

import {
  supabase,
} from "@/lib/supabase";

import BookingClient from "./BookingClient";

type Club = {
  name: string;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;

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

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    table?: string;
  }>;
}) {
  const { id } =
    await params;

  const query =
    await searchParams;

  const tableId =
    query.table?.trim();

  if (!tableId) {
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
      "Erreur événement booking :",
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
      "Erreur table booking :",
      offerError
    );

    notFound();
  }

  const offer =
    offerData as VipOffer;

  return (
    <BookingClient
      slug={event.slug}
      clubName={
        club.name
      }
      eventName={
        event.name
      }
      eventDate={
        event.event_date
      }
      startTime={
        event.start_time
      }
      vipOfferId={
        offer.id
      }
      tableNumber={
        offer.table_number
      }
      capacity={Number(
        offer.capacity
      )}
      spotsReserved={Number(
        offer.spots_reserved
      )}
      pricePerPerson={Number(
        offer.price_per_person
      )}
      depositPerPerson={Number(
        offer.deposit_per_person
      )}
      remainingPerPerson={Number(
        offer.remaining_per_person
      )}
      bookingDeadline={
        offer.booking_deadline
      }
    />
  );
}