import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CheckoutClient from "./CheckoutClient";

type Club = {
  name: string;
};

type VipOffer = {
  capacity: number;
  spots_reserved: number;
  price_per_person: number;
  deposit_per_person: number;
  remaining_per_person: number;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;

  clubs:
    | Club
    | Club[]
    | null;

  vip_offers:
    | VipOffer[]
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
    quantity?: string;
  }>;
}) {
  const { id } = await params;

  const query =
    await searchParams;

  const quantity =
    Number(query.quantity ?? 1);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    notFound();
  }

  const { data, error } =
    await supabase
      .from("events")
      .select(`
        id,
        slug,
        name,
        clubs (
          name
        ),
        vip_offers (
          capacity,
          spots_reserved,
          price_per_person,
          deposit_per_person,
          remaining_per_person
        )
      `)
      .eq("slug", id)
      .eq("status", "published")
      .single();

  if (error || !data) {
    console.error(
      "Erreur checkout :",
      error
    );

    notFound();
  }

  const event =
    data as EventItem;

  const club =
    Array.isArray(event.clubs)
      ? event.clubs[0]
      : event.clubs;

  const offer =
    event.vip_offers?.[0];

  if (!club || !offer) {
    notFound();
  }

  const availableSpots =
    Number(offer.capacity) -
    Number(offer.spots_reserved);

  if (
    quantity >
    availableSpots
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
      slug={event.slug}
      clubName={club.name}
      eventName={event.name}
      quantity={quantity}
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