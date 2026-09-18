import Link from "next/link";

import PageContainer from "@/components/ui/PageContainer";

const steps = [
  {
    number: "01",
    title: "Choisis ta soirée",
    text: "Découvre les prochaines soirées et les tables VIP disponibles dans les clubs partenaires.",
  },
  {
    number: "02",
    title: "Réserve tes places",
    text: "Choisis le nombre de places dont tu as besoin et règle uniquement le Deposit demandé en ligne.",
  },
  {
    number: "03",
    title: "Profite de ta table VIP",
    text: "Présente ta réservation à ton arrivée et profite de la soirée avec les autres participants de la table.",
  },
];

export default function HomePage() {
  return (
    <main className="bg-ink">
      <PageContainer>
        <section className="kre-landing-hero" aria-labelledby="landing-title">
          <div className="kre-landing-hero-grid">
            <div className="relative z-10 max-w-4xl">
            <p className="eyebrow text-champagne">L&apos;expérience VIP, à ta place.</p>
            <h1 id="landing-title" className="kre-landing-title">
              La table VIP.<br />
              <span>Sans payer toute la table.</span>
            </h1>
            <p className="kre-landing-lede">
              Réserve uniquement les places dont tu as besoin sur les tables VIP des clubs partenaires.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/events" className="kre-primary-cta kre-landing-cta inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 text-center text-sm font-semibold transition">
                Découvrir les soirées <span className="ml-2" aria-hidden="true">→</span>
              </Link>
              <a href="#comment-ca-marche" className="kre-landing-secondary inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 text-sm font-medium text-cream transition">
                Comment ça marche ?
              </a>
            </div>
            <div className="kre-landing-promise" aria-label="Une place, un prix clair, une table VIP">
              <span>Une place</span><i aria-hidden="true">•</i><span>Un prix clair</span><i aria-hidden="true">•</i><span>Une table VIP</span>
            </div>
            </div>
            <div className="kre-landing-orbit" aria-hidden="true">
              <span className="kre-landing-orbit-line" />
              <span className="kre-landing-orbit-ring kre-landing-orbit-ring-main" />
              <span className="kre-landing-orbit-ring kre-landing-orbit-ring-small" />
              <span className="kre-landing-orbit-mark">01</span>
              <span className="kre-landing-orbit-caption">Paris · tables VIP</span>
            </div>
          </div>
        </section>

        <section id="comment-ca-marche" className="kre-landing-section kre-landing-how scroll-mt-24" aria-labelledby="how-title">
          <div className="kre-landing-section-heading">
            <p className="eyebrow text-champagne">Simple, naturellement</p>
            <h2 id="how-title" className="mt-3 font-display text-4xl tracking-[-0.04em] text-cream sm:text-5xl">Comment ça marche ?</h2>
            <p className="mt-5 text-base leading-7 text-muted sm:text-lg">L&apos;expérience VIP sans avoir à réserver une table entière.</p>
          </div>
          <div className="kre-landing-steps">
            {steps.map((step, index) => (
              <article key={step.number} className="kre-step-card">
                <div className="flex items-start justify-between gap-4">
                  <p className="kre-step-number">{step.number}</p>
                  {index < steps.length - 1 && <span className="kre-step-connector" aria-hidden="true">↗</span>}
                </div>
                <h3 className="mt-12 text-xl font-semibold tracking-tight text-cream">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="kre-landing-section kre-landing-principle" aria-labelledby="principle-title">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start lg:gap-20">
            <div>
              <p className="eyebrow text-champagne">Le principe</p>
              <h2 id="principle-title" className="mt-3 max-w-md font-display text-4xl leading-[.98] tracking-[-0.04em] text-cream sm:text-6xl">Ta place.<br />Pas toute la table.</h2>
            </div>
            <div className="kre-principle-copy max-w-2xl space-y-5 text-base leading-7 text-muted sm:text-lg sm:leading-8">
              <p>Une table VIP peut représenter un budget important. K-RÉ permet de réserver seulement le nombre de places dont tu as réellement besoin.</p>
              <p>Le prix de ta place est affiché avant la réservation.</p>
              <p>Tu règles le Deposit en ligne, puis le montant restant est payé sur place selon les conditions de la réservation.</p>
              <p className="kre-principle-promise"><span aria-hidden="true">✓</span> Tu connais toujours le prix avant de réserver.</p>
            </div>
          </div>
        </section>

        <section className="kre-landing-final" aria-labelledby="final-title">
          <p className="eyebrow text-champagne">Ta prochaine soirée</p>
          <h2 id="final-title" className="mt-4 font-display text-4xl leading-none tracking-[-0.04em] text-cream sm:text-6xl">Ta place en VIP<br />t&apos;attend.</h2>
          <p className="mx-auto mt-5 max-w-md text-base text-muted">Découvre les prochaines tables disponibles.</p>
          <Link href="/events" className="kre-primary-cta kre-landing-cta mt-8 inline-flex min-h-12 items-center justify-center rounded-full px-7 py-3 text-sm font-semibold transition">
            Voir les soirées <span className="ml-2" aria-hidden="true">→</span>
          </Link>
        </section>
      </PageContainer>
    </main>
  );
}
