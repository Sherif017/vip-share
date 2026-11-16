begin;

alter table public.clubs
  add column stripe_connection_type text,
  add column stripe_oauth_connected_at timestamptz,
  add column stripe_oauth_revoked_at timestamptz;

alter table public.clubs
  add constraint clubs_stripe_connection_type_check
  check (
    stripe_connection_type is null
    or stripe_connection_type in ('express', 'oauth')
  );

-- Les comptes existants conservent leur fonctionnement.
-- Leur type sera confirme lors de leur verification.

comment on column public.clubs.stripe_connection_type is
  'Type de connexion Stripe : express ou oauth.';

comment on column public.clubs.stripe_oauth_connected_at is
  'Date de la derniere association OAuth valide.';

comment on column public.clubs.stripe_oauth_revoked_at is
  'Date de revocation Stripe OAuth.';

-- Une autorisation revoquee ne doit jamais permettre
-- de nouveaux paiements ou reversements.

alter table public.clubs
  add constraint clubs_stripe_revocation_safety_check
  check (
    stripe_oauth_revoked_at is null
    or (
      stripe_charges_enabled is false
      and stripe_payouts_enabled is false
    )
  );

notify pgrst, 'reload schema';


create or replace function public.link_club_stripe_oauth_account(
  p_club_id uuid,
  p_user_id uuid,
  p_expected_account_id text,
  p_stripe_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.clubs%rowtype;
begin

  -- 1. Verification des parametres

  if p_stripe_account_id is null
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$'
  then
    raise exception 'Compte Stripe invalide.'
      using errcode = '22023';
  end if;

  -- 2. Verification des permissions

  if p_user_id is null or not (
    exists (
      select 1
      from public.profiles
      where id = p_user_id
        and role = 'manager'
    )
    or exists (
      select 1
      from public.club_memberships
      where user_id = p_user_id
        and club_id = p_club_id
        and role = 'admin'
        and status = 'active'
    )
  ) then
    raise exception 'Acces refuse.'
      using errcode = '42501';
  end if;

  -- 3. Verrouillage du club

  select *
  into v_club
  from public.clubs
  where id = p_club_id
  for update;

  if not found then
    raise exception 'Club introuvable.';
  end if;

  -- 4. Protection contre les modifications concurrentes

  if v_club.stripe_account_id
     is distinct from p_expected_account_id
  then
    raise exception 'Le compte Stripe du club a change.'
      using errcode = '55000';
  end if;

  -- 5. Protection des comptes deja operationnels

  if v_club.stripe_charges_enabled is true
     or v_club.stripe_payouts_enabled is true
     or v_club.stripe_details_submitted is true
     or v_club.stripe_onboarding_status = 'complete'
  then
    raise exception 'Ce compte Stripe ne peut pas etre remplace.'
      using errcode = '55000';
  end if;

  -- 6. Protection de l'historique financier

  if exists (
    select 1
    from public.payment_transactions
    where club_id = p_club_id
  ) then
    raise exception 'Ce club possede deja un historique financier.'
      using errcode = '55000';
  end if;

  -- 7. Protection contre les doubles associations

  if exists (
    select 1
    from public.clubs
    where stripe_account_id = p_stripe_account_id
      and id <> p_club_id
  ) then
    raise exception 'Ce compte Stripe est deja associe.'
      using errcode = '23505';
  end if;

  -- 8. Association du compte verifie par le serveur

  update public.clubs
  set
    stripe_account_id = p_stripe_account_id,
    stripe_connection_type = 'oauth',
    stripe_oauth_connected_at = clock_timestamp(),
    stripe_oauth_revoked_at = null,
    stripe_onboarding_status = 'complete',
    stripe_charges_enabled = true,
    stripe_payouts_enabled = true,
    stripe_details_submitted = true,
    stripe_account_updated_at = clock_timestamp()
  where id = p_club_id;

  return jsonb_build_object(
    'success', true,
    'club_id', p_club_id,
    'stripe_account_id', p_stripe_account_id
  );

end;
$$;

revoke all on function
  public.link_club_stripe_oauth_account(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function
  public.link_club_stripe_oauth_account(uuid, uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
