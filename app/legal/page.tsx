export default function LegalPage() {
  return (
    <main className="kre-customer min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="eyebrow text-champagne">
          K-RÉ
        </p>

        <h1 className="mt-3 font-display text-4xl text-cream sm:text-5xl">
          Mentions légales
        </h1>

        <div className="mt-10 space-y-10 text-muted leading-relaxed">

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Éditeur du site
            </h2>

            <p>
              Le site K-RÉ est édité par :
            </p>

            <div className="mt-3 space-y-1">
              <p>TAVYX</p>
              <p>[TODO : forme juridique à compléter]</p>
              <p>[TODO : adresse du siège social à compléter]</p>
              <p>[TODO : numéro d&apos;immatriculation à compléter]</p>
              <p>[TODO : numéro de TVA, si applicable]</p>
              <p>Email : [TODO : adresse de contact TAVYX à compléter]</p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Directeur de publication
            </h2>

            <p>
              Le directeur de publication est
              [TODO : directeur de publication TAVYX à compléter].
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
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
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Propriété intellectuelle
            </h2>

            <p>
              L&apos;ensemble des contenus présents sur
              K-RÉ, notamment les textes, éléments
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
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Contact
            </h2>

            <p>
              Pour toute question concernant K-RÉ :
            </p>

            <p className="mt-2 text-white">
              [TODO : adresse de contact TAVYX à compléter]
            </p>
          </section>

        </div>
      </section>
    </main>
  );
}