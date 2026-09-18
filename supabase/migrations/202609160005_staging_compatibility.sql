begin;

-- Canonical values used by the application and the supplied remote RPCs.
alter table public.reservations drop constraint if exists reservations_supplement_status_check;
alter table public.reservations add constraint reservations_supplement_status_check
  check (supplement_status is null or supplement_status in
    ('pending', 'payment_pending', 'paid', 'refund_pending', 'cancelled'));

-- pg_dump was intentionally created with --no-privileges. Make all baseline
-- SECURITY DEFINER functions private by default; only the RLS helper needed by
-- authenticated policy evaluation remains callable by authenticated users.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_manager(uuid) to authenticated;

grant execute on function public.admin_accept_vip_offer_as_is(uuid,uuid,text) to service_role;
grant execute on function public.admin_propose_vip_offer_merge(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.admin_start_vip_offer_supplement(uuid,uuid,timestamptz) to service_role;
grant execute on function public.admin_update_vip_offer_deadline(uuid,timestamptz) to service_role;
grant execute on function public.can_manage_club(uuid,uuid) to service_role;
grant execute on function public.can_scan_club(uuid,uuid) to service_role;
grant execute on function public.check_in_reservation(text) to service_role;
grant execute on function public.confirm_vip_reservation(uuid) to service_role;
grant execute on function public.confirm_vip_supplement_payment(uuid,text) to service_role;
grant execute on function public.create_vip_reservation(text,uuid,uuid,text,text,text,text,integer) to service_role;
grant execute on function public.customer_decide_vip_offer_merge(uuid,uuid,text) to service_role;
grant execute on function public.customer_decide_vip_offer_supplement(uuid,uuid,text) to service_role;
grant execute on function public.expire_vip_offer_supplement_decision(uuid) to service_role;
grant execute on function public.expire_vip_reservation(uuid) to service_role;
grant execute on function public.expire_vip_supplement_checkout(uuid,text) to service_role;
grant execute on function public.finalize_vip_offer_merge(uuid) to service_role;
grant execute on function public.get_reservation_by_code(text) to service_role;
grant execute on function public.is_club_admin(uuid,uuid) to service_role;
grant execute on function public.refresh_all_vip_offer_statuses() to service_role;
grant execute on function public.refresh_vip_offer_status(uuid) to service_role;
grant execute on function public.resolve_vip_offer_decision(uuid) to service_role;
grant execute on function public.undo_check_in_reservation(text) to service_role;
commit;
