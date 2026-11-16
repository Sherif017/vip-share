-- Correction : commission_bps et les autres colonnes Stripe/commission
-- internes a K-RE/club ne doivent jamais etre lisibles par anon/authenticated,
-- meme si la policy RLS existante sur clubs ("public peut lire clubs") les
-- laissait passer en tant que colonnes de la ligne. RLS protege les LIGNES,
-- pas les COLONNES -- cette migration ajoute la restriction au niveau
-- colonne, qui elle s'applique en plus de RLS.
--
-- stripe_charges_enabled reste public : necessaire pour que l'app sache
-- si le club vend en direct (sans jamais reveler le taux de commission).
-- Purement additif, aucune donnee supprimee, aucun impact sur les 15
-- reservations legacy ni sur le workflow Stripe existant.
begin;

revoke select (
  commission_bps,
  commission_updated_at,
  commission_updated_by,
  stripe_account_id,
  stripe_account_updated_at,
  stripe_onboarding_status,
  stripe_details_submitted,
  stripe_payouts_enabled
) on public.clubs from anon, authenticated;

commit;

