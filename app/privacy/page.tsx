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

        <p className="mt-4 text-sm text-zinc-500">
          Dernière mise à jour : 23 septembre 2026.
        </p>

        <div className="mt-10 space-y-10 text-muted leading-relaxed">

          <section>
            <p>
              La présente politique explique quelles données
              personnelles K-RÉ collecte, pourquoi, pendant
              combien de temps, et quels droits vous pouvez
              exercer, conformément au Règlement Général sur
              la Protection des Données (RGPD) et à la loi
              Informatique et Libertés.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Responsable du traitement
            </h2>

            <p>
              Les données sont traitées par TAVYX, société
              en cours de constitution, éditrice du service
              K-RÉ. Les coordonnées complètes figurent dans
              les{" "}
              <span className="text-white">mentions légales</span>.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Données collectées
            </h2>

            <p>
              Selon votre utilisation de K-RÉ, nous collectons :
            </p>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <span className="text-white">Identification :</span>{" "}
                prénom, nom, adresse email, numéro de téléphone ;
              </li>
              <li>
                <span className="text-white">Compte :</span>{" "}
                identifiants de connexion, rôle (client, club,
                manager) ;
              </li>
              <li>
                <span className="text-white">Réservations :</span>{" "}
                événement, table, nombre de places, montants,
                statut de la réservation, pass VIP et historique
                de check-in ;
              </li>
              <li>
                <span className="text-white">Paiement :</span>{" "}
                données de transaction transmises par Stripe
                (K-RÉ ne reçoit et ne stocke jamais le numéro
                complet de carte bancaire) ;
              </li>
              <li>
                <span className="text-white">Techniques :</span>{" "}
                adresse IP, journaux de connexion, identifiants
                de session, données de navigation nécessaires
                au bon fonctionnement du service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Finalités et bases légales
            </h2>

            <p>
              Chaque traitement repose sur une base légale
              précise :
            </p>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <span className="text-white">
                  Création et gestion du compte, traitement des
                  réservations, génération des pass VIP
                </span>{" "}
                — exécution du contrat qui nous lie à vous ;
              </li>
              <li>
                <span className="text-white">
                  Facturation, conservation des justificatifs de
                  paiement
                </span>{" "}
                — respect d&apos;une obligation légale (droit
                comptable et fiscal) ;
              </li>
              <li>
                <span className="text-white">
                  Sécurisation de la plateforme, prévention de la
                  fraude, amélioration du service
                </span>{" "}
                — intérêt légitime de K-RÉ, proportionné à cet
                objectif ;
              </li>
              <li>
                <span className="text-white">
                  Communications liées à votre réservation
                  (confirmation, rappels, informations sur
                  l&apos;événement)
                </span>{" "}
                — exécution du contrat ;
              </li>
              <li>
                <span className="text-white">
                  Prospection commerciale, le cas échéant
                </span>{" "}
                — consentement, que vous pouvez retirer à tout
                moment.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Paiements
            </h2>

            <p>
              Les paiements sont traités par Stripe, qui agit
              en tant que sous-traitant pour le compte de K-RÉ.
              K-RÉ ne stocke pas directement les données
              complètes de carte bancaire ; celles-ci sont
              gérées exclusivement par Stripe, certifié PCI-DSS.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Destinataires et sous-traitants
            </h2>

            <p>
              Vos données peuvent être transmises aux
              prestataires techniques suivants, dans la stricte
              limite nécessaire au fonctionnement du service :
            </p>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <span className="text-white">Supabase</span> —
                hébergement de la base de données et
                authentification ;
              </li>
              <li>
                <span className="text-white">Vercel</span> —
                hébergement de l&apos;application ;
              </li>
              <li>
                <span className="text-white">Stripe</span> —
                traitement des paiements ;
              </li>
              <li>
                les <span className="text-white">clubs partenaires</span>{" "}
                concernés, pour les seules informations
                nécessaires au contrôle d&apos;accès à leur
                événement (nom, nombre de places, statut du
                pass).
              </li>
            </ul>

            <p className="mt-4">
              K-RÉ ne vend ni ne loue vos données personnelles
              à des tiers à des fins commerciales.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Transferts hors Union européenne
            </h2>

            <p>
              Certains de nos prestataires techniques peuvent
              héberger ou traiter des données en dehors de
              l&apos;Union européenne. Lorsque c&apos;est le
              cas, ces transferts sont encadrés par les
              garanties prévues par le RGPD (notamment les
              clauses contractuelles types de la Commission
              européenne).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Durée de conservation
            </h2>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                Données de compte : pendant toute la durée
                d&apos;utilisation du service, puis 3 ans à
                compter de la dernière activité ;
              </li>
              <li>
                Données de réservation et de facturation : 10
                ans, conformément aux obligations comptables
                applicables ;
              </li>
              <li>
                Journaux techniques et données de connexion :
                12 mois maximum ;
              </li>
              <li>
                Données liées à un litige ou une réclamation :
                jusqu&apos;à la résolution complète du litige,
                dans la limite des délais de prescription
                applicables.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Cookies et traceurs
            </h2>

            <p>
              K-RÉ utilise uniquement des cookies strictement
              nécessaires au fonctionnement du service
              (maintien de la session, authentification). Ces
              cookies ne requièrent pas de consentement
              préalable au titre de la réglementation
              applicable. K-RÉ n&apos;utilise actuellement
              aucun cookie publicitaire ni traceur de mesure
              d&apos;audience tiers. Si cela évoluait, cette
              politique serait mise à jour et un recueil de
              consentement serait mis en place le cas échéant.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Sécurité
            </h2>

            <p>
              K-RÉ met en œuvre des mesures techniques et
              organisationnelles raisonnables pour protéger vos
              données : chiffrement des échanges (HTTPS),
              contrôle d&apos;accès par rôle, hébergement chez
              des prestataires reconnus (Supabase, Vercel,
              Stripe). Aucun système n&apos;étant infaillible,
              nous vous invitons à nous signaler toute
              vulnérabilité constatée.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Vos droits
            </h2>

            <p>
              Conformément au RGPD, vous disposez des droits
              suivants sur vos données personnelles :
            </p>

            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>droit d&apos;accès ;</li>
              <li>droit de rectification ;</li>
              <li>droit à l&apos;effacement ;</li>
              <li>droit à la limitation du traitement ;</li>
              <li>droit d&apos;opposition ;</li>
              <li>droit à la portabilité de vos données ;</li>
              <li>
                droit de définir des directives relatives au
                sort de vos données après votre décès.
              </li>
            </ul>

            <p className="mt-4">
              Pour exercer ces droits, contactez-nous à
              l&apos;adresse indiquée ci-dessous. Une réponse
              vous sera apportée dans un délai maximum d&apos;un
              mois.
            </p>

            <p className="mt-4">
              Vous disposez également du droit d&apos;introduire
              une réclamation auprès de la Commission Nationale
              de l&apos;Informatique et des Libertés (CNIL) —{" "}
              <span className="text-white">www.cnil.fr</span>.
            </p>

            <p className="mt-4">
              Contact :
              <span className="ml-1 text-white">
                [TODO : adresse de contact à compléter]
              </span>
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-cream">
              Mise à jour
            </h2>

            <p>
              Cette politique peut être mise à jour afin de
              tenir compte de l&apos;évolution du service, des
              prestataires utilisés ou des obligations légales
              applicables. La date de dernière mise à jour est
              indiquée en haut de cette page.
            </p>
          </section>

        </div>
      </section>
    </main>
  );
}
