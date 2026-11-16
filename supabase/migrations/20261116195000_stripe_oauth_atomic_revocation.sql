begin;

create or replace function public.record_stripe_oauth_revocation(
  p_stripe_event_id text,
  p_stripe_account_id text,
  p_revoked_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
  v_updated integer;
begin

  -- 1. Verification des parametres

  if p_stripe_event_id is null
     or p_stripe_event_id !~ '^evt_[A-Za-z0-9]+$'
     or p_stripe_account_id is null
     or p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$'
     or p_revoked_at is null
  then
    raise exception 'Evenement Stripe invalide.'
      using errcode = '22023';
  end if;

  -- 2. Verrou transactionnel par compte Stripe

  perform pg_advisory_xact_lock(
    hashtextextended(
      'kre:stripe:oauth:' || p_stripe_account_id,
      0
    )
  );

  -- 3. Enregistrement durable et deduplication

  insert into public.stripe_oauth_revocations (
    stripe_event_id,
    stripe_account_id,
    revoked_at
  )
  values (
    p_stripe_event_id,
    p_stripe_account_id,
    p_revoked_at
  )
  on conflict (stripe_event_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'clubs_updated', 0
    );
  end if;

  -- 4. Suspension du compte concerne
  --
  -- Stripe fournit une precision a la seconde.
  -- En cas d'ambiguite temporelle, on suspend
  -- plutot que de laisser un compte revoque actif.

  update public.clubs
  set
    stripe_oauth_revoked_at = greatest(
      stripe_oauth_revoked_at,
      p_revoked_at
    ),
    stripe_charges_enabled = false,
    stripe_payouts_enabled = false,
    stripe_onboarding_status = 'pending',
    stripe_account_updated_at = clock_timestamp()
  where stripe_account_id = p_stripe_account_id
    and stripe_connection_type = 'oauth'
    and (
      stripe_oauth_connected_at is null
      or stripe_oauth_connected_at
         < p_revoked_at + interval '1 second'
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'clubs_updated', v_updated
  );

end;
$$;

revoke all on function
  public.record_stripe_oauth_revocation(
    text, text, timestamptz
  )
  from public, anon, authenticated;

grant execute on function
  public.record_stripe_oauth_revocation(
    text, text, timestamptz
  )
  to service_role;

notify pgrst, 'reload schema';

commit;
