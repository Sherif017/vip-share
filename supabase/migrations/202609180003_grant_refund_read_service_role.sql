begin;

-- vip_refunds remains inaccessible to client roles. The server-side admin
-- page reads refund state through the service-role Supabase client.
revoke select on table public.vip_refunds from public, anon, authenticated;
grant select on table public.vip_refunds to service_role;

commit;
