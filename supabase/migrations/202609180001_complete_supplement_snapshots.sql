-- Complete the immutable financial snapshot created when an administrator
-- starts the supplement decision workflow.
--
-- No schema change.
-- No historical data rewrite.
-- Server-side RPC remains service_role-only.

create or replace function public.admin_start_vip_offer_supplement(
  p_offer_id uuid,
  p_admin_user_id uuid,
  p_expires_at timestamptz default (now() + interval '24 hours')
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_offer public.vip_offers%rowtype;
  v_count integer;
  v_new numeric(10,2);
  v_supp numeric(10,2);
begin
  select *
  into v_offer
  from public.vip_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Table introuvable.';
  end if;

  if v_offer.status <> 'admin_review' then
    raise exception 'La table doit être en attente de décision administrateur.';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Échéance invalide.';
  end if;

  select coalesce(sum(quantity),0)::integer
  into v_count
  from public.reservations
  where vip_offer_id = v_offer.id
    and status in ('confirmed','checked_in');

  if v_count <= 0 then
    raise exception 'Aucun participant confirmé sur cette table.';
  end if;

  v_new := round(
    (v_offer.total_table_price / v_count)::numeric,
    2
  );

  v_supp := round(
    (v_new - v_offer.price_per_person)::numeric,
    2
  );

  if v_supp <= 0 then
    raise exception 'Aucun supplément n''est nécessaire pour cette table.';
  end if;

  update public.vip_offers
  set
    status = 'decision_pending',
    admin_decision = 'supplement',
    admin_decision_at = now(),
    admin_decision_by = p_admin_user_id,

    decision_started_at = now(),
    decision_expires_at = p_expires_at,
    decision_snapshot_count = v_count,

    -- Canonical immutable financial snapshot
    decision_original_price_per_person = v_offer.price_per_person,
    decision_price_per_person = v_new,
    decision_supplement_per_person = v_supp,

    -- Legacy/current compatibility field
    supplement_per_person = v_supp

  where id = v_offer.id;

  update public.reservations
  set
    decision_choice = null,
    decision_choice_at = null,
    supplement_amount = round((v_supp * quantity)::numeric,2),
    supplement_status = 'pending',
    supplement_paid_at = null,
    supplement_stripe_session_id = null
  where vip_offer_id = v_offer.id
    and status in ('confirmed','checked_in');

  return jsonb_build_object(
    'success', true,
    'offer_id', v_offer.id,
    'snapshot_count', v_count,
    'original_price_per_person', v_offer.price_per_person,
    'new_price_per_person', v_new,
    'supplement_per_person', v_supp,
    'expires_at', p_expires_at
  );
end;
$function$;

-- Financial RPC must remain server-side only.
revoke all on function public.admin_start_vip_offer_supplement(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.admin_start_vip_offer_supplement(
  uuid,
  uuid,
  timestamptz
) to service_role;
