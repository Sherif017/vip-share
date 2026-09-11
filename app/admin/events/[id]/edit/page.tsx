import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

import EditEventForm from "./EditEventForm";

type EventData = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  music: string | null;

  vip_offers:
    | {
        id: string;
        capacity: number;
        confirmation_threshold: number;
        price_per_person: number;
        deposit_per_person: number;
        remaining_per_person: number;
        spots_reserved: number;
      }[]
    | null;
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    redirect("/events");
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .select(`
      id,
      slug,
      name,
      event_date,
      start_time,
      music,
      vip_offers (
        id,
        capacity,
        confirmation_threshold,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        spots_reserved
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "Erreur récupération event :",
      error
    );
  }

  if (!data) {
    notFound();
  }

  const event =
    data as unknown as EventData;

  const offer =
    event.vip_offers?.[0];

  if (!offer) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
          VIP Share · Admin
        </p>

        <h1 className="mt-3 text-4xl font-bold">
          Modifier la soirée
        </h1>

        <p className="mt-3 text-zinc-400">
          Modifie les informations de la soirée et de son offre VIP.
        </p>

        <div className="mt-10">
          <EditEventForm
            eventId={event.id}
            initialValues={{
              name: event.name,
              slug: event.slug,
              eventDate: event.event_date,
              startTime:
                event.start_time?.slice(0, 5) ??
                "",
              music:
                event.music ?? "",
              capacity:
                Number(
                  offer.capacity
                ),
              confirmationThreshold:
                Number(
                  offer.confirmation_threshold
                ),
              pricePerPerson:
                Number(
                  offer.price_per_person
                ),
              depositPerPerson:
                Number(
                  offer.deposit_per_person
                ),
              spotsReserved:
                Number(
                  offer.spots_reserved
                ),
            }}
          />
        </div>
      </div>
    </main>
  );
}