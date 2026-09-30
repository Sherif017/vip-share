begin;

-- ==========================================================
-- K-RÉ — CHANTIER 2C
-- Suppléments du modèle full_payment.
--
-- Objectifs :
-- - ne jamais modifier le parcours legacy_deposit ;
-- - créer un snapshot financier payment_transactions/supplement ;
-- - appliquer frais de service + commission au supplément ;
-- - rendre Checkout idempotent ;
-- - confirmer/expirer le supplément via RPC dédiées.
-- ==========================================================

alter table public.payment_transactions
  add column if not exists checkout_attempt_count integer not null default 0
    check (checkout_attempt_count >= 0);

comment on column public.payment_transactions.checkout_attempt_count is
  'Numéro de tentative Stripe Checkout pour une transaction K-RÉ. Permet une nouvelle session après expiration tout en gardant une idempotency key stable par tentative.';


-- ==========================================================
-- 1. PREPARE FULL-PAYMENT SUPPLEMENT
-- ==========================================================

create or replace function public.prepare_full_payment_supplement(
  p_reservation_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
  v_txn public.payment_transactions%rowtype;
  v_settings public.platform_settings%rowtype;

  v_stripe_account_id text;
  v_charges_enabled boolean;
  v_commission_bps integer;

  v_vip_subtotal_cents integer;
  v_service_fee_cents integer;
  v_commission_cents integer;
  v_club_net_cents integer;
  v_total_customer_cents integer;
begin

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Réservation introuvable.';
  end if;

  if v_reservation.user_id is distinct from p_user_id then
    raise exception 'Cette réservation ne t''appartient pas.';
  end if;

  if v_reservation.payment_model <> 'full_payment' then
    raise exception 'Cette réservation utilise le modèle de paiement historique.';
  end if;

  if v_reservation.status not in ('confirmed', 'checked_in') then
    raise exception 'Cette réservation ne peut pas payer de supplément.';
  end if;

  if v_reservation.decision_choice <> 'maintain' then
    raise exception 'Le maintien de cette réservation n''a pas été accepté.';
  end if;

  if v_reservation.supplement_status <> 'payment_pending' then
    raise exception 'Aucun supplément n''est actuellement en attente de paiement.';
  end if;

  if v_reservation.supplement_amount is null
     or v_reservation.supplement_amount <= 0 then
    raise exception 'Montant du supplément invalide.';
  end if;


  select *
  into v_offer
  from public.vip_offers
  where id = v_reservation.vip_offer_id
  for update;

  if v_offer.id is null then
    raise exception 'Table VIP introuvable.';
  end if;

  if v_offer.status <> 'supplement_payment_pending'
     or v_offer.admin_decision <> 'supplement' then
    raise exception 'Aucun paiement de supplément actif pour cette table.';
  end if;

  if v_offer.decision_expires_at is not null
     and now() >= v_offer.decision_expires_at then
    raise exception 'La période de paiement du supplément est terminée.';
  end if;


  -- --------------------------------------------------------
  -- Une transaction supplement existe déjà ?
  -- --------------------------------------------------------

  select *
  into v_txn
  from public.payment_transactions
  where reservation_id = v_reservation.id
    and payment_type = 'supplement'
  for update;

  if v_txn.id is not null then

    if v_txn.status = 'confirmed' then
      return jsonb_build_object(
        'success', true,
        'already_confirmed', true,
        'transaction_id', v_txn.id,
        'vip_subtotal_cents', v_txn.vip_subtotal_cents,
        'service_fee_cents', v_txn.service_fee_cents,
        'total_customer_cents', v_txn.total_customer_cents,
        'commission_rate_bps', v_txn.commission_rate_bps,
        'service_fee_rate_bps', v_txn.service_fee_rate_bps,
        'currency', v_txn.currency,
        'stripe_account_id', v_txn.stripe_account_id,
        'transfer_group', v_txn.transfer_group,
        'checkout_attempt_count', v_txn.checkout_attempt_count
      );
    end if;

    if v_txn.status = 'refunded' then
      raise exception 'Ce supplément a déjà été remboursé.';
    end if;

    -- Une session expirée peut être retentée.
    -- Le snapshot financier reste IMMUTABLE.
    if v_txn.status = 'expired' then
      update public.payment_transactions
      set
        status = 'pending',
        checkout_attempt_count = checkout_attempt_count + 1,
        stripe_checkout_session_id = null,
        stripe_payment_intent_id = null,
        stripe_charge_id = null
      where id = v_txn.id
      returning * into v_txn;

      update public.reservations
      set
        supplement_stripe_session_id = null,
        supplement_checkout_params = null
      where id = v_reservation.id;
    end if;

    return jsonb_build_object(
      'success', true,
      'already_confirmed', false,
      'transaction_id', v_txn.id,
      'vip_subtotal_cents', v_txn.vip_subtotal_cents,
      'service_fee_cents', v_txn.service_fee_cents,
      'total_customer_cents', v_txn.total_customer_cents,
      'commission_rate_bps', v_txn.commission_rate_bps,
      'service_fee_rate_bps', v_txn.service_fee_rate_bps,
      'currency', v_txn.currency,
      'stripe_account_id', v_txn.stripe_account_id,
      'transfer_group', v_txn.transfer_group,
      'checkout_attempt_count', v_txn.checkout_attempt_count
    );
  end if;


  -- --------------------------------------------------------
  -- Nouveau snapshot financier
  -- --------------------------------------------------------

  select
    c.stripe_account_id,
    c.stripe_charges_enabled,
    c.commission_bps
  into
    v_stripe_account_id,
    v_charges_enabled,
    v_commission_bps
  from public.clubs c
  where c.id = v_reservation.club_id;

  if v_stripe_account_id is null
     or v_charges_enabled is not true then
    raise exception
      'Ce club n''accepte pas encore le paiement intégral (Stripe Connect non actif).';
  end if;

  if v_commission_bps is null then
    raise exception
      'La commission de ce club n''est pas encore configurée par K-RÉ.';
  end if;


  select *
  into v_settings
  from public.platform_settings
  where id = true;

  if v_settings.id is null then
    raise exception 'Configuration financière K-RÉ introuvable.';
  end if;


  -- supplement_amount = supplément VIP hors frais de service.
  v_vip_subtotal_cents :=
    round(v_reservation.supplement_amount * 100)::integer;

  if v_vip_subtotal_cents <= 0 then
    raise exception 'Montant du supplément invalide.';
  end if;


  v_service_fee_cents := greatest(
    round(
      v_vip_subtotal_cents
      * v_settings.service_fee_bps
      / 10000.0
    )::integer,
    v_settings.service_fee_minimum_cents
  );

  v_commission_cents :=
    round(
      v_vip_subtotal_cents
      * v_commission_bps
      / 10000.0
    )::integer;

  v_club_net_cents :=
    v_vip_subtotal_cents
    - v_commission_cents;

  v_total_customer_cents :=
    v_vip_subtotal_cents
    + v_service_fee_cents;


  insert into public.payment_transactions (
    reservation_id,
    payment_type,
    club_id,
    event_id,

    vip_subtotal_cents,
    service_fee_rate_bps,
    service_fee_cents,

    commission_rate_bps,
    commission_cents,
    club_net_cents,

    total_customer_cents,
    currency,

    stripe_account_id,
    transfer_group,

    status,
    checkout_attempt_count
  )
  values (
    v_reservation.id,
    'supplement',
    v_reservation.club_id,
    v_reservation.event_id,

    v_vip_subtotal_cents,
    v_settings.service_fee_bps,
    v_service_fee_cents,

    v_commission_bps,
    v_commission_cents,
    v_club_net_cents,

    v_total_customer_cents,
    lower(v_settings.currency),

    v_stripe_account_id,
    'reservation:' || v_reservation.id::text || ':supplement',

    'pending',
    1
  )
  returning *
  into v_txn;


  return jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'transaction_id', v_txn.id,
    'vip_subtotal_cents', v_txn.vip_subtotal_cents,
    'service_fee_cents', v_txn.service_fee_cents,
    'total_customer_cents', v_txn.total_customer_cents,
    'commission_rate_bps', v_txn.commission_rate_bps,
    'service_fee_rate_bps', v_txn.service_fee_rate_bps,
    'currency', v_txn.currency,
    'stripe_account_id', v_txn.stripe_account_id,
    'transfer_group', v_txn.transfer_group,
    'checkout_attempt_count', v_txn.checkout_attempt_count
  );
end;
$$;

revoke all on function public.prepare_full_payment_supplement(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.prepare_full_payment_supplement(uuid, uuid)
  to service_role;


-- ==========================================================
-- 2. CONFIRM FULL-PAYMENT SUPPLEMENT
-- ==========================================================

create or replace function public.confirm_full_payment_supplement(
  p_reservation_id uuid,
  p_stripe_session_id text,
  p_amount_total integer,
  p_currency text,
  p_stripe_payment_intent_id text default null,
  p_stripe_charge_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
  v_txn public.payment_transactions%rowtype;

  v_total integer := 0;
  v_paid integer := 0;
begin

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'reservation_not_found'
    );
  end if;

  if v_reservation.payment_model <> 'full_payment' then
    return jsonb_build_object(
      'success', false,
      'error', 'wrong_payment_model'
    );
  end if;


  select *
  into v_txn
  from public.payment_transactions
  where reservation_id = p_reservation_id
    and payment_type = 'supplement'
  for update;

  if v_txn.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'transaction_not_found'
    );
  end if;


  -- Idempotence webhook.
  if v_txn.status = 'confirmed' then

    if v_txn.stripe_checkout_session_id
         is distinct from p_stripe_session_id then
      return jsonb_build_object(
        'success', false,
        'error', 'session_mismatch'
      );
    end if;

    if p_amount_total is distinct from v_txn.total_customer_cents
       or lower(coalesce(p_currency, ''))
            is distinct from lower(v_txn.currency) then
      return jsonb_build_object(
        'success', false,
        'error', 'amount_mismatch'
      );
    end if;

    return jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'reservation_id', v_reservation.id,
      'offer_id', v_reservation.vip_offer_id
    );
  end if;


  if v_txn.status <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'error', 'transaction_not_pending'
    );
  end if;


  if v_reservation.supplement_stripe_session_id
       is distinct from p_stripe_session_id then
    return jsonb_build_object(
      'success', false,
      'error', 'session_mismatch'
    );
  end if;


  if p_amount_total is distinct from v_txn.total_customer_cents
     or lower(coalesce(p_currency, ''))
          is distinct from lower(v_txn.currency) then
    return jsonb_build_object(
      'success', false,
      'error', 'amount_mismatch'
    );
  end if;


  select *
  into v_offer
  from public.vip_offers
  where id = v_reservation.vip_offer_id
  for update;

  if v_offer.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'offer_not_found'
    );
  end if;


  if v_offer.status <> 'supplement_payment_pending'
     or v_offer.admin_decision <> 'supplement' then
    return jsonb_build_object(
      'success', false,
      'error', 'supplement_not_active'
    );
  end if;


  if v_reservation.decision_choice <> 'maintain'
     or v_reservation.supplement_status <> 'payment_pending' then
    return jsonb_build_object(
      'success', false,
      'error', 'reservation_not_waiting_for_supplement'
    );
  end if;


  update public.payment_transactions
  set
    status = 'confirmed',
    confirmed_at = clock_timestamp(),
    stripe_checkout_session_id = p_stripe_session_id,
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    stripe_charge_id = p_stripe_charge_id
  where id = v_txn.id;


  update public.reservations
  set
    supplement_status = 'paid',
    supplement_paid_at = clock_timestamp()
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


  if v_total > 0
     and v_paid = v_total then

    update public.vip_offers
    set
      status = 'confirmed',
      supplement_completed_at = clock_timestamp()
    where id = v_offer.id;

  end if;


  return jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'reservation_id', v_reservation.id,
    'offer_id', v_offer.id,
    'paid_count', v_paid,
    'total_count', v_total,
    'offer_confirmed',
      (v_total > 0 and v_paid = v_total)
  );
end;
$$;

revoke all on function public.confirm_full_payment_supplement(
  uuid,
  text,
  integer,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.confirm_full_payment_supplement(
  uuid,
  text,
  integer,
  text,
  text,
  text
)
to service_role;


-- ==========================================================
-- 3. EXPIRE FULL-PAYMENT SUPPLEMENT
-- ==========================================================

create or replace function public.expire_full_payment_supplement(
  p_reservation_id uuid,
  p_stripe_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_txn public.payment_transactions%rowtype;
begin

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'reservation_not_found'
    );
  end if;

  if v_reservation.payment_model <> 'full_payment' then
    return jsonb_build_object(
      'success', false,
      'error', 'wrong_payment_model'
    );
  end if;


  select *
  into v_txn
  from public.payment_transactions
  where reservation_id = p_reservation_id
    and payment_type = 'supplement'
  for update;

  if v_txn.id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'transaction_not_found'
    );
  end if;


  if v_txn.status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'already_handled', true,
      'status', 'confirmed'
    );
  end if;


  -- Un ancien webhook d'expiration ne doit jamais expirer
  -- la session Stripe plus récente.
  if v_reservation.supplement_stripe_session_id
       is distinct from p_stripe_session_id then
    return jsonb_build_object(
      'success', true,
      'already_handled', true,
      'status', v_txn.status
    );
  end if;


  update public.payment_transactions
  set status = 'expired'
  where id = v_txn.id
    and status = 'pending';


  update public.reservations
  set
    supplement_stripe_session_id = null,
    supplement_checkout_params = null
  where id = v_reservation.id;


  return jsonb_build_object(
    'success', true,
    'already_handled', false,
    'status', 'expired'
  );
end;
$$;

revoke all on function public.expire_full_payment_supplement(uuid, text)
  from public, anon, authenticated;

grant execute on function public.expire_full_payment_supplement(uuid, text)
  to service_role;


notify pgrst, 'reload schema';

commit;
