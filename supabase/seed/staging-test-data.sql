-- VIP Share STAGING ONLY.
-- Run only with psql and explicit guard:
-- psql --set=STAGING_ONLY=1 --set=STAGING_PROJECT_REF=okplunqjwklzpfacuskd "$STAGING_DATABASE_URL" -f supabase/seed/staging-test-data.sql
-- This file never creates auth.users and contains no passwords, secrets or real Stripe payments.
\if :{?STAGING_ONLY}
\else
  \echo 'Refusing to run: pass --set=STAGING_ONLY=1 for the staging database.'
  \quit 1
\endif
\if :{?STAGING_PROJECT_REF}
\else
  \echo 'Refusing to run: pass the exact Staging project ref with --set=STAGING_PROJECT_REF=okplunqjwklzpfacuskd.'
  \quit 1
\endif
select :'STAGING_PROJECT_REF' = 'okplunqjwklzpfacuskd' as staging_project_ref_ok \gset
\if :staging_project_ref_ok
\else
  \echo 'Refusing to run: project ref is not vip-share-staging.'
  \quit 1
\endif

begin;
create temporary table _vip_staging_users (key text primary key, user_id uuid not null) on commit drop;
insert into _vip_staging_users(key, user_id)
select v.key, u.id from (values
  ('manager','vip-share.manager@example.test'),('club_admin','vip-share.club-admin@example.test'),
  ('scanner','vip-share.scanner@example.test'),('customer_1','vip-share.customer1@example.test'),
  ('customer_2','vip-share.customer2@example.test'),('customer_3','vip-share.customer3@example.test'),
  ('customer_4','vip-share.customer4@example.test')
) v(key,email) join auth.users u on lower(u.email)=lower(v.email);

do $$ declare missing text; begin
  select string_agg(x.email, ', ' order by x.email) into missing from (values
    ('vip-share.manager@example.test'),('vip-share.club-admin@example.test'),('vip-share.scanner@example.test'),
    ('vip-share.customer1@example.test'),('vip-share.customer2@example.test'),('vip-share.customer3@example.test'),
    ('vip-share.customer4@example.test')) x(email)
  where not exists (select 1 from auth.users u where lower(u.email)=lower(x.email));
  if missing is not null then raise exception 'Missing staging Auth users: %', missing; end if;
end $$;

do $$ begin
  if exists (select 1 from public.clubs where id='10000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.events where id='20000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.vip_offers where id='30000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.reservations where id='40000000-0000-4000-8000-000000000001') then
    raise exception 'Staging fixtures already exist; refusing a second seed run.';
  end if;
end $$;

insert into public.profiles(id,role,is_admin,firstname,lastname)
select user_id, case when key='manager' then 'manager' else 'customer' end, false,
  initcap(replace(key,'_',' ')), 'VIP Share Test' from _vip_staging_users
on conflict (id) do update set role=excluded.role,is_admin=false,firstname=excluded.firstname,lastname=excluded.lastname;

insert into public.clubs(id,name,city,address) values
 ('10000000-0000-4000-8000-000000000001','Staging Test Club','Paris','1 rue du Test')
on conflict (id) do update set name=excluded.name,city=excluded.city,address=excluded.address;
insert into public.club_memberships(id,user_id,club_id,role,status,created_by)
select x.id,u.user_id,'10000000-0000-4000-8000-000000000001',x.role,'active',m.user_id
from (values ('10000000-0000-4000-8000-000000000011'::uuid,'club_admin','admin'),('10000000-0000-4000-8000-000000000012'::uuid,'scanner','scanner')) x(id,user_key,role)
join _vip_staging_users u on u.key=x.user_key cross join (select user_id from _vip_staging_users where key='manager') m
on conflict (user_id,club_id) do update set role=excluded.role,status='active',created_by=excluded.created_by;
insert into public.events(id,club_id,slug,name,event_date,start_time,music,status) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','staging-vip-night','Staging VIP Night',current_date+30,'22:00','House','published')
on conflict (id) do update set event_date=excluded.event_date,status='published';

insert into public.vip_offers(id,event_id,capacity,confirmation_threshold,price_per_person,deposit_per_person,remaining_per_person,spots_reserved,status,table_number,total_table_price,booking_deadline) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'forming','T-FORMING',720,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',2,2,100,25,75,0,'forming','T-CAPACITY',200,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'admin_review','T-REVIEW',720,current_timestamp-interval '1 hour'),
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'admin_review','T-AS-IS',720,current_timestamp-interval '1 hour'),
 ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'admin_review','T-MERGE-SOURCE',720,current_timestamp-interval '1 hour'),
 ('30000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001',8,4,120,30,90,0,'confirmed','T-MERGE-TARGET',960,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'decision_pending','T-SUPPLEMENT',720,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'supplement_payment_pending','T-SUPP-PAYMENT',720,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'refund_pending','T-REFUND',720,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'confirmed','T-CHECKIN',720,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'decision_pending','T-SUPP-EXPIRED',720,current_timestamp+interval '7 days'),
 ('30000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000001',6,4,120,30,90,0,'forming','T-DEADLINE',720,current_timestamp-interval '1 hour')
on conflict (id) do update set status=excluded.status,booking_deadline=excluded.booking_deadline;

insert into public.reservations(id,event_id,vip_offer_id,user_id,firstname,lastname,email,phone,quantity,total_price,deposit_paid,remaining_amount,status,reservation_code,created_at,checked_in,checked_in_quantity,checked_in_at,decision_choice,decision_choice_at,supplement_amount,supplement_status,decision_at,refund_requested_at)
select r.id,'20000000-0000-4000-8000-000000000001',r.offer_id,u.user_id,r.firstname,'Test',format('vip-share.customer%s@example.test', replace(r.user_key,'customer_','')),'+33000000000',r.quantity,o.price_per_person*r.quantity,o.deposit_per_person*r.quantity,o.remaining_per_person*r.quantity,r.status,r.code,ca.created_at,r.checked_in,r.checked_in_quantity,r.checked_in_at,r.decision_choice,r.decision_choice_at,r.supplement_amount,r.supplement_status,r.decision_at,r.refund_requested_at
from (values
 ('40000000-0000-4000-8000-000000000001'::uuid,'30000000-0000-4000-8000-000000000001'::uuid,'customer_1','Forming','VIP-FORMING-1',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000002'::uuid,'30000000-0000-4000-8000-000000000002'::uuid,'customer_2','Capacity','VIP-CAPACITY-1',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000003'::uuid,'30000000-0000-4000-8000-000000000003'::uuid,'customer_3','Review','VIP-REVIEW-1',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000004'::uuid,'30000000-0000-4000-8000-000000000004'::uuid,'customer_4','As Is','VIP-ASIS-1',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000005'::uuid,'30000000-0000-4000-8000-000000000005'::uuid,'customer_1','Merge Source','VIP-MERGE-SOURCE',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000006'::uuid,'30000000-0000-4000-8000-000000000006'::uuid,'customer_2','Merge Target','VIP-MERGE-TARGET',2,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000007'::uuid,'30000000-0000-4000-8000-000000000007'::uuid,'customer_3','Supplement','VIP-SUPP-1',2,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,40::numeric,'pending',null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000008'::uuid,'30000000-0000-4000-8000-000000000008'::uuid,'customer_4','Supplement Pay','VIP-SUPP-PAY',1,'confirmed',false,0,null::timestamptz,'maintain',current_timestamp,20::numeric,'payment_pending',null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000009'::uuid,'30000000-0000-4000-8000-000000000009'::uuid,'customer_1','Refund','VIP-REFUND-1',1,'confirmed',false,0,null::timestamptz,'refund',current_timestamp,20::numeric,'refund_pending',current_timestamp,current_timestamp),
 ('40000000-0000-4000-8000-000000000011'::uuid,'30000000-0000-4000-8000-000000000010'::uuid,'customer_3','QR Partial','VIP-QR-PARTIAL',2,'confirmed',false,1,current_timestamp-interval '10 minutes',null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000012'::uuid,'30000000-0000-4000-8000-000000000001'::uuid,'customer_4','Expired','VIP-EXPIRED-1',1,'pending_payment',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000013'::uuid,'30000000-0000-4000-8000-000000000011'::uuid,'customer_4','Expired Decision','VIP-SUPP-EXPIRED',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,20::numeric,'pending',null::timestamptz,null::timestamptz),
 ('40000000-0000-4000-8000-000000000014'::uuid,'30000000-0000-4000-8000-000000000012'::uuid,'customer_1','Deadline','VIP-DEADLINE-1',1,'confirmed',false,0,null::timestamptz,null::text,null::timestamptz,null::numeric,null::text,null::timestamptz,null::timestamptz)
) r(id,offer_id,user_key,firstname,code,quantity,status,checked_in,checked_in_quantity,checked_in_at,decision_choice,decision_choice_at,supplement_amount,supplement_status,decision_at,refund_requested_at)
join _vip_staging_users u on u.key=r.user_key
join public.vip_offers o on o.id=r.offer_id
cross join lateral (select case when r.code='VIP-EXPIRED-1' then current_timestamp-interval '2 hours' else current_timestamp end as created_at) ca
on conflict (id) do update set vip_offer_id=excluded.vip_offer_id,user_id=excluded.user_id,quantity=excluded.quantity,status=excluded.status,created_at=excluded.created_at,checked_in=excluded.checked_in,checked_in_quantity=excluded.checked_in_quantity,checked_in_at=excluded.checked_in_at,decision_choice=excluded.decision_choice,decision_choice_at=excluded.decision_choice_at,supplement_amount=excluded.supplement_amount,supplement_status=excluded.supplement_status,decision_at=excluded.decision_at,refund_requested_at=excluded.refund_requested_at;

update public.vip_offers o set spots_reserved=coalesce((select sum(quantity) from public.reservations r where r.vip_offer_id=o.id and r.status in ('confirmed','checked_in','pending_payment')),0) where o.event_id='20000000-0000-4000-8000-000000000001';
update public.vip_offers set status='forming',admin_decision=null where id in ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
update public.vip_offers set status='admin_review',admin_decision=null where id in ('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000005');
update public.vip_offers set status='confirmed',admin_decision='accept_as_is',admin_decision_at=current_timestamp where id='30000000-0000-4000-8000-000000000004';
update public.vip_offers set status='confirmed' where id='30000000-0000-4000-8000-000000000006';
update public.vip_offers set status='decision_pending',admin_decision='supplement',decision_started_at=current_timestamp,decision_expires_at=current_timestamp+interval '1 day',decision_snapshot_count=2,decision_price_per_person=140,decision_supplement_per_person=20 where id='30000000-0000-4000-8000-000000000007';
update public.vip_offers set status='supplement_payment_pending',admin_decision='supplement',supplement_per_person=20 where id='30000000-0000-4000-8000-000000000008';
update public.vip_offers set status='refund_pending',admin_decision='supplement' where id='30000000-0000-4000-8000-000000000009';
update public.vip_offers set status='confirmed' where id='30000000-0000-4000-8000-000000000010';
update public.vip_offers set status='decision_pending',admin_decision='supplement',decision_started_at=current_timestamp-interval '2 hours',decision_expires_at=current_timestamp-interval '1 hour',decision_snapshot_count=1,decision_price_per_person=140,decision_supplement_per_person=20 where id='30000000-0000-4000-8000-000000000011';
update public.vip_offers set status='forming',booking_deadline=current_timestamp-interval '1 hour' where id='30000000-0000-4000-8000-000000000012';
commit;
