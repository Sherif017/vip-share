import Link from "next/link";
export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-6">
        <nav className="flex items-center justify-between py-6">
          <div className="text-xl font-bold tracking-tight">
            VIP SHARE
          </div>

          <Link
            href="/login"
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium transition hover:border-white/40 hover:bg-white/10"
          >
            Se connecter
          </Link>
        </nav>

        <div className="flex flex-1 flex-col justify-center py-20">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/50">
              Shared VIP Experiences
            </p>

            <h1 className="text-5xl font-bold leading-tight md:text-7xl">
              La table VIP.
              <br />
              Sans payer toute la table.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/60">
              Rejoins d&apos;autres personnes et réserve ta place dans une
              table VIP des meilleurs clubs.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
  href="/events"
  className="rounded-full bg-white px-7 py-4 text-center font-semibold text-black transition hover:bg-white/80"
>
  Découvrir les soirées
</Link>

              <button className="rounded-full border border-white/20 px-7 py-4 font-semibold transition hover:border-white/40">
                Comment ça marche ?
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 py-6 text-sm text-white/40">
          Paris · Malta · More cities soon
        </div>
      </section>
    </main>
  );
}