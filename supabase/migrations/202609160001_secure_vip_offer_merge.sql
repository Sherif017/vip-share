-- Mission 2. Apply as database owner, before deploying the matching application.
-- Only merge RPCs are replaced. No other RPC or cron is changed.
-- Known argument names were read from the live PostgREST OpenAPI document.
-- Return types/bodies were unavailable: DROP without CASCADE deliberately fails
-- (and rolls back this migration) if another SQL object depends on a signature.
begin;

create table public.vip_merge_proposals (
  id uuid primary key default gen_random_uuid(),
  source_offer_id uuid not null references public.vip_offers(id),
  target_offer_id uuid not null references public.vip_offers(id),
  created_by uuid not null,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'refused', 'expired', 'invalidated')),
  source_snapshot jsonb not null,
  target_snapshot jsonb not null,
  reservation_snapshot jsonb not null,
  source_reservation_ids uuid[] not null,
  choices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique (source_offer_id, expires_at),
  check (source_offer_id <> target_offer_id)
);
create unique index vip_merge_one_pending_source
  on public.vip_merge_proposals(source_offer_id) where status = 'pending';
create unique index vip_merge_one_pending_target
  on public.vip_merge_proposals(target_offer_id) where status = 'pending';
alter table public.vip_merge_proposals enable row level security;
revoke all on public.vip_merge_proposals from public, anon, authenticated, service_role;

-- Snapshot all reservation data except the two fields written by this workflow.
create function public.vip_merge_reservation_snapshot(p_source uuid, p_target uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'merge_choice' - 'merge_choice_at' order by r.id), '[]'::jsonb)
  from public.reservations r where r.vip_offer_id in (p_source, p_target)
$$;

-- Must be called while holding the locks acquired by the public merge RPCs.
-- Fail closed for historical/unknown payment states rather than transferring debt.
create function public.vip_merge_invalid_reason(p_source uuid, p_target uuid, p_final boolean)
returns text language plpgsql set search_path = public, pg_temp as $$
declare
  s public.vip_offers%rowtype; t public.vip_offers%rowtype;
  source_count bigint; target_count bigint;
begin
  select * into s from public.vip_offers where id = p_source;
  select * into t from public.vip_offers where id = p_target;
  if s.id is null or t.id is null or s.id = t.id then return 'Tables invalides.'; end if;
  if s.event_id is distinct from t.event_id then return 'Les tables doivent appartenir à la même soirée.'; end if;
  if s.status is distinct from (case when p_final then 'merge_pending' else 'admin_review' end)
    or t.status is null or t.status not in ('forming', 'confirmed', 'admin_review')
    or t.merge_status = 'pending'
    or (not p_final and s.merge_status = 'pending') then
    return 'Une table est indisponible pour une fusion.';
  end if;
  if exists (select 1 from public.vip_offers o
      where o.merge_status = 'pending' and o.id <> p_source
        and (o.id = p_target or o.merge_target_offer_id in (p_source, p_target))) then
    return 'Une autre fusion implique déjà une de ces tables.';
  end if;
  if exists (select 1 from public.vip_merge_proposals p where p.status = 'pending'
      and p.source_offer_id <> p_source
      and (p.source_offer_id in (p_source,p_target) or p.target_offer_id in (p_source,p_target))) then
    return 'Une autre fusion est en attente.';
  end if;
  if s.price_per_person is distinct from t.price_per_person
    or s.deposit_per_person is distinct from t.deposit_per_person
    or s.remaining_per_person is distinct from t.remaining_per_person
    or s.price_per_person <= 0 or s.deposit_per_person < 0 or s.remaining_per_person < 0
    or s.price_per_person <> s.deposit_per_person + s.remaining_per_person then
    return 'Les tarifs, le Deposit et le reste à payer doivent être identiques.';
  end if;
  if exists (select 1 from public.reservations r where r.vip_offer_id in (p_source,p_target)
    and (r.status = 'checked_in' or coalesce(r.checked_in,false)
      or coalesce(r.checked_in_quantity,0) > 0 or r.checked_in_at is not null
      or r.supplement_paid_at is not null or coalesce(r.supplement_amount,0) <> 0
      or r.supplement_status is not null or r.supplement_stripe_session_id is not null
      or r.stripe_supplement_session_id is not null
      or r.status is null or r.status not in ('confirmed','cancelled','expired','refunded'))) then
    return 'Check-in, paiement ou supplément incompatible avec une fusion.';
  end if;
  if exists (select 1 from public.reservations r where r.vip_offer_id in (p_source,p_target)
    and r.status = 'confirmed' and (r.event_id is distinct from s.event_id
      or r.user_id is null or r.quantity <= 0 or r.refunded_at is not null
      or r.refund_requested_at is not null or r.decision_choice is not null
      or r.total_price <> s.price_per_person * r.quantity
      or r.deposit_paid <> s.deposit_per_person * r.quantity
      or r.remaining_amount <> s.remaining_per_person * r.quantity)) then
    return 'Une réservation possède des conditions financières incompatibles.';
  end if;
  select coalesce(sum(quantity),0) into source_count from public.reservations
    where vip_offer_id = p_source and status = 'confirmed';
  select coalesce(sum(quantity),0) into target_count from public.reservations
    where vip_offer_id = p_target and status = 'confirmed';
  if source_count = 0 or source_count >= s.confirmation_threshold then
    return 'La table source doit avoir des participants et être sous son seuil.';
  end if;
  if source_count + target_count > t.capacity then return 'Capacité de la table cible insuffisante.'; end if;
  return null;
end $$;

drop function if exists public.customer_decide_vip_offer_merge(uuid,uuid,text);
drop function if exists public.finalize_vip_offer_merge(uuid);
drop function if exists public.admin_propose_vip_offer_merge(uuid,uuid,uuid,timestamptz);

create function public.admin_propose_vip_offer_merge(
  p_source_offer_id uuid, p_target_offer_id uuid, p_admin_user_id uuid,
  p_expires_at timestamptz default (now() + interval '24 hours')
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.vip_offers%rowtype; t public.vip_offers%rowtype; reason text; participants uuid[];
begin
  -- Bounded MVP critical section. Table locks also block inserts/phantoms and
  -- writers in existing reservation/check-in RPCs that do not share our locks.
  -- All merge entrypoints use the same order. Locks last until transaction end.
  lock table public.vip_offers, public.reservations in share row exclusive mode;
  select * into s from public.vip_offers where id = p_source_offer_id;
  select * into t from public.vip_offers where id = p_target_offer_id;
  if not exists (select 1 from public.profiles where id = p_admin_user_id and role = 'manager')
    and not (exists (select 1 from public.events e join public.club_memberships m on m.club_id = e.club_id
      where e.id = s.event_id and m.user_id = p_admin_user_id and m.role = 'admin' and m.status = 'active')
      and exists (select 1 from public.events e join public.club_memberships m on m.club_id = e.club_id
      where e.id = t.event_id and m.user_id = p_admin_user_id and m.role = 'admin' and m.status = 'active')) then
    raise exception 'Accès interdit.' using errcode = '42501';
  end if;
  if p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '24 hours' then
    raise exception 'Échéance invalide.' using errcode = '22023';
  end if;
  reason := public.vip_merge_invalid_reason(p_source_offer_id,p_target_offer_id,false);
  if reason is not null then raise exception '%', reason using errcode = 'P0001'; end if;
  select array_agg(id order by id) into participants from public.reservations
    where vip_offer_id = s.id and status = 'confirmed';
  insert into public.vip_merge_proposals(source_offer_id,target_offer_id,created_by,expires_at,
    source_snapshot,target_snapshot,reservation_snapshot,source_reservation_ids)
  values (s.id,t.id,p_admin_user_id,p_expires_at,
    to_jsonb(s) - array['status','merge_status','merge_target_offer_id','merge_proposed_at','merge_expires_at'],
    to_jsonb(t),public.vip_merge_reservation_snapshot(s.id,t.id),participants);
  update public.reservations set merge_choice = null, merge_choice_at = null where id = any(participants);
  update public.vip_offers set status = 'merge_pending', merge_status = 'pending',
    merge_target_offer_id = t.id, merge_proposed_at = clock_timestamp(), merge_expires_at = p_expires_at where id = s.id;
  return jsonb_build_object('success',true,'status','pending');
end $$;

create function public.finalize_vip_offer_merge(p_source_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.vip_merge_proposals%rowtype; s public.vip_offers%rowtype; t public.vip_offers%rowtype;
  reason text; outcome text; transferred integer;
begin
  lock table public.vip_offers, public.reservations in share row exclusive mode;
  select * into p from public.vip_merge_proposals where source_offer_id = p_source_offer_id
    and status = 'pending' for update;
  if p.id is null then return jsonb_build_object('success',false,'error','Aucune fusion en attente.'); end if;
  select * into s from public.vip_offers where id = p.source_offer_id;
  select * into t from public.vip_offers where id = p.target_offer_id;
  if exists (select 1 from jsonb_each_text(p.choices) c where c.value = 'refuse') then
    outcome := 'refused'; reason := 'La fusion a été refusée. Aucun transfert effectué.';
  elsif p.expires_at <= clock_timestamp() then
    outcome := 'expired'; reason := 'La proposition a expiré. Aucun transfert effectué.';
  else
    reason := public.vip_merge_invalid_reason(s.id,t.id,true);
    if reason is null and (
      s.merge_target_offer_id is distinct from t.id or s.merge_expires_at is distinct from p.expires_at
      or s.merge_status is distinct from 'pending'
      or (to_jsonb(s) - array['status','merge_status','merge_target_offer_id','merge_proposed_at','merge_expires_at']) <> p.source_snapshot
      or to_jsonb(t) <> p.target_snapshot
      or public.vip_merge_reservation_snapshot(s.id,t.id) <> p.reservation_snapshot
    ) then reason := 'La composition ou les conditions des tables ont changé.'; end if;
    if reason is not null then outcome := 'invalidated'; end if;
  end if;
  if outcome is not null then
    update public.vip_merge_proposals set status = outcome, finished_at = clock_timestamp() where id = p.id;
    update public.vip_offers set status = 'admin_review', merge_status = null,
      merge_target_offer_id = null, merge_expires_at = null where id = p.source_offer_id;
    return jsonb_build_object('success',outcome = 'refused','status',outcome,'error',reason);
  end if;
  if exists (select 1 from unnest(p.source_reservation_ids) r(id)
    where (p.choices ->> r.id::text) is distinct from 'accept') then
    return jsonb_build_object('success',true,'status','pending');
  end if;
  -- All clients accepted this exact snapshot. This update, both counters and
  -- the terminal proposal state commit together, or all roll back on failure.
  update public.reservations set vip_offer_id = p.target_offer_id
    where id = any(p.source_reservation_ids) and vip_offer_id = p.source_offer_id and status = 'confirmed';
  get diagnostics transferred = row_count;
  if transferred <> cardinality(p.source_reservation_ids) then raise exception 'Transfert incomplet interdit.'; end if;
  update public.vip_offers o set spots_reserved = (
    select coalesce(sum(r.quantity),0) from public.reservations r
    where r.vip_offer_id = o.id and r.status in ('confirmed','checked_in','pending_payment')
  ) where o.id in (s.id,t.id);
  update public.vip_offers set status = 'merged', merge_status = null where id = s.id;
  update public.vip_offers set status = case when spots_reserved >= confirmation_threshold then 'confirmed' else status end
    where id = t.id;
  update public.vip_merge_proposals set status = 'completed', finished_at = clock_timestamp() where id = p.id;
  return jsonb_build_object('success',true,'status','completed');
end $$;

-- The three-argument signature matches the existing PostgREST contract. The
-- pending proposal and its expiry are resolved server-side from the reservation.
create function public.customer_decide_vip_offer_merge(
  p_reservation_id uuid, p_user_id uuid, p_choice text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.reservations%rowtype; p public.vip_merge_proposals%rowtype; previous text;
begin
  lock table public.vip_offers, public.reservations in share row exclusive mode;
  if p_choice is null or p_choice not in ('accept','refuse') then
    raise exception 'Choix invalide.' using errcode = '22023';
  end if;
  select * into r from public.reservations where id = p_reservation_id;
  if r.id is null or r.user_id is distinct from p_user_id or p_user_id is null then
    raise exception 'Accès interdit.' using errcode = '42501';
  end if;
  select proposal.* into p from public.vip_merge_proposals proposal
    where p_reservation_id = any(proposal.source_reservation_ids) and proposal.status = 'pending'
    order by proposal.created_at desc limit 1 for update;
  if p.id is null then
    select proposal.* into p from public.vip_merge_proposals proposal
      where p_reservation_id = any(proposal.source_reservation_ids)
      order by proposal.created_at desc limit 1 for update;
    if p.id is null then raise exception 'Proposition introuvable.' using errcode = 'P0001'; end if;
    previous := p.choices ->> p_reservation_id::text;
    if previous = p_choice and p.status in ('completed','refused') then
      return jsonb_build_object('success',true,'status',p.status,'choice',previous);
    end if;
    raise exception 'Cette proposition est terminée.' using errcode = 'P0001';
  end if;
  if p.expires_at <= clock_timestamp() then
    return public.finalize_vip_offer_merge(p.source_offer_id);
  end if;
  previous := p.choices ->> p_reservation_id::text;
  if p.status <> 'pending' then
    if previous = p_choice and p.status in ('completed','refused') then
      return jsonb_build_object('success',true,'status',p.status,'choice',previous);
    end if;
    return jsonb_build_object('success',false,'status',p.status,'error','Cette proposition est terminée.');
  end if;
  if previous is not null and previous <> p_choice then
    return jsonb_build_object('success',false,'error','Ton choix est déjà enregistré.');
  end if;
  if previous is null then
    update public.vip_merge_proposals set choices = choices || jsonb_build_object(p_reservation_id::text,p_choice)
      where id = p.id;
    update public.reservations set merge_choice = p_choice, merge_choice_at = clock_timestamp() where id = r.id;
  end if;
  return public.finalize_vip_offer_merge(p.source_offer_id) || jsonb_build_object('choice',p_choice);
end $$;

-- Browser roles cannot bypass API authentication, ownership or proposal checks.
revoke all on function public.vip_merge_reservation_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.vip_merge_invalid_reason(uuid,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.admin_propose_vip_offer_merge(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.customer_decide_vip_offer_merge(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finalize_vip_offer_merge(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_propose_vip_offer_merge(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.customer_decide_vip_offer_merge(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
