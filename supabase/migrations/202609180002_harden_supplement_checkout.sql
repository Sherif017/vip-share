-- Harden Stripe supplement checkout retries and webhook reconciliation.
--
-- The Stripe Checkout payload is persisted before contacting Stripe so that
-- every retry for the same supplement payment uses identical parameters.
--
-- No historical Stripe data is modified.

alter table public.reservations
  add column if not exists supplement_checkout_params jsonb;

comment on column public.reservations.supplement_checkout_params is
  'Immutable Stripe Checkout creation parameters for the current supplement payment attempt.';


create or replace function public.confirm_vip_supplement_payment(
  p_reservation_id uuid,
  p_stripe_session_id text,
  p_amount_total integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
  v_total integer := 0;
  v_paid integer := 0;
  v_expected_amount integer;
begin
  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Réservation introuvable.';
  end if;

  select *
  into v_offer
  from public.vip_offers
  where id = v_reservation.vip_offer_id
  for update;

  if not found then
    raise exception 'Table introuvable.';
  end if;

  v_expected_amount :=
    round(v_reservation.supplement_amount * 100)::integer;

  -- Stripe webhook idempotence.
  if v_reservation.supplement_status = 'paid' then

    if v_reservation.supplement_stripe_session_id
         is distinct from p_stripe_session_id then
      raise exception 'Session Stripe de supplément invalide.';
    end if;

    if p_amount_total is distinct from v_expected_amount
       or lower(coalesce(p_currency, '')) <> 'eur' then
      raise exception 'Montant ou devise du supplément invalide.';
    end if;

    return jsonb_build_object(
      'success', true,
      'already_paid', true,
      'reservation_id', v_reservation.id,
      'offer_id', v_offer.id
    );
  end if;

  if v_offer.status <> 'supplement_payment_pending'
     or v_offer.admin_decision <> 'supplement' then
    raise exception
      'Aucun paiement de supplément actif pour cette table.';
  end if;

  if v_reservation.decision_choice <> 'maintain' then
    raise exception
      'Cette réservation n''a pas accepté le maintien.';
  end if;

  if v_reservation.supplement_status <> 'payment_pending' then
    raise exception
      'Cette réservation n''attend pas de paiement de supplément.';
  end if;

  if v_reservation.supplement_amount is null
     or v_reservation.supplement_amount <= 0 then
    raise exception 'Montant du supplément invalide.';
  end if;

  if v_reservation.supplement_stripe_session_id is null
     or v_reservation.supplement_stripe_session_id
          <> p_stripe_session_id then
    raise exception 'Session Stripe de supplément invalide.';
  end if;

  if p_amount_total is distinct from v_expected_amount then
    raise exception 'Montant Stripe du supplément invalide.';
  end if;

  if lower(coalesce(p_currency, '')) <> 'eur' then
    raise exception 'Devise Stripe du supplément invalide.';
  end if;

  update public.reservations
  set
    supplement_status = 'paid',
    supplement_paid_at = now()
  where id = v_reservation.id;

  select
    count(*)::integer,
    count(*) filter (
      where supplement_status = 'paid'
    )::integer
  into
    v_total,
    v_paid
  from public.reservations
  where vip_offer_id = v_offer.id
    and status in ('confirmed', 'checked_in')
    and decision_choice = 'maintain';

  if v_total > 0 and v_paid = v_total then
    update public.vip_offers
    set
      status = 'confirmed',
      supplement_completed_at = now()
    where id = v_offer.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'already_paid', false,
    'reservation_id', v_reservation.id,
    'offer_id', v_offer.id,
    'paid_count', v_paid,
    'total_count', v_total,
    'offer_confirmed', (v_total > 0 and v_paid = v_total)
  );
end;
$function$;


-- Remove direct access to every overload, including the historical
-- two-argument function if it still exists.
revoke all on function public.confirm_vip_supplement_payment(
  uuid,
  text,
  integer,
  text
) from public, anon, authenticated;

grant execute on function public.confirm_vip_supplement_payment(
  uuid,
  text,
  integer,
  text
) to service_role;


-- Historical two-argument RPC must no longer be callable by the application.
-- Keep it temporarily for migration compatibility, but revoke execution.
revoke all on function public.confirm_vip_supplement_payment(
  uuid,
  text
) from public, anon, authenticated, service_role;

