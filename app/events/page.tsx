import EventCard, { type ExplorerEvent } from "@/components/EventCard";
import FilterChip from "@/components/ui/FilterChip";
import PageContainer from "@/components/ui/PageContainer";
import SectionHeader from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";

export default async function EventsPage() {
  const { data, error } = await supabase
    .from("events")
    .select(`
      id, slug, name, event_date, start_time, music, image_url,
      clubs (name, city),
      vip_offers (capacity, price_per_person, spots_reserved)
    `)
    .eq("status", "published")
    .order("event_date", { ascending: true });

  if (error) {
    console.error("Erreur Supabase :", error);
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-ink px-5 text-center">
        <div><p className="eyebrow text-champagne">K-RÉ</p><h1 className="mt-3 font-display text-3xl text-cream">Les soirées se préparent.</h1><p className="mt-3 text-muted">Réessaie dans quelques instants.</p></div>
      </main>
    );
  }

  const events = (data ?? []) as ExplorerEvent[];

  return (
    <main className="bg-ink">
      <PageContainer className="py-8 sm:py-12 lg:py-16">
        <section aria-labelledby="events-title" className="max-w-2xl">
          <p className="eyebrow text-champagne">Explorer · Paris</p>
          <h1 id="events-title" className="mt-4 font-display text-4xl tracking-[-0.03em] text-cream sm:text-6xl">Trouve ta soirée.</h1>
          <p className="mt-5 text-base leading-7 text-muted sm:text-lg">Les meilleures tables VIP, une place à la fois.</p>
        </section>

        <div className="mt-8 flex gap-2 overflow-x-auto pb-1" aria-label="Filtres d’exploration">
          <FilterChip active>Tous</FilterChip><FilterChip>Clubs</FilterChip><FilterChip>Soirées</FilterChip><FilterChip>Tables VIP</FilterChip>
        </div>

        <section className="mt-12" aria-labelledby="upcoming-title">
          <SectionHeader eyebrow={`${events.length} soirée${events.length > 1 ? "s" : ""}`} title="À l’affiche" />
          {events.length === 0 ? (
            <div className="mt-5 rounded-[1.35rem] bg-surface p-10 text-center ring-1 ring-inset ring-white/[0.07]"><p className="text-muted">Aucune soirée disponible pour le moment.</p></div>
          ) : (
            <div id="upcoming-title" className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => <EventCard key={event.id} event={event} />)}
            </div>
          )}
        </section>
      </PageContainer>
    </main>
  );
}
