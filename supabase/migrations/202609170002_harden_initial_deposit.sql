-- Mission 11: idempotent initial Deposit and payment/expiration reconciliation.
-- This migration is additive and does not alter previously applied migrations.
begin;

alter table public.reservations
  add column if not exists initial_checkout_attempt_id uuid;

create unique index if not exists reservations_initial_checkout_attempt_unique
  on public.reservations(user_id, initial_checkout_attempt_id)
  where initial_checkout_attempt_id is not null;

-- The 9-argument overload is used by the application. The historical
-- 8-argument RPC remains available for compatibility with older callers.
create or replace function public.create_vip_reservation(
  p_event_slug text,
  p_vip_offer_id uuid,
  p_user_id uuid,
  p_firstname text,
  p_lastname text,
  p_email text,
  p_phone text,
  p_quantity integer,
  p_checkout_attempt_id uuid
)
returns table(reservation_id uuid, reservation_code text, total_price numeric, deposit_paid numeric, remaining_amount numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.reservations%rowtype;
  v_created record;
begin
  if p_checkout_attempt_id is null then
    raise exception 'Identifiant de tentative de paiement obligatoire.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.reservations
  where user_id = p_user_id
    and initial_checkout_attempt_id = p_checkout_attempt_id
  for update;

  if found then
    return query select v_existing.id, v_existing.reservation_code,
      v_existing.total_price, v_existing.deposit_paid, v_existing.remaining_amount;
    return;
  end if;

  -- Keep all pricing, capacity and deadline rules in the existing RPC.
  select * into v_created
  from public.create_vip_reservation(
    p_event_slug, p_vip_offer_id, p_user_id, p_firstname,
    p_lastname, p_email, p_phone, p_quantity
  );

  update public.reservations
  set initial_checkout_attempt_id = p_checkout_attempt_id
  where id = v_created.reservation_id;

  return query select v_created.reservation_id, v_created.reservation_code,
    v_created.total_price, v_created.deposit_paid, v_created.remaining_amount;
exception
  when unique_violation then
    -- A concurrent request may have inserted the same attempt between the
    -- initial lookup and the update. Return its reservation instead of
    -- exposing a duplicate checkout attempt.
    select * into v_existing
    from public.reservations
    where user_id = p_user_id
      and initial_checkout_attempt_id = p_checkout_attempt_id
    for update;
    if found then
      return query select v_existing.id, v_existing.reservation_code,
        v_existing.total_price, v_existing.deposit_paid, v_existing.remaining_amount;
      return;
    end if;
    raise;
end;
$$;

-- This RPC is the single transactional entrypoint for a paid initial Deposit.
-- It binds the Stripe session and amount to the server-side reservation, and
-- reconciles a payment that arrived after the hold was expired.
create or replace function public.confirm_vip_reservation_payment(
  p_reservation_id uuid,
  p_stripe_session_id text,
  p_amount_total integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
  v_expected_amount integer;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Réservation introuvable.' using errcode = 'P0001';
  end if;

  if v_reservation.stripe_checkout_session_id is distinct from p_stripe_session_id then
    raise exception 'Session Stripe non associée à cette réservation.' using errcode = '22023';
  end if;

  v_expected_amount := round(v_reservation.deposit_paid * 100);
  if p_amount_total is distinct from v_expected_amount
     or lower(coalesce(p_currency, '')) <> 'eur' then
    raise exception 'Montant ou devise Stripe incompatible.' using errcode = '22023';
  end if;

  if v_reservation.status = 'confirmed' then
    return jsonb_build_object('success', true, 'already_confirmed', true,
      'reservation_id', v_reservation.id, 'status', v_reservation.status);
  end if;

  if v_reservation.status = 'pending_payment' then
    update public.reservations
    set status = 'confirmed', paid_at = coalesce(paid_at, clock_timestamp())
    where id = v_reservation.id;
    return jsonb_build_object('success', true, 'already_confirmed', false,
      'reservation_id', v_reservation.id, 'status', 'confirmed');
  end if;

  if v_reservation.status = 'payment_expired' then
    select * into v_offer from public.vip_offers
    where id = v_reservation.vip_offer_id
    for update;

    if not found then
      raise exception 'Table introuvable.' using errcode = 'P0001';
    end if;

    if coalesce(v_offer.spots_reserved, 0) + v_reservation.quantity <= v_offer.capacity then
      update public.vip_offers
      set spots_reserved = coalesce(spots_reserved, 0) + v_reservation.quantity
      where id = v_offer.id;
      update public.reservations
      set status = 'confirmed', paid_at = coalesce(paid_at, clock_timestamp())
      where id = v_reservation.id;
      return jsonb_build_object('success', true, 'reconciled_after_expiry', true,
        'reservation_id', v_reservation.id, 'status', 'confirmed');
    end if;

    -- Money was captured but the seat cannot be restored. Keep the case
    -- explicitly retryable for the administrative refund workflow.
    update public.reservations
    set status = 'refund_pending', refund_requested_at = coalesce(refund_requested_at, clock_timestamp())
    where id = v_reservation.id;
    return jsonb_build_object('success', false, 'refund_pending', true,
      'reservation_id', v_reservation.id, 'status', 'refund_pending');
  end if;

  raise exception 'Réservation dans un état non payable: %', v_reservation.status using errcode = 'P0001';
end;
$$;

revoke all on function public.create_vip_reservation(text,uuid,uuid,text,text,text,text,integer,uuid) from public, anon, authenticated;
revoke all on function public.confirm_vip_reservation_payment(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.create_vip_reservation(text,uuid,uuid,text,text,text,text,integer,uuid) to service_role;
grant execute on function public.confirm_vip_reservation_payment(uuid,text,integer,text) to service_role;

commit;
