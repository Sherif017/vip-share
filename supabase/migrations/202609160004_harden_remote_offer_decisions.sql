begin;

create or replace function public.admin_accept_vip_offer_as_is(
  p_vip_offer_id uuid, p_admin_user_id uuid, p_note text default null
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.vip_offers%rowtype;
begin
  select * into v_offer from public.vip_offers where id=p_vip_offer_id for update;
  if not found then raise exception 'VIP offer not found: %', p_vip_offer_id; end if;
  if v_offer.status='confirmed' and v_offer.admin_decision='accept_as_is' then return 'confirmed'; end if;
  if v_offer.status <> 'admin_review' then raise exception 'VIP offer cannot be accepted from status %', v_offer.status; end if;
  if exists (select 1 from public.reservations where vip_offer_id=p_vip_offer_id and supplement_status='paid') then raise exception 'A supplement has already been paid for this VIP offer'; end if;
  update public.vip_offers set status='confirmed', admin_decision='accept_as_is', admin_decision_at=now(), admin_decision_by=p_admin_user_id, admin_decision_note=nullif(trim(p_note),''), decision_started_at=null, decision_expires_at=null, decision_snapshot_count=null, decision_price_per_person=null, decision_supplement_per_person=null, decision_original_price_per_person=null where id=p_vip_offer_id;
  update public.reservations set decision_choice=null, decision_at=null, supplement_amount=null, supplement_status=null, refund_requested_at=null where vip_offer_id=p_vip_offer_id and status in ('confirmed','checked_in') and supplement_status is distinct from 'paid';
  return 'confirmed';
end $$;

create or replace function public.admin_start_vip_offer_supplement(
  p_offer_id uuid, p_admin_user_id uuid, p_expires_at timestamptz default (now() + interval '24 hours')
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offer public.vip_offers%rowtype; v_count integer; v_new numeric(10,2); v_supp numeric(10,2);
begin
  select * into v_offer from public.vip_offers where id=p_offer_id for update;
  if not found then raise exception 'Table introuvable.'; end if;
  if v_offer.status <> 'admin_review' then raise exception 'La table doit être en attente de décision administrateur.'; end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Échéance invalide.'; end if;
  select coalesce(sum(quantity),0)::integer into v_count from public.reservations where vip_offer_id=v_offer.id and status in ('confirmed','checked_in');
  if v_count <= 0 then raise exception 'Aucun participant confirmé sur cette table.'; end if;
  v_new := round((v_offer.total_table_price / v_count)::numeric,2); v_supp := round((v_new-v_offer.price_per_person)::numeric,2);
  if v_supp <= 0 then raise exception 'Aucun supplément n''est nécessaire pour cette table.'; end if;
  update public.vip_offers set status='decision_pending', admin_decision='supplement', admin_decision_at=now(), admin_decision_by=p_admin_user_id, decision_started_at=now(), decision_expires_at=p_expires_at, decision_snapshot_count=v_count, decision_price_per_person=v_new, supplement_per_person=v_supp where id=v_offer.id;
  update public.reservations set decision_choice=null, decision_choice_at=null, supplement_amount=round((v_supp*quantity)::numeric,2), supplement_status='pending', supplement_paid_at=null, supplement_stripe_session_id=null where vip_offer_id=v_offer.id and status in ('confirmed','checked_in');
  return jsonb_build_object('success',true,'offer_id',v_offer.id,'snapshot_count',v_count,'original_price_per_person',v_offer.price_per_person,'new_price_per_person',v_new,'supplement_per_person',v_supp,'expires_at',p_expires_at);
end $$;

revoke all on function public.admin_accept_vip_offer_as_is(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.admin_start_vip_offer_supplement(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_accept_vip_offer_as_is(uuid,uuid,text) to service_role;
grant execute on function public.admin_start_vip_offer_supplement(uuid,uuid,timestamptz) to service_role;
commit;
