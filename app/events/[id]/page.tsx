import Link from "next/link";
import { notFound } from "next/navigation";

import { supabase } from "@/lib/supabase";

type Club = { name: string; city: string; address: string | null };
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
  status: string | null;
};
type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  music: string | null;
  image_url: string | null;
  table_map_url: string | null;
  clubs: Club | Club[] | null;
  vip_offers: VipOffer[] | null;
};

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase.from("events").select(`
    id, slug, name, event_date, start_time, music, image_url, table_map_url,
    clubs (name, city, address),
    vip_offers (id, table_number, total_table_price, capacity, confirmation_threshold, price_per_person, deposit_per_person, remaining_per_person, spots_reserved, booking_deadline, status)
  `).eq("slug", id).eq("status", "published").single();

  if (error || !data) {
    console.error("Erreur chargement événement :", error);
    notFound();
  }

  const event = data as EventItem;
  const club = Array.isArray(event.clubs) ? event.clubs[0] : event.clubs;
  const offers = [...(event.vip_offers ?? [])].sort((a, b) => a.table_number.localeCompare(b.table_number, "fr", { numeric: true }));
  if (!club || offers.length === 0) notFound();

  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${event.event_date}T12:00:00`));
  const now = new Date().getTime();

  return (
    <main className="bg-ink">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-10 lg:px-10">
        <Link href="/events" className="inline-flex text-sm text-muted transition hover:text-cream">← Explorer les soirées</Link>

        <section className="relative mt-5 overflow-hidden rounded-[1.5rem] bg-surface ring-1 ring-inset ring-white/[0.08] sm:mt-7" aria-labelledby="event-title">
          <div className="relative aspect-[16/10] min-h-[23rem] sm:aspect-[16/8] lg:min-h-[31rem]">
            {event.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.image_url} alt={event.name} className="h-full w-full object-cover" />
            ) : <div className="image-fallback h-full w-full" aria-hidden="true" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
              <p className="eyebrow text-champagne-light">{date} · {event.start_time.slice(0, 5)}</p>
              <h1 id="event-title" className="mt-3 font-display text-4xl leading-none tracking-[-0.03em] text-cream sm:text-6xl">{club.name}</h1>
              <p className="mt-2 text-base text-white/75 sm:text-lg">{club.city.toUpperCase()} · {event.name}</p>
            </div>
          </div>
        </section>

        <section className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-b border-white/[0.08] pb-5 text-sm text-muted" aria-label="Détails de la soirée">
          {event.music && <InfoItem label="Musique" value={event.music} />}
          <InfoItem label="Date" value={date} />
          <InfoItem label="Heure" value={event.start_time.slice(0, 5)} />
          {club.address && <InfoItem label="Adresse" value={club.address} />}
        </section>

        {event.table_map_url && (
          <section className="mt-9" aria-labelledby="map-title">
            <div className="flex items-baseline justify-between gap-4"><h2 id="map-title" className="font-display text-2xl text-cream">Plan du club</h2><span className="text-xs text-muted">Repères des tables</span></div>
            <div className="mt-4 max-h-[30rem] overflow-hidden rounded-[1.25rem] bg-surface p-3 ring-1 ring-inset ring-white/[0.07]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.table_map_url} alt="Plan du club" className="mx-auto max-h-[28rem] w-full object-contain" />
            </div>
          </section>
        )}

        <section className="mt-10" aria-labelledby="tables-title">
          <div className="flex items-end justify-between gap-4">
            <div><p className="eyebrow text-champagne">Ta place</p><h2 id="tables-title" className="mt-2 font-display text-3xl text-cream">Tables disponibles</h2></div>
            <p className="hidden text-sm text-muted sm:block">Réserve uniquement les places dont tu as besoin.</p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {offers.map((offer) => {
              const capacity = Number(offer.capacity);
              const reserved = Number(offer.spots_reserved);
              const remaining = Math.max(capacity - reserved, 0);
              const full = remaining === 0;
              const deadlinePassed = offer.booking_deadline ? new Date(offer.booking_deadline).getTime() <= now : false;
              const available = !full && !deadlinePassed;
              const percentage = capacity > 0 ? Math.min((reserved / capacity) * 100, 100) : 0;
              return (
                <article key={offer.id} className="rounded-[1.2rem] bg-surface p-4 ring-1 ring-inset ring-white/[0.07] transition hover:bg-[#151515] sm:p-5">
                  <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">K-RÉ</p><h3 className="mt-1 font-display text-2xl text-cream">{offer.table_number}</h3></div><p className="text-right text-sm text-muted">{remaining}/{capacity}<br /><span className="text-xs">places libres</span></p></div>
                  <div className="mt-5 flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-muted">Prix / personne</p><p className="mt-1 text-2xl font-semibold text-cream">{money(Number(offer.price_per_person))} €</p></div><p className="text-right text-xs text-muted">Deposit {money(Number(offer.deposit_per_person))} €<br />puis {money(Number(offer.remaining_per_person))} €</p></div>
                  <div className="mt-4 h-1 overflow-hidden rounded-full bg-[#111111]/[0.08]" aria-label={`${reserved} places réservées sur ${capacity}`}><div className="h-full rounded-full bg-champagne" style={{ width: `${percentage}%` }} /></div>
                  {available ? <Link href={`/booking/${event.slug}?table=${offer.id}`} className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-champagne px-5 text-sm font-semibold text-ink transition hover:bg-champagne-light">Réserver ma place <span className="ml-2" aria-hidden="true">→</span></Link> : <span className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-[#111111]/[0.07] text-sm text-muted">{deadlinePassed ? "Réservations terminées" : "Complet"}</span>}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[0.65rem] uppercase tracking-[0.15em] text-muted">{label}</p><p className="mt-1 text-cream">{value}</p></div>;
}
