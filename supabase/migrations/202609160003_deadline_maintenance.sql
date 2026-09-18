begin;

-- Orchestration only: payment transitions remain in the existing RPCs whose
-- definitions are not yet versioned in this repository.
create or replace function public.expire_stale_pending_reservations()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer := 0;
begin
  for r in
    select r.id from public.reservations r
    join public.vip_offers o on o.id=r.vip_offer_id
    where r.status='pending_payment'
      -- The Checkout Session is created for 30 minutes; booking_deadline is
      -- the table deadline and must not prolong an unpaid payment hold.
      and r.created_at + interval '30 minutes' <= clock_timestamp()
  loop
    perform public.expire_vip_reservation(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.refresh_due_vip_offers()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  update public.vip_offers o set status='admin_review'
  where o.status='forming' and o.booking_deadline <= clock_timestamp()
    and coalesce(o.spots_reserved,0) < o.confirmation_threshold;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.expire_due_merge_proposals()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; n integer := 0;
begin
  for p in select source_offer_id from public.vip_merge_proposals
    where status='pending' and expires_at <= clock_timestamp()
  loop
    perform public.finalize_vip_offer_merge(p.source_offer_id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.expire_due_supplement_decisions()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; n integer := 0;
begin
  for o in select id from public.vip_offers
    where status='decision_pending' and decision_expires_at <= clock_timestamp()
  loop
    -- The existing resolver owns participant-decision semantics; no missing
    -- response is converted to maintain and no Stripe refund is attempted.
    perform public.resolve_vip_offer_decision(o.id);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.expire_stale_pending_reservations() from public,anon,authenticated;
revoke all on function public.refresh_due_vip_offers() from public,anon,authenticated;
revoke all on function public.expire_due_merge_proposals() from public,anon,authenticated;
revoke all on function public.expire_due_supplement_decisions() from public,anon,authenticated;
grant execute on function public.expire_stale_pending_reservations() to service_role;
grant execute on function public.refresh_due_vip_offers() to service_role;
grant execute on function public.expire_due_merge_proposals() to service_role;
grant execute on function public.expire_due_supplement_decisions() to service_role;
commit;
