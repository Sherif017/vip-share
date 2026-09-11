import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Club = {
  name: string;
  city: string;
  address: string | null;
};

type VipOffer = {
  id: string;
  capacity: number;
  confirmation_threshold: number;
  price_per_person: number;
  deposit_per_person: number;
  remaining_per_person: number;
  spots_reserved: number;
  status: string | null;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  music: string | null;
  clubs: Club | Club[] | null;
  vip_offers: VipOffer[] | null;
};

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("events")
    .select(`
      id,
      slug,
      name,
      event_date,
      start_time,
      music,
      clubs (
        name,
        city,
        address
      ),
      vip_offers (
        id,
        capacity,
        confirmation_threshold,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        spots_reserved,
        status
      )
    `)
    .eq("slug", id)
    .eq("status", "published")
    .single();

  if (error || !data) {
    console.error("Erreur chargement événement :", error);
    notFound();
  }

  const event = data as EventItem;

  const club = Array.isArray(event.clubs)
    ? event.clubs[0]
    : event.clubs;

  const offer = event.vip_offers?.[0];

  if (!club || !offer) {
    notFound();
  }

  const capacity = Number(offer.capacity);
  const reserved = Number(offer.spots_reserved);
  const remainingSpots = Math.max(capacity - reserved, 0);

  const percentage =
    capacity > 0
      ? Math.min((reserved / capacity) * 100, 100)
      : 0;

  const thresholdReached =
    reserved >= Number(offer.confirmation_threshold);

  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${event.event_date}T12:00:00`));

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="max-w-5xl mx-auto px-6 py-14">
        <Link
          href="/events"
          className="inline-block text-sm text-zinc-400 hover:text-white mb-10 transition"
        >
          ← Retour aux soirées
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <div className="mb-8">
              <p className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
                VIP Share
              </p>

              <h1 className="text-4xl md:text-5xl font-bold">
                {club.name}
              </h1>

              <p className="text-xl text-zinc-400 mt-2">
                {event.name}
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 mb-6">
              <h2 className="text-xl font-semibold mb-6">
                Informations de la soirée
              </h2>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                    Date
                  </p>
                  <p className="capitalize">
                    {formattedDate}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                    Heure
                  </p>
                  <p>{event.start_time.slice(0, 5)}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                    Ville
                  </p>
                  <p>{club.city}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                    Musique
                  </p>
                  <p>{event.music ?? "Non précisé"}</p>
                </div>

                {club.address && (
                  <div className="sm:col-span-2">
                    <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
                      Adresse
                    </p>
                    <p>{club.address}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm text-zinc-500 mb-1">
                    Offre
                  </p>
                  <h2 className="text-2xl font-semibold">
                    Table VIP partagée
                  </h2>
                </div>

                <span className="rounded-full bg-white text-black px-4 py-1.5 text-sm font-semibold">
                  VIP
                </span>
              </div>

              <p className="text-zinc-400 leading-relaxed mb-8">
                Tu réserves uniquement les places dont tu as besoin.
                Le coût de la table est partagé entre les participants.
              </p>

              <div className="mb-4 flex justify-between text-sm">
                <span className="text-zinc-300">
                  {reserved}/{capacity} participants
                </span>

                <span className="text-zinc-400">
                  {remainingSpots} place
                  {remainingSpots > 1 ? "s" : ""} restante
                  {remainingSpots > 1 ? "s" : ""}
                </span>
              </div>

              <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-zinc-800 p-4">
                {thresholdReached ? (
                  <p className="text-sm text-green-400">
                    ✓ Seuil de confirmation atteint
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400">
                    La réservation est confirmée à partir de{" "}
                    <span className="text-white font-medium">
                      {offer.confirmation_threshold} participants
                    </span>
                    .
                  </p>
                )}
              </div>
            </div>
          </div>

          <aside>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 lg:sticky lg:top-8">
              <p className="text-sm text-zinc-500 mb-2">
                Prix par personne
              </p>

              <p className="text-5xl font-bold mb-8">
                {Number(offer.price_per_person).toFixed(0)}€
              </p>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between border-b border-zinc-800 pb-4">
                  <span className="text-zinc-400">
                    À payer maintenant
                  </span>

                  <span className="font-semibold">
                    {Number(
                      offer.deposit_per_person
                    ).toFixed(0)}
                    €
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    À payer sur place
                  </span>

                  <span className="font-semibold">
                    {Number(
                      offer.remaining_per_person
                    ).toFixed(0)}
                    €
                  </span>
                </div>
              </div>

              {remainingSpots > 0 ? (
                <Link
                  href={`/booking/${event.slug}`}
                  className="block w-full rounded-2xl bg-white text-black text-center font-semibold py-4 hover:bg-zinc-200 transition"
                >
                  Réserver ma place
                </Link>
              ) : (
                <button
                  disabled
                  className="w-full rounded-2xl bg-zinc-800 text-zinc-500 font-semibold py-4 cursor-not-allowed"
                >
                  Complet
                </button>
              )}

              <p className="text-xs text-zinc-500 text-center mt-4">
                Tu ne paies que l&apos;acompte aujourd&apos;hui.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}