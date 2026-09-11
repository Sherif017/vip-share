export default function LegalPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
          VIP Share
        </p>

        <h1 className="text-4xl font-bold">
          Mentions légales
        </h1>

        <div className="mt-10 space-y-10 text-zinc-400 leading-relaxed">

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Éditeur du site
            </h2>

            <p>
              Le site VIP Share est édité par :
            </p>

            <div className="mt-3 space-y-1">
              <p>[NOM DE LA SOCIÉTÉ]</p>
              <p>[FORME JURIDIQUE]</p>
              <p>[ADRESSE DU SIÈGE SOCIAL]</p>
              <p>[NUMÉRO D&apos;IMMATRICULATION]</p>
              <p>[NUMÉRO DE TVA SI APPLICABLE]</p>
              <p>Email : [EMAIL DE CONTACT]</p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Directeur de publication
            </h2>

            <p>
              Le directeur de publication est
              [NOM DU RESPONSABLE].
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Hébergement
            </h2>

            <p>
              Le site est hébergé par Vercel Inc.
            </p>

            <p className="mt-2">
              Les services de base de données et
              d&apos;authentification sont notamment
              fournis par Supabase.
            </p>

            <p className="mt-2">
              Les paiements en ligne sont traités
              par Stripe.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Propriété intellectuelle
            </h2>

            <p>
              L&apos;ensemble des contenus présents sur
              VIP Share, notamment les textes, éléments
              graphiques, logos et interfaces, est
              protégé par les règles applicables en
              matière de propriété intellectuelle.
            </p>

            <p className="mt-3">
              Toute reproduction ou utilisation sans
              autorisation préalable est interdite,
              sauf dans les cas prévus par la loi.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Contact
            </h2>

            <p>
              Pour toute question concernant VIP Share :
            </p>

            <p className="mt-2 text-white">
              [EMAIL DE CONTACT]
            </p>
          </section>

        </div>
      </section>
    </main>
  );
}