import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Club = {
  name: string;
  city: string;
};

type VipOffer = {
  capacity: number;
  confirmation_threshold: number;
  price_per_person: number;
  deposit_per_person: number;
  remaining_per_person: number;
  spots_reserved: number;
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

export default async function EventsPage() {
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
        city
      ),
      vip_offers (
        capacity,
        confirmation_threshold,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        spots_reserved
      )
    `)
    .eq("status", "published")
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Erreur Supabase :", error);

    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">
            Impossible de charger les soirées
          </h1>

          <p className="text-zinc-400">
            Réessaie dans quelques instants.
          </p>
        </div>
      </main>
    );
  }

  const events = (data ?? []) as EventItem[];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="max-w-6xl mx-auto px-6 py-14">
        <div className="mb-12">
          <p className="text-sm tracking-[0.3em] text-zinc-500 uppercase mb-3">
            VIP Share
          </p>

          <h1 className="text-4xl md:text-5xl font-bold">
            Les prochaines soirées
          </h1>

          <p className="mt-4 text-zinc-400 max-w-2xl">
            Réserve ta place sur une table VIP et partage le coût
            avec d&apos;autres participants.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="border border-zinc-800 rounded-3xl p-10 text-center bg-zinc-950">
            <p className="text-zinc-400">
              Aucune soirée disponible pour le moment.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => {
              const club = Array.isArray(event.clubs)
                ? event.clubs[0]
                : event.clubs;

              const offer = event.vip_offers?.[0];

              if (!club || !offer) {
                return null;
              }

              const capacity = Number(offer.capacity);
              const reserved = Number(offer.spots_reserved);

              const percentage =
                capacity > 0
                  ? Math.min((reserved / capacity) * 100, 100)
                  : 0;

              const remainingSpots = Math.max(
                capacity - reserved,
                0
              );

              const formattedDate = new Intl.DateTimeFormat(
                "fr-FR",
                {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }
              ).format(new Date(`${event.event_date}T12:00:00`));

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="group block"
                >
                  <article className="h-full rounded-3xl border border-zinc-800 bg-zinc-950 p-6 transition duration-300 hover:border-zinc-600 hover:-translate-y-1">
                    <div className="flex items-start justify-between gap-4 mb-7">
                      <div>
                        <p className="text-sm text-zinc-500 mb-2">
                          {club.city}
                        </p>

                        <h2 className="text-2xl font-semibold">
                          {club.name}
                        </h2>

                        <p className="text-zinc-400 mt-1">
                          {event.name}
                        </p>
                      </div>

                      <div className="rounded-full bg-white text-black px-3 py-1 text-xs font-semibold">
                        VIP
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-zinc-400 mb-7">
                      <p className="capitalize">
                        {formattedDate}
                      </p>

                      <p>
                        {event.start_time.slice(0, 5)}
                      </p>

                      {event.music && (
                        <p>{event.music}</p>
                      )}
                    </div>

                    <div className="border-t border-zinc-800 pt-6">
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
                            Prix / personne
                          </p>

                          <p className="text-3xl font-bold">
                            {Number(
                              offer.price_per_person
                            ).toFixed(0)}
                            €
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-zinc-500">
                            Acompte
                          </p>

                          <p className="font-semibold">
                            {Number(
                              offer.deposit_per_person
                            ).toFixed(0)}
                            €
                          </p>
                        </div>
                      </div>

                      <div className="mb-3 flex justify-between text-sm">
                        <span className="text-zinc-400">
                          {reserved}/{capacity} participants
                        </span>

                        <span
                          className={
                            remainingSpots <= 2
                              ? "text-orange-400"
                              : "text-zinc-400"
                          }
                        >
                          {remainingSpots} place
                          {remainingSpots > 1 ? "s" : ""} restante
                          {remainingSpots > 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>

                      <div className="mt-6 flex justify-between items-center">
                        <p className="text-xs text-zinc-500">
                          Confirmation à partir de{" "}
                          {offer.confirmation_threshold} participants
                        </p>

                        <span className="text-sm font-medium group-hover:translate-x-1 transition-transform">
                          Voir →
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}