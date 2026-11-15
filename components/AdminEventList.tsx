"use client";

import { useState } from "react";
import Link from "next/link";
import CopyEventLinkButton from "@/components/CopyEventLinkButton";

type Club = {
  id: string;
  name: string;
  city: string;
};

type EventItem = {
  id: string;
  slug: string;
  name: string;
  event_date: string;
  start_time: string;
  status: string;
  clubs: Club | Club[] | null;
  vip_offers: {
    capacity: number;
    spots_reserved: number;
    status: string;
  }[] | null;
};

type Tab = "upcoming" | "draft" | "past";

const tabs: { id: Tab; label: string }[] = [
  { id: "upcoming", label: "À venir" },
  { id: "draft", label: "Brouillons" },
  { id: "past", label: "Historique" },
];

function getStats(events: EventItem[]) {
  const offers = events.flatMap(
    (e) => e.vip_offers ?? []
  );

  const capacity = offers.reduce(
    (sum, offer) => sum + Number(offer.capacity), 0
  );

  const reserved = offers.reduce(
    (sum, offer) => sum + Number(offer.spots_reserved), 0
  );

  return {
    capacity,
    reserved,
    rate: capacity > 0
      ? Math.round(reserved / capacity * 100)
      : 0,
    reviews: offers.filter(
      (o) => o.status === "admin_review"
    ).length,
  };
}

function getCategory(event: EventItem, today: string): Tab {
  if (event.status === "draft") return "draft";

  if (
    event.status === "published" &&
    event.event_date >= today
  ) {
    return "upcoming";
  }

  return "past";
}

export default function AdminEventList({
  events,
  today,
}: {
  events: EventItem[];
  today: string;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [reviewOnly, setReviewOnly] = useState(false);

  const upcoming = events.filter(
    (e) => getCategory(e, today) === "upcoming"
  );

  const stats = getStats(upcoming);
  const totalReviews = getStats(events).reviews;

  const filtered = events
    .filter((e) =>
      reviewOnly
        ? getStats([e]).reviews > 0
        : getCategory(e, today) === tab
    )
    .sort((a, b) => {
      const dateA = `${a.event_date}T${a.start_time || "00:00"}`;
      const dateB = `${b.event_date}T${b.start_time || "00:00"}`;

      return tab === "upcoming" && !reviewOnly
        ? dateA.localeCompare(dateB)
        : dateB.localeCompare(dateA);
    });

  return (
    <>
      <section className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
        <Metric label="À venir" value={String(upcoming.length)} />
        <Metric
          label="Places réservées"
          value={`${stats.reserved}/${stats.capacity}`}
        />
        <Metric
          label="Remplissage"
          value={`${stats.rate}%`}
        />
      </section>

      {totalReviews > 0 && (
        <button
          type="button"
          onClick={() => setReviewOnly(!reviewOnly)}
          className="mt-5 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left text-sm text-amber-400"
        >
          <span>
            {totalReviews} table{totalReviews > 1 ? "s" : ""}
            {" à examiner"}
          </span>

          <span>
            {reviewOnly ? "Tout afficher" : "Voir →"}
          </span>
        </button>
      )}

      <section className="mt-9">

        <nav className="flex gap-6 border-b border-white/10">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={!reviewOnly && tab === item.id}
              onClick={() => {
                setTab(item.id);
                setReviewOnly(false);
              }}
              className={`border-b-2 pb-3 text-sm transition ${
                !reviewOnly && tab === item.id
                  ? "border-[#d8b56a] font-medium text-champagne"
                  : "border-transparent text-muted hover:text-cream"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {reviewOnly && (
          <p className="mt-4 text-sm text-amber-400">
            Tables nécessitant votre attention
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-medium">
              Aucune soirée
            </p>
            <p className="mt-2 text-sm text-muted">
              Rien à afficher pour le moment.
            </p>

            {tab === "upcoming" && !reviewOnly && (
              <Link
                href="/admin/events/new"
                className="mt-5 inline-block text-sm text-champagne"
              >
                + Créer une soirée
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filtered.map((event) => {
              const club = Array.isArray(event.clubs)
                ? event.clubs[0]
                : event.clubs;

              const numbers = getStats([event]);

              const date = new Date(
                `${event.event_date}T12:00:00`
              );

              const status =
                event.status === "published" ? "Publiée"
                : event.status === "draft" ? "Brouillon"
                : event.status === "cancelled" ? "Annulée"
                : event.status;

              return (
                <article
                  key={event.id}
                  className="py-5 transition"
                >
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="group flex items-center gap-3 sm:gap-4"
                  >
                    <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-white/5 py-3">
                      <span className="text-xl font-semibold">
                        {date.getDate()}
                      </span>
                      <span className="text-[10px] uppercase text-muted">
                        {date.toLocaleDateString("fr-FR", {
                          month: "short",
                        })}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold transition group-hover:text-champagne">
                        {event.name}
                      </h2>

                      <p className="mt-1 truncate text-xs text-muted sm:text-sm">
                        {club?.name ?? "Club"}
                        {" · "}
                        {event.start_time?.slice(0, 5)}
                      </p>

                      {numbers.reviews > 0 && (
                        <p className="mt-1 text-xs text-amber-400">
                          {numbers.reviews} à examiner
                        </p>
                      )}
                    </div>

                    <span className={`text-xs ${
                      event.status === "published"
                        ? "text-emerald-400"
                        : "text-muted"
                    }`}>
                      {status}
                    </span>

                    <span
                      aria-hidden="true"
                      className="text-xl text-zinc-500"
                    >
                      ›
                    </span>
                  </Link>

                  <div className="mt-4 flex items-center gap-5 sm:ml-[72px]">
                    <div className="min-w-0 flex-1">

                      <div className="mb-2 flex justify-between gap-2 text-xs text-muted">
                        <span>
                          {numbers.reserved}/{numbers.capacity} places
                        </span>
                        <span>{numbers.rate}%</span>
                      </div>

                      <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-champagne"
                          style={{
                            width: `${Math.max(0, Math.min(100, numbers.rate))}%`
                          }}
                        />
                      </div>
                    </div>

                    {event.status === "published" && (
                      <CopyEventLinkButton
                        slug={event.slug}
                        compact
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.035] p-3 sm:p-5">
      <p className="text-[11px] text-muted sm:text-sm">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight sm:text-3xl">
        {value}
      </p>
    </div>
  );
}
