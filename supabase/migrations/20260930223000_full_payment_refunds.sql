begin;

-- ============================================================
-- K-RÉ — FULL PAYMENT REFUNDS
--
-- Legacy initial_deposit/supplement remains untouched.
-- New full-payment refund uses payment_transactions as its
-- financial source of truth.
-- ============================================================

alter table public.vip_refunds
  drop constraint if exists vip_refunds_payment_type_check;

alter table public.vip_refunds
  add constraint vip_refunds_payment_type_check
  check (
    payment_type in (
      'initial_deposit',
      'full_payment_initial',
      'supplement'
    )
  );

alter table public.vip_refunds
  add column if not exists payment_transaction_id uuid
    references public.payment_transactions(id);

alter table public.vip_refunds
  add column if not exists stripe_transfer_reversal_id text;

create index if not exists
  vip_refunds_payment_transaction_idx
on public.vip_refunds(payment_transaction_id);

comment on column public.vip_refunds.payment_transaction_id is
  'Transaction du ledger K-RÉ associée au remboursement full-payment. NULL pour les remboursements legacy.';

comment on column public.vip_refunds.stripe_transfer_reversal_id is
  'Reversal du Transfer Stripe Connect si le net club avait déjà été transféré.';

-- ============================================================
-- 1. PREPARATION FULL PAYMENT
-- ============================================================

create or replace function public.prepare_full_payment_refund(
  p_reservation_id uuid,
  p_requested_by uuid,
  p_reason text default null
)
returns public.vip_refunds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservations%rowtype;
  t public.payment_transactions%rowtype;
  v public.vip_refunds%rowtype;
begin
  select *
  into r
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Réservation introuvable.';
  end if;

  if r.payment_model <> 'full_payment' then
    raise exception
      'Cette réservation ne correspond pas au modèle full-payment.';
  end if;

  select *
  into t
  from public.payment_transactions
  where reservation_id = r.id
    and payment_type = 'initial'
  for update;

  if not found then
    raise exception
      'Transaction financière initiale introuvable.';
  end if;

  if t.status not in ('confirmed', 'refunded') then
    raise exception
      'Cette transaction n''est pas remboursable.';
  end if;

  if r.stripe_checkout_session_id is null then
    raise exception
      'Session Stripe initiale introuvable.';
  end if;

  insert into public.vip_refunds (
    reservation_id,
    payment_type,
    stripe_session_id,
    payment_transaction_id,
    amount,
    currency,
    reason,
    requested_by
  )
  values (
    r.id,
    'full_payment_initial',
    r.stripe_checkout_session_id,
    t.id,
    t.total_customer_cents,
    t.currency,
    p_reason,
    p_requested_by
  )
  on conflict (
    reservation_id,
    payment_type
  )
  do update set
    reason = coalesce(
      excluded.reason,
      vip_refunds.reason
    )
  returning *
  into v;

  return v;
end;
$$;

revoke all on function
  public.prepare_full_payment_refund(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.prepare_full_payment_refund(uuid, uuid, text)
to service_role;

-- ============================================================
-- 2. ENREGISTRER UN REVERSAL STRIPE
-- ============================================================

create or replace function public.record_full_payment_transfer_reversal(
  p_transaction_id uuid,
  p_reversal_id text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.payment_transactions%rowtype;
begin
  select *
  into t
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction introuvable.';
  end if;

  if t.stripe_transfer_id is null then
    raise exception
      'Aucun Transfer Stripe à inverser.';
  end if;

  if t.stripe_transfer_reversal_id is not null then

    if t.stripe_transfer_reversal_id
         <> p_reversal_id then
      raise exception
        'Un autre reversal Stripe est déjà enregistré.';
    end if;

    return t;
  end if;

  update public.payment_transactions
  set
    stripe_transfer_reversal_id =
      p_reversal_id,

    transfer_status = 'reversed',

    transfer_reversed_at =
      clock_timestamp(),

    transfer_reversal_reason =
      'full_payment_refund'
  where id = t.id
  returning *
  into t;

  return t;
end;
$$;

revoke all on function
  public.record_full_payment_transfer_reversal(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.record_full_payment_transfer_reversal(uuid, text)
to service_role;

-- ============================================================
-- 3. FINALISER LE REMBOURSEMENT FULL PAYMENT
-- ============================================================

create or replace function public.complete_full_payment_refund(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_payment_intent_id text,
  p_amount integer,
  p_processed_by uuid,
  p_transfer_reversal_id text default null
)
returns public.vip_refunds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.vip_refunds%rowtype;
  t public.payment_transactions%rowtype;
  r public.reservations%rowtype;
  remaining integer;
begin
  select *
  into v
  from public.vip_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Remboursement introuvable.';
  end if;

  if v.payment_type <> 'full_payment_initial' then
    raise exception
      'Type de remboursement incompatible.';
  end if;

  if v.status = 'refunded' then
    return v;
  end if;

  if v.payment_transaction_id is null then
    raise exception
      'Transaction financière absente.';
  end if;

  select *
  into t
  from public.payment_transactions
  where id = v.payment_transaction_id
  for update;

  if not found then
    raise exception
      'Transaction financière introuvable.';
  end if;

  if t.reservation_id <> v.reservation_id then
    raise exception
      'Transaction financière incompatible.';
  end if;

  if p_amount <> t.total_customer_cents then
    raise exception
      'Montant de remboursement incompatible.';
  end if;

  if lower(v.currency)
       <> lower(t.currency) then
    raise exception
      'Devise incompatible.';
  end if;

  -- Si le net club était déjà transféré, le reversal doit
  -- avoir été confirmé AVANT de finaliser le refund en DB.
  if t.stripe_transfer_id is not null then

    if t.stripe_transfer_reversal_id is null then
      raise exception
        'Le Transfer club doit être inversé avant le remboursement.';
    end if;

    if p_transfer_reversal_id is distinct from
       t.stripe_transfer_reversal_id then
      raise exception
        'Reversal Stripe incompatible.';
    end if;

  end if;

  update public.vip_refunds
  set
    status = 'refunded',

    stripe_refund_id =
      coalesce(
        stripe_refund_id,
        p_stripe_refund_id
      ),

    stripe_payment_intent_id =
      coalesce(
        stripe_payment_intent_id,
        p_payment_intent_id
      ),

    stripe_transfer_reversal_id =
      coalesce(
        stripe_transfer_reversal_id,
        p_transfer_reversal_id
      ),

    amount =
      coalesce(
        amount,
        p_amount
      ),

    processed_at =
      clock_timestamp(),

    processed_by =
      p_processed_by,

    last_error = null
  where id = v.id
  returning *
  into v;

  update public.payment_transactions
  set
    status = 'refunded',

    transfer_status =
      case
        when stripe_transfer_id is not null
          then 'reversed'
        else transfer_status
      end
  where id = t.id;

  select count(*)
  into remaining
  from public.vip_refunds
  where reservation_id =
      v.reservation_id
    and status <> 'refunded';

  if remaining = 0 then

    select *
    into r
    from public.reservations
    where id = v.reservation_id
    for update;

    if not found then
      raise exception
        'Réservation introuvable.';
    end if;

    if r.status <> 'refunded' then

      update public.vip_offers
      set
        spots_reserved =
          greatest(
            0,
            spots_reserved - r.quantity
          )
      where id = r.vip_offer_id;

      update public.reservations
      set
        refunded_at =
          coalesce(
            refunded_at,
            clock_timestamp()
          ),

        status = 'refunded'
      where id = r.id;

    end if;

  end if;

  return v;
end;
$$;

revoke all on function
  public.complete_full_payment_refund(
    uuid,
    text,
    text,
    integer,
    uuid,
    text
  )
from public, anon, authenticated;

grant execute on function
  public.complete_full_payment_refund(
    uuid,
    text,
    text,
    integer,
    uuid,
    text
  )
to service_role;

notify pgrst, 'reload schema';

commit;
