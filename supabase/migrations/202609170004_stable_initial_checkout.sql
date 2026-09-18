-- Persist the first Checkout request before contacting Stripe.
begin;

alter table public.reservations
  add column initial_checkout_params jsonb;

comment on column public.reservations.initial_checkout_params is
  'Server-only write-once Checkout request snapshot; contains no API secrets. Reuse verbatim for the reservation idempotency key.';

-- Existing RLS permits authenticated users to SELECT their own reservations,
-- not UPDATE them. The application writes this column via service_role only.
-- No new grants or RPCs. Keep the existing maintenance RPC and permissions.
create or replace function public.expire_stale_pending_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation record;
  v_expired integer := 0;
begin
  for v_reservation in
    select res.id
    from public.reservations as res
    join public.vip_offers as offer_row on offer_row.id = res.vip_offer_id
    where res.status = 'pending_payment'
      and coalesce(
        to_timestamp((res.initial_checkout_params ->> 'expires_at')::double precision),
        res.created_at + interval '30 minutes'
      ) <= clock_timestamp()
    for update of res
  loop
    perform public.expire_vip_reservation(v_reservation.id);
    v_expired := v_expired + 1;
  end loop;
  return v_expired;
end;
$$;

revoke all on function public.expire_stale_pending_reservations() from public, anon, authenticated;
grant execute on function public.expire_stale_pending_reservations() to service_role;

commit;
