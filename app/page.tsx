import Link from "next/link";

export default function HomePage() {
  return (
    <main className="bg-black text-white">

      {/* =========================================================
          HERO
      ========================================================== */}

      <section className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl flex-col px-6">

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
              Rejoins d&apos;autres personnes et réserve
              ta place dans une table VIP des meilleurs
              clubs.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">

              <Link
                href="/events"
                className="rounded-full bg-white px-7 py-4 text-center font-semibold text-black transition hover:bg-zinc-200"
              >
                Découvrir les soirées
              </Link>

              <a
                href="#comment-ca-marche"
                className="rounded-full border border-white/20 px-7 py-4 text-center font-semibold transition hover:border-white/40 hover:bg-white/5"
              >
                Comment ça marche ?
              </a>

            </div>

          </div>

        </div>

        <div className="border-t border-white/10 py-6 text-sm text-white/40">
          Paris · Malta · More cities soon
        </div>

      </section>

      {/* =========================================================
          COMMENT ÇA MARCHE
      ========================================================== */}

      <section
        id="comment-ca-marche"
        className="scroll-mt-24 border-t border-white/10"
      >

        <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">

          {/* TITRE */}

          <div className="max-w-2xl">

            <p className="mb-4 text-sm uppercase tracking-[0.3em] text-white/40">
              Simple et rapide
            </p>

            <h2 className="text-4xl font-bold md:text-5xl">
              Comment ça marche ?
            </h2>

            <p className="mt-5 text-lg leading-8 text-zinc-400">
              Profite d&apos;une expérience VIP sans avoir
              à réserver une table entière.
            </p>

          </div>

          {/* ÉTAPES */}

          <div className="mt-16 grid gap-5 md:grid-cols-3">

            {/* 01 */}

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 md:p-8">

              <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 text-sm font-semibold">
                01
              </div>

              <h3 className="text-xl font-semibold">
                Choisis ta soirée
              </h3>

              <p className="mt-3 leading-7 text-zinc-400">
                Découvre les prochaines soirées et les
                tables VIP disponibles dans les clubs
                partenaires.
              </p>

            </div>

            {/* 02 */}

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 md:p-8">

              <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 text-sm font-semibold">
                02
              </div>

              <h3 className="text-xl font-semibold">
                Réserve tes places
              </h3>

              <p className="mt-3 leading-7 text-zinc-400">
                Choisis le nombre de places dont tu as
                besoin et paie uniquement le Deposit
                en ligne.
              </p>

            </div>

            {/* 03 */}

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 md:p-8">

              <div className="mb-10 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 text-sm font-semibold">
                03
              </div>

              <h3 className="text-xl font-semibold">
                Profite de ta table VIP
              </h3>

              <p className="mt-3 leading-7 text-zinc-400">
                Présente ton pass VIP à ton arrivée,
                retrouve les autres participants et
                profite de la soirée.
              </p>

            </div>

          </div>

          {/* EXPLICATION PRIX */}

          <div className="mt-16 rounded-3xl border border-zinc-800 bg-zinc-950 p-8 md:p-10">

            <div className="grid gap-8 md:grid-cols-2 md:items-center">

              <div>

                <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
                  Le principe
                </p>

                <h3 className="mt-3 text-3xl font-bold">
                  Partage la table.
                  <br />
                  Pas la qualité.
                </h3>

              </div>

              <div className="space-y-4 text-zinc-400">

                <p>
                  Une table VIP coûte normalement plusieurs
                  centaines ou milliers d&apos;euros.
                </p>

                <p>
                  Avec VIP Share, le coût est réparti entre
                  plusieurs participants. Tu ne réserves
                  donc que le nombre de places dont tu as
                  réellement besoin.
                </p>

                <p className="font-medium text-white">
                  Tu connais toujours le prix avant de
                  réserver.
                </p>

              </div>

            </div>

          </div>

          {/* CTA */}

          <div className="mt-16 text-center">

            <h3 className="text-3xl font-bold">
              Prêt pour ta prochaine soirée ?
            </h3>

            <Link
              href="/events"
              className="mt-7 inline-block rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-zinc-200"
            >
              Voir les soirées
            </Link>

          </div>

        </div>

      </section>

    </main>
  );
}
