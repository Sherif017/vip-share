-- Mission 9 corrective migration.
-- Fixes the PL/pgSQL record/table-alias name collision in the pending-payment
-- maintenance function. No business transition is changed.
begin;

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
    join public.vip_offers as offer_row
      on offer_row.id = res.vip_offer_id
    where res.status = 'pending_payment'
      -- The Checkout Session is created for 30 minutes; booking_deadline is
      -- the table deadline and must not prolong an unpaid payment hold.
      and res.created_at + interval '30 minutes' <= clock_timestamp()
  loop
    -- The existing RPC owns the row locks, counter release and idempotent
    -- pending_payment -> payment_expired transition.
    perform public.expire_vip_reservation(v_reservation.id);
    v_expired := v_expired + 1;
  end loop;

  return v_expired;
end;
$$;

revoke all on function public.expire_stale_pending_reservations() from public, anon, authenticated;
grant execute on function public.expire_stale_pending_reservations() to service_role;

commit;
