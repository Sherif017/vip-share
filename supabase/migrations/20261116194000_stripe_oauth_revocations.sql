begin;

create table public.stripe_oauth_revocations (
  stripe_event_id text primary key
    check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),

  stripe_account_id text not null
    check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),

  revoked_at timestamptz not null,

  received_at timestamptz not null
    default clock_timestamp()
);

create index stripe_oauth_revocations_account_idx
  on public.stripe_oauth_revocations (
    stripe_account_id,
    revoked_at desc
  );

alter table public.stripe_oauth_revocations
  enable row level security;

revoke all on table public.stripe_oauth_revocations
  from public, anon, authenticated;

grant select, insert
  on table public.stripe_oauth_revocations
  to service_role;

comment on table public.stripe_oauth_revocations is
  'Registre des evenements de revocation Stripe OAuth.';

notify pgrst, 'reload schema';

commit;
