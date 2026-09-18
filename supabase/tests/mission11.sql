-- VIP Share Mission 11 SQL tests — STAGING ONLY.
-- Run with psql --set=ON_ERROR_STOP=1 against vip-share-staging only.
-- Every fixture is created inside one transaction and rolled back at the end.

do $$
declare expected_id uuid; matching integer; counted integer; stored integer;
begin
  if not exists (select 1 from public.events where slug = 'staging-vip-night') then
    raise exception 'MISSION11 FAIL: staging-vip-night fixture is missing';
  end if;
  if not exists (select 1 from public.profiles where role = 'customer') then
    raise exception 'MISSION11 FAIL: no Staging customer profile is available';
  end if;
  if not exists (select 1 from public.vip_offers where event_id = (select id from public.events where slug = 'staging-vip-night')) then
    raise exception 'MISSION11 FAIL: Staging VIP offers are missing';
  end if;
  select count(*) into matching
  from public.reservations
  where initial_checkout_attempt_id = '991a769e-6e66-4e1f-9eb1-32300d416080'::uuid;
  if matching <> 1 then
    raise exception 'MISSION11 FAIL: prior concurrent idempotency fixture is not unique or has the wrong reservation id';
  end if;
  select id into expected_id
  from public.reservations
  where initial_checkout_attempt_id = '991a769e-6e66-4e1f-9eb1-32300d416080'::uuid;
  if expected_id <> '75549af8-7aa2-47aa-b971-fc6e6de8e11e'::uuid then
    raise exception 'MISSION11 FAIL: prior concurrent idempotency fixture has the wrong reservation id';
  end if;
  select o.spots_reserved, coalesce(sum(case when r.status in ('confirmed','checked_in','pending_payment') then r.quantity else 0 end),0)
    into stored, counted
  from public.vip_offers o left join public.reservations r on r.vip_offer_id=o.id
  where o.id=(select vip_offer_id from public.reservations where initial_checkout_attempt_id='991a769e-6e66-4e1f-9eb1-32300d416080'::uuid)
  group by o.id, o.spots_reserved;
  if stored <> counted then raise exception 'MISSION11 FAIL: prior concurrent fixture has an inconsistent spots_reserved counter'; end if;
  raise notice 'MISSION11 PASS: Staging fixture guard';
end $$;

begin;

do $$
declare ok boolean; constraint_text text;
begin
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='reservations' and column_name='initial_checkout_attempt_id' and udt_name='uuid') into ok;
  if not ok then raise exception 'MISSION11 FAIL: initial_checkout_attempt_id is missing or not uuid'; end if;
  select exists (select 1 from pg_index i where i.indrelid='public.reservations'::regclass and i.indisunique and i.indpred is not null and pg_get_indexdef(i.indexrelid) like '%(user_id, initial_checkout_attempt_id)%' and pg_get_expr(i.indpred, i.indrelid) ilike '%initial_checkout_attempt_id IS NOT NULL%') into ok;
  if not ok then raise exception 'MISSION11 FAIL: partial unique checkout-attempt index is missing'; end if;
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_vip_reservation' and pg_get_function_identity_arguments(p.oid) = 'p_event_slug text, p_vip_offer_id uuid, p_user_id uuid, p_firstname text, p_lastname text, p_email text, p_phone text, p_quantity integer, p_checkout_attempt_id uuid') into ok;
  if not ok then raise exception 'MISSION11 FAIL: 9-argument create_vip_reservation overload is missing'; end if;
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_vip_reservation_payment' and pg_get_function_identity_arguments(p.oid) = 'p_reservation_id uuid, p_stripe_session_id text, p_amount_total integer, p_currency text') into ok;
  if not ok then raise exception 'MISSION11 FAIL: confirm_vip_reservation_payment is missing'; end if;
  if has_function_privilege('anon', 'public.create_vip_reservation(text,uuid,uuid,text,text,text,text,integer,uuid)', 'execute') or has_function_privilege('authenticated', 'public.create_vip_reservation(text,uuid,uuid,text,text,text,text,integer,uuid)', 'execute') or not has_function_privilege('service_role', 'public.create_vip_reservation(text,uuid,uuid,text,text,text,text,integer,uuid)', 'execute') then raise exception 'MISSION11 FAIL: create_vip_reservation permissions are incorrect'; end if;
  if has_function_privilege('anon', 'public.confirm_vip_reservation_payment(uuid,text,integer,text)', 'execute') or has_function_privilege('authenticated', 'public.confirm_vip_reservation_payment(uuid,text,integer,text)', 'execute') or not has_function_privilege('service_role', 'public.confirm_vip_reservation_payment(uuid,text,integer,text)', 'execute') then raise exception 'MISSION11 FAIL: confirm_vip_reservation_payment permissions are incorrect'; end if;
  select string_agg(pg_get_constraintdef(oid), ' | ') into constraint_text from pg_constraint where conrelid='public.reservations'::regclass;
  if constraint_text is null then raise exception 'MISSION11 FAIL: reservations constraints are missing'; end if;
  if constraint_text not ilike '%pending%' or constraint_text not ilike '%payment_pending%' or constraint_text not ilike '%paid%' or constraint_text not ilike '%refund_pending%' or constraint_text not ilike '%cancelled%' then raise exception 'MISSION11 FAIL: supplement_status constraint is missing a canonical state'; end if;
  raise notice 'MISSION11 PASS: structural audit and permissions';
end $$;

insert into public.vip_offers(id,event_id,capacity,confirmation_threshold,price_per_person,deposit_per_person,remaining_per_person,spots_reserved,status,table_number,total_table_price,booking_deadline)
select x.id, e.id, x.capacity, 1, 120, 30, 90, 0, 'forming', x.table_number, x.capacity*120, clock_timestamp()+interval '1 hour'
from (values
  ('51000000-0000-4000-8000-000000000001'::uuid,10,'M11-TEST-IDEMP'),
  ('51000000-0000-4000-8000-000000000002'::uuid,10,'M11-TEST-BINDING'),
  ('51000000-0000-4000-8000-000000000003'::uuid,2,'M11-TEST-LATE-AVAILABLE'),
  ('51000000-0000-4000-8000-000000000004'::uuid,1,'M11-TEST-LATE-NO-CAPACITY'),
  ('51000000-0000-4000-8000-000000000005'::uuid,2,'M11-TEST-CONFIRM-EXPIRE'),
  ('51000000-0000-4000-8000-000000000006'::uuid,2,'M11-TEST-DOUBLE-EXPIRE')
) x(id,capacity,table_number)
cross join (select id from public.events where slug='staging-vip-night' limit 1) e;

do $$
declare u uuid; a uuid := '61000000-0000-4000-8000-000000000001'; r1 record; r2 record; c integer; before_spots integer; after_spots integer;
begin
  select id into u from public.profiles where role='customer' order by id limit 1;
  select spots_reserved into before_spots from public.vip_offers where table_number='M11-TEST-IDEMP' for update;
  select * into r1 from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000001',u,'M11','Idempotence','m11-idemp@example.test','+33000000000',1,a);
  select * into r2 from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000001',u,'M11','Idempotence','m11-idemp@example.test','+33000000000',1,a);
  select count(*) into c from public.reservations where user_id=u and initial_checkout_attempt_id=a;
  select spots_reserved into after_spots from public.vip_offers where table_number='M11-TEST-IDEMP';
  if r1.reservation_id is distinct from r2.reservation_id or r1.reservation_code is distinct from r2.reservation_code or c<>1 or after_spots<>before_spots+1 then raise exception 'MISSION11 FAIL: sequential idempotence'; end if;
  raise notice 'MISSION11 PASS: sequential idempotency';
end $$;

do $$
declare u uuid; r record; result jsonb; before_status text; before_spots integer; after_spots integer; rejected boolean; msg text; session_id text := 'cs_test_m11_binding_local';
begin
  select id into u from public.profiles where role='customer' order by id limit 1;
  select * into r from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000002',u,'M11','Binding','m11-binding@example.test','+33000000001',1,'62000000-0000-4000-8000-000000000001');
  update public.reservations set stripe_checkout_session_id=session_id where id=r.reservation_id;
  select reservations.status, vip_offers.spots_reserved into before_status,before_spots from public.reservations join public.vip_offers on vip_offers.id=reservations.vip_offer_id where reservations.id=r.reservation_id;
  rejected:=false; begin perform public.confirm_vip_reservation_payment(r.reservation_id,'cs_test_m11_wrong',3000,'eur'); exception when others then rejected:=true; msg:=sqlerrm; end;
  if not rejected or msg not ilike '%Session Stripe%' then raise exception 'MISSION11 FAIL: wrong session was not rejected'; end if;
  rejected:=false; begin perform public.confirm_vip_reservation_payment(r.reservation_id,session_id,3001,'eur'); exception when others then rejected:=true; msg:=sqlerrm; end;
  if not rejected or msg not ilike '%Montant%' then raise exception 'MISSION11 FAIL: wrong amount was not rejected'; end if;
  rejected:=false; begin perform public.confirm_vip_reservation_payment(r.reservation_id,session_id,3000,'usd'); exception when others then rejected:=true; msg:=sqlerrm; end;
  if not rejected or msg not ilike '%Montant%' then raise exception 'MISSION11 FAIL: wrong currency was not rejected'; end if;
  if (select status from public.reservations where id=r.reservation_id)<>before_status or (select spots_reserved from public.vip_offers where table_number='M11-TEST-BINDING')<>before_spots then raise exception 'MISSION11 FAIL: binding rejection mutated state'; end if;
  select public.confirm_vip_reservation_payment(r.reservation_id,session_id,3000,'EUR') into result;
  if (select status from public.reservations where id=r.reservation_id)<>'confirmed' or (select paid_at from public.reservations where id=r.reservation_id) is null then raise exception 'MISSION11 FAIL: valid binding did not confirm'; end if;
  select spots_reserved into after_spots from public.vip_offers where table_number='M11-TEST-BINDING';
  select public.confirm_vip_reservation_payment(r.reservation_id,session_id,3000,'eur') into result;
  if after_spots is distinct from (select spots_reserved from public.vip_offers where table_number='M11-TEST-BINDING') then raise exception 'MISSION11 FAIL: duplicate confirmation changed counter'; end if;
  raise notice 'MISSION11 PASS: payment binding and duplicate confirmation';
end $$;

do $$
declare u uuid; r record; before_spots integer; expired_spots integer; restored_spots integer; result jsonb; sid text:='cs_test_m11_late_available';
begin
  select id into u from public.profiles where role='customer' order by id limit 1;
  select * into r from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000003',u,'M11','Late Available','m11-late-a@example.test','+33000000002',1,'63000000-0000-4000-8000-000000000001');
  update public.reservations set stripe_checkout_session_id=sid where id=r.reservation_id;
  select spots_reserved into before_spots from public.vip_offers where table_number='M11-TEST-LATE-AVAILABLE';
  perform public.expire_vip_reservation(r.reservation_id);
  select spots_reserved into expired_spots from public.vip_offers where table_number='M11-TEST-LATE-AVAILABLE';
  if (select status from public.reservations where id=r.reservation_id)<>'payment_expired' or expired_spots<>before_spots-1 then raise exception 'MISSION11 FAIL: late-available expiration'; end if;
  select public.confirm_vip_reservation_payment(r.reservation_id,sid,3000,'eur') into result;
  select spots_reserved into restored_spots from public.vip_offers where table_number='M11-TEST-LATE-AVAILABLE';
  if (select status from public.reservations where id=r.reservation_id)<>'confirmed' or restored_spots<>before_spots then raise exception 'MISSION11 FAIL: late payment did not restore one place'; end if;
  select public.confirm_vip_reservation_payment(r.reservation_id,sid,3000,'eur') into result;
  if (select spots_reserved from public.vip_offers where table_number='M11-TEST-LATE-AVAILABLE')<>restored_spots then raise exception 'MISSION11 FAIL: late-payment duplicate restored twice'; end if;
  raise notice 'MISSION11 PASS: late payment with capacity available';
end $$;

do $$
declare u uuid; a record; b record; result jsonb; sid text:='cs_test_m11_late_no_capacity';
begin
  select id into u from public.profiles where role='customer' order by id limit 1;
  select * into a from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000004',u,'M11','Late Full A','m11-late-b-a@example.test','+33000000003',1,'64000000-0000-4000-8000-000000000001');
  update public.reservations set stripe_checkout_session_id=sid where id=a.reservation_id;
  perform public.expire_vip_reservation(a.reservation_id);
  select * into b from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000004',u,'M11','Late Full B','m11-late-b-b@example.test','+33000000004',1,'64000000-0000-4000-8000-000000000002');
  update public.reservations set status='confirmed' where id=b.reservation_id;
  select public.confirm_vip_reservation_payment(a.reservation_id,sid,3000,'eur') into result;
  if (select status from public.reservations where id=a.reservation_id)<>'refund_pending' then raise exception 'MISSION11 FAIL: late no-capacity payment did not enter refund_pending'; end if;
  if (select status from public.reservations where id=b.reservation_id)<>'confirmed' then raise exception 'MISSION11 FAIL: valid filler reservation changed'; end if;
  if (select spots_reserved from public.vip_offers where table_number='M11-TEST-LATE-NO-CAPACITY')>(select capacity from public.vip_offers where table_number='M11-TEST-LATE-NO-CAPACITY') then raise exception 'MISSION11 FAIL: late no-capacity overbooked table'; end if;
  select public.confirm_vip_reservation_payment(a.reservation_id,sid,3000,'eur') into result;
  if (select status from public.reservations where id=a.reservation_id)<>'refund_pending' then raise exception 'MISSION11 FAIL: duplicate late refund state changed'; end if;
  raise notice 'MISSION11 PASS: late payment without capacity';
end $$;

do $$
declare u uuid; r record; before_spots integer; after_spots integer; sid text; result jsonb;
begin
  select id into u from public.profiles where role='customer' order by id limit 1;
  select * into r from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000005',u,'M11','Confirm First','m11-confirm-first@example.test','+33000000005',1,'65000000-0000-4000-8000-000000000001');
  sid:='cs_test_m11_confirm_first'; update public.reservations set stripe_checkout_session_id=sid where id=r.reservation_id;
  select public.confirm_vip_reservation_payment(r.reservation_id,sid,3000,'eur') into result;
  select spots_reserved into before_spots from public.vip_offers where table_number='M11-TEST-CONFIRM-EXPIRE';
  perform public.expire_vip_reservation(r.reservation_id);
  select spots_reserved into after_spots from public.vip_offers where table_number='M11-TEST-CONFIRM-EXPIRE';
  if (select status from public.reservations where id=r.reservation_id)<>'confirmed' or after_spots<>before_spots then raise exception 'MISSION11 FAIL: confirmation then expiration'; end if;
  select * into r from public.create_vip_reservation('staging-vip-night','51000000-0000-4000-8000-000000000006',u,'M11','Double Expire','m11-double-expire@example.test','+33000000006',1,'66000000-0000-4000-8000-000000000001');
  select spots_reserved into before_spots from public.vip_offers where table_number='M11-TEST-DOUBLE-EXPIRE';
  perform public.expire_vip_reservation(r.reservation_id);
  select spots_reserved into after_spots from public.vip_offers where table_number='M11-TEST-DOUBLE-EXPIRE';
  perform public.expire_vip_reservation(r.reservation_id);
  if (select status from public.reservations where id=r.reservation_id)<>'payment_expired' or after_spots<>before_spots-1 or (select spots_reserved from public.vip_offers where table_number='M11-TEST-DOUBLE-EXPIRE')<>after_spots then raise exception 'MISSION11 FAIL: double expiration'; end if;
  raise notice 'MISSION11 PASS: confirmation then expiration and double expiration';
end $$;

do $$
declare ok boolean;
begin
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='vip_refunds' and column_name in ('reservation_id','stripe_session_id','status')) into ok;
  if not ok then raise exception 'MISSION11 FAIL: refund workflow columns are missing'; end if;
  raise notice 'MISSION11 PASS: refund compatibility';
end $$;

do $$ begin raise notice 'MISSION11 SQL TESTS: ALL PASSED'; end $$;
rollback;
