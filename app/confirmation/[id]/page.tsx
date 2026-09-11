import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import ConfirmationClient from "./ConfirmationClient";
import RefreshStatus from "./RefreshStatus";

type Reservation = {
  id: string;
  reservation_code: string;
  firstname: string;
  quantity: number;

  total_price: number;
  deposit_paid: number;
  remaining_amount: number;

  status: string;

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
  const { id } = await params;

  /*
  |--------------------------------------------------------------------------
  | Utilisateur connecté
  |--------------------------------------------------------------------------
  */

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
  |--------------------------------------------------------------------------
  | Réservation appartenant à cet utilisateur
  |--------------------------------------------------------------------------
  */

  const { data, error } = await supabase
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
    .eq("reservation_code", id)
    .eq("user_id", user.id)
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

  /*
  |--------------------------------------------------------------------------
  | Relations Supabase
  |--------------------------------------------------------------------------
  */

  const event = Array.isArray(
    reservation.events
  )
    ? reservation.events[0]
    : reservation.events;

  if (!event) {
    notFound();
  }

  const club = Array.isArray(
    event.clubs
  )
    ? event.clubs[0]
    : event.clubs;

  if (!club) {
    notFound();
  }

  /*
  |--------------------------------------------------------------------------
  | Paiement en cours de confirmation
  |--------------------------------------------------------------------------
  */

  if (
    reservation.status ===
    "pending_payment"
  ) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <RefreshStatus />

        <div className="max-w-md w-full text-center">

          <div className="mx-auto mb-7 h-16 w-16 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />

          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
            VIP Share
          </p>

          <h1 className="text-3xl md:text-4xl font-bold">
            Paiement reçu
          </h1>

          <p className="text-zinc-400 mt-4">
            Nous confirmons ta réservation
            avec Stripe.
          </p>

          <p className="text-zinc-600 text-sm mt-2">
            Cela prend généralement quelques
            secondes.
          </p>

        </div>
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Réservation non confirmée
  |--------------------------------------------------------------------------
  */

  if (
    reservation.status !==
    "confirmed"
  ) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">

        <div className="max-w-md text-center">

          <h1 className="text-3xl font-bold mb-4">
            Réservation non confirmée
          </h1>

          <p className="text-zinc-400">
            Cette réservation n&apos;a pas
            été confirmée par le paiement.
          </p>

        </div>

      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Pass VIP
  |--------------------------------------------------------------------------
  */

  return (
    <ConfirmationClient
      reservationCode={
        reservation.reservation_code
      }
      firstname={
        reservation.firstname
      }
      quantity={
        Number(reservation.quantity)
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
    />
  );
}