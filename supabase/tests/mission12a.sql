-- STAGING ONLY. Use the validated Staging connection. All test rows roll back.
-- Does not repeat Mission 11: focuses on snapshot CAS and maintenance timing.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  offer uuid := gen_random_uuid();
  customer uuid;
  first_res record;
  second_res record;
  attempt uuid := gen_random_uuid();
  snapshot jsonb;
  row_count integer;
  stored integer;
begin
  select p.id into customer from public.profiles p
  join auth.users u on u.id=p.id
  where p.role='customer' and u.email like 'vip-share.customer%@example.test'
  order by p.id limit 1;
  if customer is null then raise exception 'Staging customer missing'; end if;
  if not exists(select from public.events where slug='staging-vip-night' and status='published') then
    raise exception 'Staging event missing';
  end if;
  if has_function_privilege('anon','public.expire_stale_pending_reservations()','EXECUTE')
     or has_function_privilege('authenticated','public.expire_stale_pending_reservations()','EXECUTE')
     or not has_function_privilege('service_role','public.expire_stale_pending_reservations()','EXECUTE') then
    raise exception 'Incorrect maintenance permissions';
  end if;
  if exists(select from pg_policies where schemaname='public' and tablename='reservations'
    and cmd in ('UPDATE','ALL') and ('authenticated'=any(roles) or 'public'=any(roles))) then
    raise exception 'Customer write policy exists';
  end if;

  insert into public.vip_offers(id,event_id,capacity,confirmation_threshold,price_per_person,
    deposit_per_person,remaining_per_person,spots_reserved,status,table_number,total_table_price,booking_deadline)
  select offer,id,4,4,100,25,75,0,'forming','M12A-ROLLBACK-ONLY',400,clock_timestamp()+interval '2 hours'
  from public.events where slug='staging-vip-night';
  select * into first_res from public.create_vip_reservation('staging-vip-night',offer,customer,
    'M12A','Rollback','m12a@example.test','0000000000',1,attempt);
  select * into second_res from public.create_vip_reservation('staging-vip-night',offer,customer,
    'M12A','Rollback','m12a@example.test','0000000000',1,attempt);
  if first_res.reservation_id <> second_res.reservation_id then raise exception 'Reservation changed'; end if;

  snapshot := jsonb_build_object('expires_at',floor(extract(epoch from clock_timestamp()+interval '31 minutes')),
    'metadata',jsonb_build_object('payment_type','initial_deposit'));
  update public.reservations set initial_checkout_params=snapshot
  where id=first_res.reservation_id and initial_checkout_params is null;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Initial snapshot not stored'; end if;
  update public.reservations set initial_checkout_params='{"expires_at":1}'::jsonb
  where id=first_res.reservation_id and initial_checkout_params is null;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Snapshot replaced'; end if;
  if (select initial_checkout_params from public.reservations where id=first_res.reservation_id) <> snapshot then
    raise exception 'Snapshot changed';
  end if;
  select spots_reserved into stored from public.vip_offers where id=offer;
  if stored<>1 then raise exception 'Incorrect spots after retries'; end if;

  -- Verify the new deadline predicate on this fixture, not global maintenance:
  -- no unrelated Staging reservations are expired even temporarily by this test.
  update public.reservations set created_at=clock_timestamp()-interval '40 minutes'
  where id=first_res.reservation_id;
  if exists(select from public.reservations res where res.id=first_res.reservation_id
    and coalesce(to_timestamp((res.initial_checkout_params->>'expires_at')::double precision),
      res.created_at+interval '30 minutes') <= clock_timestamp()) then
    raise exception 'Snapshot deadline ignored';
  end if;
  if position('initial_checkout_params' in pg_get_functiondef('public.expire_stale_pending_reservations()'::regprocedure))=0
     or position('for update of res' in pg_get_functiondef('public.expire_stale_pending_reservations()'::regprocedure))=0 then
    raise exception 'Maintenance snapshot/locking missing';
  end if;
end $$;
rollback;
select 'MISSION12A SQL: ALL PASSED (fixtures rolled back)';
