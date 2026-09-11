export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-6 py-14">

        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
          VIP Share
        </p>

        <h1 className="text-4xl font-bold">
          Politique de confidentialité
        </h1>

        <div className="mt-10 space-y-10 text-zinc-400 leading-relaxed">

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Données collectées
            </h2>

            <p>
              Dans le cadre de l&apos;utilisation de
              VIP Share, certaines informations peuvent
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
            <h2 className="mb-3 text-xl font-semibold text-white">
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
            <h2 className="mb-3 text-xl font-semibold text-white">
              Paiements
            </h2>

            <p>
              Les paiements sont traités par Stripe.
              VIP Share ne stocke pas directement les
              données complètes de carte bancaire.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              Hébergement et services techniques
            </h2>

            <p>
              VIP Share utilise notamment des services
              techniques fournis par Supabase, Vercel
              et Stripe.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
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
            <h2 className="mb-3 text-xl font-semibold text-white">
              Vos droits
            </h2>

            <p>
              Vous pouvez contacter VIP Share pour toute
              demande concernant l&apos;accès, la
              rectification ou la suppression de vos
              données personnelles.
            </p>

            <p className="mt-3">
              Contact :
              <span className="ml-1 text-white">
                [EMAIL DE CONTACT]
              </span>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
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