import Link from "next/link";
import KreLogo from "@/components/KreLogo";

export type ExplorerEvent = {
  id: string; slug: string; name: string; event_date: string; start_time: string; music: string | null; image_url?: string | null;
  clubs: { name: string; city: string } | { name: string; city: string }[] | null;
  vip_offers: { table_number?: string; capacity: number; price_per_person: number; spots_reserved: number }[] | null;
};
function clubFrom(event: ExplorerEvent) { return Array.isArray(event.clubs) ? event.clubs[0] : event.clubs; }
export default function EventCard({ event, featured = false }: { event: ExplorerEvent; featured?: boolean }) {
  const club = clubFrom(event); const offers = event.vip_offers ?? []; if (!club || offers.length === 0) return null;
  const offer = [...offers].sort((a,b)=>Number(a.price_per_person)-Number(b.price_per_person))[0];
  const remaining = Math.max(Number(offer.capacity) - Number(offer.spots_reserved), 0);
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${event.event_date}T12:00:00`));
  return (
    <Link href={`/events/${event.slug}`} className={`kr-event-link ${featured ? "kr-event-link-featured" : ""}`}>
      <article className={`kr-event-card ${featured ? "kr-event-featured" : ""}`}>
        <div className="kr-event-media">
          {event.image_url ? <img src={event.image_url} alt="" loading={featured ? "eager" : "lazy"}/> : <div className="kr-photo-fallback"><KreLogo variant="fallback" /></div>}
          <div className="kr-event-shade"/>
        </div>
        <div className="kr-event-top"><span>{featured ? "Ce soir" : date}</span><span>{event.start_time?.slice(0,5)}</span></div>
        <div className="kr-event-content">
          <p className="eyebrow kr-event-date">{date} · {club.city}</p>
          <h2>{club.name}</h2>
          <p className="kr-event-name">{event.name}</p>
          <div className="kr-event-meta">
            {event.music && <span>♫ {event.music}</span>}
            <span>{remaining} place{remaining > 1 ? "s" : ""} libre{remaining > 1 ? "s" : ""}</span>
            <span className="kr-event-price">Dès {Number(offer.price_per_person).toFixed(0)} € / pers.</span>
          </div>
        </div>
        <span className="kr-event-arrow" aria-hidden="true">↗</span>
      </article>
    </Link>
  );
}
