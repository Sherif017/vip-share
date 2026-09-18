export default function PrivacyPage() {
  return (
    <main className="kre-customer min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">

        <p className="eyebrow text-champagne">
          K-RÉ
        </p>

        <h1 className="mt-3 font-display text-4xl text-cream sm:text-5xl">
          Politique de confidentialité
        </h1>

        <div className="mt-10 space-y-10 text-muted leading-relaxed">

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Données collectées
            </h2>

            <p>
              Dans le cadre de l&apos;utilisation de
              K-RÉ, certaines informations peuvent
              être collectées, notamment :
            </p>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>prénom et nom ;</li>
              <li>adresse email ;</li>
              <li>numéro de téléphone ;</li>
              <li>informations liées aux réservations ;</li>
              <li>informations liées au compte utilisateur.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Utilisation des données
            </h2>

            <p>
              Ces données sont principalement utilisées
              pour :
            </p>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>gérer les comptes utilisateurs ;</li>
              <li>traiter les réservations ;</li>
              <li>générer les pass VIP ;</li>
              <li>gérer l&apos;accès aux événements ;</li>
              <li>assurer le support client ;</li>
              <li>sécuriser la plateforme.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Paiements
            </h2>

            <p>
              Les paiements sont traités par Stripe.
              K-RÉ ne stocke pas directement les
              données complètes de carte bancaire.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Hébergement et services techniques
            </h2>

            <p>
              K-RÉ utilise notamment des services
              techniques fournis par Supabase, Vercel
              et Stripe.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Conservation
            </h2>

            <p>
              Les données sont conservées pendant la
              durée nécessaire au fonctionnement du
              service et au respect des obligations
              applicables.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Vos droits
            </h2>

            <p>
              Vous pouvez contacter K-RÉ pour toute
              demande concernant l&apos;accès, la
              rectification ou la suppression de vos
              données personnelles.
            </p>

            <p className="mt-3">
              Contact :
              <span className="ml-1 text-white">
                [TODO : adresse de contact TAVYX à compléter]
              </span>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Mise à jour
            </h2>

            <p>
              Cette politique peut être mise à jour afin
              de tenir compte de l&apos;évolution du
              service ou des obligations applicables.
            </p>
          </section>

        </div>
      </section>
    </main>
  );
}