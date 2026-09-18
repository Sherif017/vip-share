export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-3xl px-6 py-14">

        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
          VIP Share
        </p>

        <h1 className="text-4xl font-bold">
          Conditions de réservation
        </h1>

        <div className="mt-10 space-y-10 text-zinc-400 leading-relaxed">

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              1. Objet
            </h2>

            <p>
              VIP Share permet à plusieurs participants
              de réserver individuellement des places
              au sein d&apos;une même table VIP proposée
              pour un événement partenaire.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              2. Réservation
            </h2>

            <p>
              L&apos;utilisateur sélectionne un événement,
              le nombre de places souhaitées et procède
              au paiement du Deposit indiqué lors
              de la réservation.
            </p>

            <p className="mt-3">
              Une réservation n&apos;est considérée comme
              confirmée qu&apos;après validation du
              paiement du Deposit.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              3. Prix
            </h2>

            <p>
              Le prix total d&apos;une place ainsi que
              le Deposit à payer immédiatement sont
              indiqués avant validation de la réservation.
            </p>

            <p className="mt-3">
              Le montant restant est payé sur place,
              selon les modalités indiquées pour
              l&apos;événement concerné.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              4. Tables partagées
            </h2>

            <p>
              Les utilisateurs de VIP Share réservent
              des places individuelles sur une table
              pouvant être partagée avec d&apos;autres
              participants.
            </p>

            <p className="mt-3">
              La réservation d&apos;une ou plusieurs
              places ne constitue pas la réservation
              privative de l&apos;ensemble de la table.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              5. Nombre de participants
            </h2>

            <p>
              Certaines offres peuvent être soumises à
              un nombre minimum de participants afin que
              la table partagée soit maintenue.
            </p>

            <p className="mt-3">
              Lorsque cette condition s&apos;applique,
              elle est indiquée sur la page de
              l&apos;événement.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              6. Présentation du pass
            </h2>

            <p>
              Après confirmation de la réservation,
              l&apos;utilisateur reçoit un pass VIP
              associé à sa réservation.
            </p>

            <p className="mt-3">
              Ce pass peut être demandé lors de
              l&apos;arrivée dans l&apos;établissement.
            </p>

            <p className="mt-3">
              L&apos;utilisateur est responsable de la
              confidentialité de son QR code et de sa
              référence de réservation.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              7. Annulation
            </h2>

            <p>
              Les conditions d&apos;annulation et de
              remboursement applicables sont celles
              indiquées au moment de la réservation.
            </p>

            <p className="mt-3">
              Lorsqu&apos;un remboursement est dû,
              celui-ci est effectué selon les modalités
              précisées par VIP Share.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              8. Accès à l&apos;établissement
            </h2>

            <p>
              La possession d&apos;une réservation VIP
              ne dispense pas les participants du
              respect du règlement intérieur et des
              règles de sécurité de l&apos;établissement.
            </p>

            <p className="mt-3">
              Les participants doivent notamment se
              conformer aux conditions d&apos;âge et aux
              obligations légales applicables.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              9. Paiement
            </h2>

            <p>
              Les paiements en ligne sont traités via
              Stripe.
            </p>

            <p className="mt-3">
              VIP Share ne conserve pas directement les
              données complètes de carte bancaire des
              utilisateurs.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">
              10. Contact
            </h2>

            <p>
              Pour toute question concernant une
              réservation :
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
