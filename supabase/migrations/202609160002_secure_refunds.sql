begin;

create table if not exists public.vip_refunds (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_type text not null check (payment_type in ('initial_deposit','supplement')),
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  stripe_refund_id text,
  amount integer,
  currency text not null default 'eur',
  status text not null default 'refund_pending'
    check (status in ('refund_pending','refunding','refunded')),
  reason text,
  requested_at timestamptz not null default clock_timestamp(),
  requested_by uuid references public.profiles(id),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id),
  last_error text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  unique (reservation_id, payment_type)
);
alter table public.vip_refunds enable row level security;
revoke all on public.vip_refunds from public, anon, authenticated;
revoke all on public.vip_refunds from service_role;

create or replace function public.prepare_vip_refund(
  p_reservation_id uuid, p_requested_by uuid, p_reason text default null
) returns setof public.vip_refunds
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reservations%rowtype;
begin
  select * into r from public.reservations where id = p_reservation_id for update;
  if r.id is null then raise exception 'Réservation introuvable.'; end if;
  if r.refunded_at is not null then
    return query select * from public.vip_refunds where reservation_id = r.id order by payment_type;
    return;
  end if;
  if r.stripe_checkout_session_id is not null then
    insert into public.vip_refunds(reservation_id,payment_type,stripe_session_id,reason,requested_by)
    values (r.id,'initial_deposit',r.stripe_checkout_session_id,p_reason,p_requested_by)
    on conflict (reservation_id,payment_type) do update set reason=coalesce(excluded.reason,vip_refunds.reason);
  end if;
  if coalesce(r.supplement_stripe_session_id,r.stripe_supplement_session_id) is not null then
    insert into public.vip_refunds(reservation_id,payment_type,stripe_session_id,reason,requested_by)
    values (r.id,'supplement',coalesce(r.supplement_stripe_session_id,r.stripe_supplement_session_id),p_reason,p_requested_by)
    on conflict (reservation_id,payment_type) do update set reason=coalesce(excluded.reason,vip_refunds.reason);
  end if;
  return query select * from public.vip_refunds where reservation_id = r.id order by payment_type;
end $$;

create or replace function public.claim_vip_refund(
  p_refund_id uuid, p_admin_user_id uuid
) returns public.vip_refunds
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.vip_refunds%rowtype;
begin
  select * into v from public.vip_refunds where id = p_refund_id for update;
  if v.id is null then raise exception 'Remboursement introuvable.'; end if;
  if v.status = 'refunded' then return v; end if;
  if v.status = 'refunding' then return v; end if;
  update public.vip_refunds set status='refunding', processed_by=p_admin_user_id,
    attempt_count=attempt_count+1, last_error=null where id=v.id returning * into v;
  return v;
end $$;

create or replace function public.complete_vip_refund(
  p_refund_id uuid, p_stripe_refund_id text, p_payment_intent_id text,
  p_amount integer, p_processed_by uuid
) returns public.vip_refunds
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.vip_refunds%rowtype; remaining integer;
begin
  select * into v from public.vip_refunds where id=p_refund_id for update;
  if v.id is null then raise exception 'Remboursement introuvable.'; end if;
  if v.status='refunded' then return v; end if;
  update public.vip_refunds set status='refunded', stripe_refund_id=coalesce(stripe_refund_id,p_stripe_refund_id),
    stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id), amount=coalesce(amount,p_amount),
    processed_at=clock_timestamp(), processed_by=p_processed_by, last_error=null where id=v.id returning * into v;
  select count(*) into remaining from public.vip_refunds where reservation_id=v.reservation_id and status <> 'refunded';
  if remaining=0 then update public.reservations set refunded_at=coalesce(refunded_at,clock_timestamp()), status='refunded' where id=v.reservation_id; end if;
  return v;
end $$;

create or replace function public.fail_vip_refund(p_refund_id uuid, p_error text)
returns public.vip_refunds language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.vip_refunds%rowtype;
begin
  update public.vip_refunds set status='refund_pending', last_error=left(p_error,2000) where id=p_refund_id returning * into v;
  return v;
end $$;

revoke all on function public.prepare_vip_refund(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.claim_vip_refund(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_vip_refund(uuid,text,text,integer,uuid) from public,anon,authenticated;
revoke all on function public.fail_vip_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_vip_refund(uuid,uuid,text) to service_role;
grant execute on function public.claim_vip_refund(uuid,uuid) to service_role;
grant execute on function public.complete_vip_refund(uuid,text,text,integer,uuid) to service_role;
grant execute on function public.fail_vip_refund(uuid,text) to service_role;
commit;
