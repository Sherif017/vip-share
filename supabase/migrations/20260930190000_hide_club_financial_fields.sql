begin;

-- ==========================================================
-- K-RÉ — Protection des données financières / Stripe
-- ==========================================================
--
-- CONTEXTE
--
-- La table public.clubs possède historiquement une policy RLS :
--
--   "Public can read clubs"
--
-- autorisant anon/authenticated à lire les lignes.
--
-- RLS protège les lignes mais PAS les colonnes.
--
-- Depuis la migration 1001, clubs contient désormais des
-- informations internes qui ne doivent jamais être exposées
-- directement via l'API publique Supabase :
--
--   commission_bps
--   stripe_account_id
--   stripe_onboarding_status
--   stripe_details_submitted
--   stripe_charges_enabled
--   stripe_payouts_enabled
--   stripe_account_updated_at
--   commission_updated_at
--   commission_updated_by
--
-- Cette migration :
--
-- 1. conserve la policy RLS historique ;
-- 2. retire le SELECT global à anon/authenticated ;
-- 3. redonne SELECT uniquement sur les colonnes non sensibles ;
-- 4. conserve l'accès complet du service_role ;
-- 5. rend les futures colonnes privées par défaut.
--
-- IMPORTANT :
-- aucune donnée n'est supprimée.
-- aucune ligne n'est modifiée.
-- ==========================================================


-- ----------------------------------------------------------
-- 1. Retirer tout SELECT global public
-- ----------------------------------------------------------

revoke select
on table public.clubs
from public, anon, authenticated;


-- ----------------------------------------------------------
-- 2. Garantir l'accès serveur complet
-- ----------------------------------------------------------

grant select
on table public.clubs
to service_role;


-- ----------------------------------------------------------
-- 3. Redonner anon/authenticated uniquement aux colonnes
--    NON sensibles actuellement existantes.
--
-- On génère volontairement la liste à partir du catalogue
-- PostgreSQL pour préserver toutes les colonnes historiques
-- publiques sans avoir à les recopier manuellement.
--
-- Les futures colonnes ne recevront PAS automatiquement
-- ce privilège : comportement secure-by-default.
-- ----------------------------------------------------------

do $$
declare
  v_column record;
begin

  for v_column in

    select
      c.column_name

    from information_schema.columns c

    where
      c.table_schema = 'public'
      and c.table_name = 'clubs'

      and c.column_name not in (
        'commission_bps',
        'stripe_account_id',
        'stripe_onboarding_status',
        'stripe_details_submitted',
        'stripe_charges_enabled',
        'stripe_payouts_enabled',
        'stripe_account_updated_at',
        'commission_updated_at',
        'commission_updated_by'
      )

    order by
      c.ordinal_position

  loop

    execute format(
      'grant select (%I) on table public.clubs to anon, authenticated',
      v_column.column_name
    );

  end loop;

end
$$;


-- ----------------------------------------------------------
-- 4. Documentation DB
-- ----------------------------------------------------------

comment on column public.clubs.commission_bps is
  'INTERNAL K-RE — commission du club en basis points. Non exposée à anon/authenticated.';

comment on column public.clubs.stripe_account_id is
  'INTERNAL K-RE — identifiant Stripe Connected Account. Non exposé à anon/authenticated.';

comment on column public.clubs.stripe_onboarding_status is
  'INTERNAL K-RE — état onboarding Stripe Connect. Non exposé à anon/authenticated.';

comment on column public.clubs.stripe_details_submitted is
  'INTERNAL K-RE — état Stripe Connect. Non exposé à anon/authenticated.';

comment on column public.clubs.stripe_charges_enabled is
  'INTERNAL K-RE — capacité Stripe à accepter des paiements. Non exposée à anon/authenticated.';

comment on column public.clubs.stripe_payouts_enabled is
  'INTERNAL K-RE — capacité Stripe à effectuer des payouts. Non exposée à anon/authenticated.';

comment on column public.clubs.stripe_account_updated_at is
  'INTERNAL K-RE — horodatage synchronisation Stripe. Non exposé à anon/authenticated.';

comment on column public.clubs.commission_updated_at is
  'INTERNAL K-RE — horodatage modification commission. Non exposé à anon/authenticated.';

comment on column public.clubs.commission_updated_by is
  'INTERNAL K-RE — administrateur ayant modifié la commission. Non exposé à anon/authenticated.';


commit;
