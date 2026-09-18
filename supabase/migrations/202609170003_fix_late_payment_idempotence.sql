-- Mission 11 corrective follow-up.
-- A duplicate webhook after the no-capacity late-payment branch must remain
-- idempotent instead of raising a retryable exception forever.
begin;

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
  if not found then raise exception 'Réservation introuvable.' using errcode = 'P0001'; end if;
  if v_reservation.stripe_checkout_session_id is distinct from p_stripe_session_id then
    raise exception 'Session Stripe non associée à cette réservation.' using errcode = '22023';
  end if;
  v_expected_amount := round(v_reservation.deposit_paid * 100);
  if p_amount_total is distinct from v_expected_amount or lower(coalesce(p_currency, '')) <> 'eur' then
    raise exception 'Montant ou devise Stripe incompatible.' using errcode = '22023';
  end if;

  if v_reservation.status = 'confirmed' then
    return jsonb_build_object('success', true, 'already_confirmed', true,
      'reservation_id', v_reservation.id, 'status', v_reservation.status);
  end if;

  -- The first no-capacity reconciliation already placed this paid case in
  -- the administrative refund workflow. Replayed webhooks must be harmless.
  if v_reservation.status = 'refund_pending' then
    return jsonb_build_object('success', false, 'refund_pending', true,
      'already_reconciled', true, 'reservation_id', v_reservation.id,
      'status', v_reservation.status);
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
    if not found then raise exception 'Table introuvable.' using errcode = 'P0001'; end if;
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
    update public.reservations
    set status = 'refund_pending', refund_requested_at = coalesce(refund_requested_at, clock_timestamp())
    where id = v_reservation.id;
    return jsonb_build_object('success', false, 'refund_pending', true,
      'reservation_id', v_reservation.id, 'status', 'refund_pending');
  end if;

  raise exception 'Réservation dans un état non payable: %', v_reservation.status using errcode = 'P0001';
end;
$$;

revoke all on function public.confirm_vip_reservation_payment(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.confirm_vip_reservation_payment(uuid,text,integer,text) to service_role;

commit;
