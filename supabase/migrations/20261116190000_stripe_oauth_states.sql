begin;

create table public.stripe_oauth_states (
  id uuid primary key default gen_random_uuid(),

  state_hash text not null unique
    check (state_hash ~ '^[a-f0-9]{64}$'),

  club_id uuid not null
    references public.clubs(id) on delete cascade,

  user_id uuid not null
    references public.profiles(id) on delete cascade,

  expected_account_id text,

  created_at timestamptz not null default now(),

  expires_at timestamptz not null
    default (now() + interval '10 minutes'),

  consumed_at timestamptz,

  constraint stripe_oauth_states_expiry_check
    check (expires_at > created_at)
);

create index stripe_oauth_states_club_idx
  on public.stripe_oauth_states (club_id);

create index stripe_oauth_states_expiry_idx
  on public.stripe_oauth_states (expires_at);

alter table public.stripe_oauth_states
  enable row level security;

revoke all on table public.stripe_oauth_states
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.stripe_oauth_states
  to service_role;

create or replace function public.consume_stripe_oauth_state(
  p_state_hash text,
  p_user_id uuid
)
returns setof public.stripe_oauth_states
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.stripe_oauth_states
  set consumed_at = clock_timestamp()
  where state_hash = p_state_hash
    and user_id = p_user_id
    and consumed_at is null
    and expires_at > clock_timestamp()
  returning *;
$$;

revoke all on function
  public.consume_stripe_oauth_state(text, uuid)
  from public, anon, authenticated;

grant execute on function
  public.consume_stripe_oauth_state(text, uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
