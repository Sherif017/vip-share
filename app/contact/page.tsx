export default function ContactPage() {
  return (
    <main className="kre-customer min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">

        <p className="eyebrow text-champagne">
          K-RÉ
        </p>

        <h1 className="mt-3 font-display text-4xl text-cream sm:text-5xl">
          Nous contacter
        </h1>

        <div className="mt-10 space-y-8">

          <div className="rounded-2xl border border-white/[0.08] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-champagne">
              Une question ?
            </p>
            <a
              href="mailto:contact@k-re.org"
              className="mt-2 block text-lg text-cream transition hover:text-champagne"
            >
              contact@k-re.org
            </a>
          </div>

          <div className="rounded-2xl border border-white/[0.08] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-champagne">
              Vous représentez un club ou un établissement ?
            </p>
            <a
              href="mailto:clubs@k-re.org"
              className="mt-2 block text-lg text-cream transition hover:text-champagne"
            >
              clubs@k-re.org
            </a>
          </div>

          <div className="rounded-2xl border border-white/[0.08] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-champagne">
              Besoin d&apos;aide avec une réservation ?
            </p>
            <a
              href="mailto:support@k-re.org"
              className="mt-2 block text-lg text-cream transition hover:text-champagne"
            >
              support@k-re.org
            </a>
          </div>

        </div>
      </section>
    </main>
  );
}
