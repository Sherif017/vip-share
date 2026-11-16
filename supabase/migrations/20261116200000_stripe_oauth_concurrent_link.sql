begin;

-- Supprimer l'ancienne signature pour eviter
-- tout contournement de la nouvelle protection.

drop function public.link_club_stripe_oauth_account(
  uuid, uuid, text, text
);

create or replace function public.link_club_stripe_oauth_account(
  p_club_id uuid,
  p_user_id uuid,
  p_expected_account_id text,
  p_stripe_account_id text,
  p_state_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.clubs%rowtype;
  v_state public.stripe_oauth_states%rowtype;
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

  -- Verification de la session OAuth consommee

  select *
  into v_state
  from public.stripe_oauth_states
  where id = p_state_id
    and club_id = p_club_id
    and user_id = p_user_id
    and expected_account_id
        is not distinct from p_expected_account_id
    and consumed_at is not null
    and expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception 'Session OAuth invalide.'
      using errcode = '55000';
  end if;

  -- Verrou partage avec le traitement des revocations

  perform pg_advisory_xact_lock(
    hashtextextended(
      'kre:stripe:oauth:' || p_stripe_account_id,
      0
    )
  );

  -- Refuser toute revocation pendant la tentative OAuth

  if exists (
    select 1
    from public.stripe_oauth_revocations
    where stripe_account_id = p_stripe_account_id
      and revoked_at + interval '1 second'
          > v_state.created_at
  ) then
    raise exception 'Revocation Stripe pendant la connexion.'
      using errcode = '55000';
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

  -- 5. Reconnexion ou nouvelle association

  if v_club.stripe_connection_type = 'oauth' then

    if v_club.stripe_oauth_revoked_at is null
       or v_club.stripe_account_id
          is distinct from p_stripe_account_id
    then
      raise exception 'Reconnexion Stripe non autorisee.'
        using errcode = '55000';
    end if;

  else

    if v_club.stripe_charges_enabled is true
       or v_club.stripe_payouts_enabled is true
       or v_club.stripe_details_submitted is true
       or v_club.stripe_onboarding_status = 'complete'
    then
      raise exception 'Ce compte Stripe ne peut pas etre remplace.'
        using errcode = '55000';
    end if;

    if exists (
      select 1
      from public.payment_transactions
      where club_id = p_club_id
    ) then
      raise exception 'Ce club possede deja un historique financier.'
        using errcode = '55000';
    end if;

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

  -- Interdire une ancienne session apres une reconnexion

  if v_club.stripe_oauth_connected_at is not null
     and v_club.stripe_oauth_connected_at >= v_state.created_at
  then
    raise exception 'Session OAuth obsolete.'
      using errcode = '55000';
  end if;

  -- 8. Association du compte verifie par le serveur

  update public.clubs
  set
    stripe_account_id = p_stripe_account_id,
    stripe_connection_type = 'oauth',
    stripe_oauth_connected_at = v_state.created_at,
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
  public.link_club_stripe_oauth_account(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;

grant execute on function
  public.link_club_stripe_oauth_account(uuid, uuid, text, text, uuid)
  to service_role;


notify pgrst, 'reload schema';

commit;
