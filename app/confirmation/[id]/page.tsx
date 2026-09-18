import {
  notFound,
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

import ConfirmationClient from "./ConfirmationClient";
import RefreshStatus from "./RefreshStatus";
import { isPassAccessible } from "@/lib/vip-status";

type VipOffer = {
  id: string;
  table_number: string;
  capacity: number;
  spots_reserved: number;
};

type Reservation = {
  id: string;
  reservation_code: string;
  firstname: string;
  quantity: number;

  total_price: number;
  deposit_paid: number;
  remaining_amount: number;

  status: string;

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

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data,
    error,
  } =
    await supabase
      .from("reservations")
      .select(`
        id,
        reservation_code,
        firstname,
        quantity,
        total_price,
        deposit_paid,
        remaining_amount,
        status,

        vip_offers (
          id,
          table_number,
          capacity,
          spots_reserved
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
        "reservation_code",
        id
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Erreur récupération réservation :",
      error
    );

    notFound();
  }

  if (!data) {
    notFound();
  }

  const reservation =
    data as unknown as Reservation;

  const event =
    Array.isArray(
      reservation.events
    )
      ? reservation.events[0]
      : reservation.events;

  if (!event) {
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

  const offer =
    Array.isArray(
      reservation.vip_offers
    )
      ? reservation.vip_offers[0]
      : reservation.vip_offers;

  if (!offer) {
    notFound();
  }

  if (
    reservation.status ===
    "pending_payment"
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <RefreshStatus />

        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-7 h-16 w-16 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />

          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
            K-RÉ
          </p>

          <h1 className="text-3xl font-bold md:text-4xl">
            Paiement reçu
          </h1>

          <p className="mt-4 text-zinc-400">
            Nous confirmons ta réservation avec Stripe.
          </p>

          <p className="mt-2 text-sm text-zinc-600">
            Cela prend généralement quelques secondes.
          </p>
        </div>
      </main>
    );
  }

  if (!isPassAccessible(reservation.status)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-md text-center">
          <h1 className="mb-4 text-3xl font-bold">
            Réservation non confirmée
          </h1>

          <p className="text-zinc-400">
            Cette réservation n&apos;a pas été confirmée par le paiement.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ConfirmationClient
      reservationCode={
        reservation.reservation_code
      }
      firstname={
        reservation.firstname
      }
      quantity={
        Number(
          reservation.quantity
        )
      }
      totalPrice={
        Number(
          reservation.total_price
        )
      }
      depositPaid={
        Number(
          reservation.deposit_paid
        )
      }
      remainingAmount={
        Number(
          reservation.remaining_amount
        )
      }
      status={
        reservation.status
      }
      eventSlug={
        event.slug
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
      clubName={
        club.name
      }
      clubCity={
        club.city
      }
      tableNumber={
        offer.table_number
      }
      tableParticipants={
        Number(
          offer.spots_reserved
        )
      }
      tableCapacity={
        Number(
          offer.capacity
        )
      }
    />
  );
}
