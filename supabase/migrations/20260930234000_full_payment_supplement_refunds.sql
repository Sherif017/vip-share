begin;

-- ============================================================
-- K-RÉ — CHANTIER 2D
-- FULL PAYMENT REFUND : INITIAL + SUPPLEMENT
--
-- IMPORTANT :
-- - le refund initial et le refund supplément sont préparés
--   atomiquement AVANT le premier appel Stripe ;
-- - chaque transaction du ledger possède son propre refund ;
-- - chaque Transfer club possède son propre reversal ;
-- - la réservation n'est clôturée qu'une fois tous les refunds
--   préparés terminés ;
-- - le legacy deposit reste inchangé.
-- ============================================================


-- ============================================================
-- 1. PREPARER TOUS LES REFUNDS FULL-PAYMENT
-- ============================================================

create or replace function public.prepare_full_payment_refunds(
  p_reservation_id uuid,
  p_requested_by uuid,
  p_reason text default null
)
returns setof public.vip_refunds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservations%rowtype;
  t public.payment_transactions%rowtype;
  v public.vip_refunds%rowtype;

  v_refund_type text;
  v_initial_found boolean := false;
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


  -- ----------------------------------------------------------
  -- Ne jamais rembourser pendant qu'un Checkout supplément
  -- est encore potentiellement payable.
  --
  -- On évite ainsi :
  -- refund initial -> puis webhook tardif du supplément.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.payment_transactions pt
    where pt.reservation_id = r.id
      and pt.payment_type = 'supplement'
      and pt.status = 'pending'
  ) then
    raise exception
      'Un paiement de supplément est encore en cours. Il doit être expiré ou finalisé avant le remboursement.';
  end if;


  -- ----------------------------------------------------------
  -- On prépare TOUTES les transactions réellement encaissées
  -- avant de lancer le moindre refund Stripe.
  -- ----------------------------------------------------------

  for t in
    select pt.*
    from public.payment_transactions pt
    where pt.reservation_id = r.id
      and pt.payment_type in ('initial', 'supplement')
      and pt.status in ('confirmed', 'refunded')
    order by
      case
        when pt.payment_type = 'initial' then 0
        else 1
      end,
      pt.created_at,
      pt.id
    for update
  loop

    if t.payment_type = 'initial' then
      v_refund_type := 'full_payment_initial';
      v_initial_found := true;

    elsif t.payment_type = 'supplement' then
      v_refund_type := 'supplement';

    else
      raise exception
        'Type de transaction financière incompatible.';
    end if;


    if t.stripe_checkout_session_id is null then
      raise exception
        'Session Stripe absente pour la transaction %.',
        t.id;
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
      v_refund_type,
      t.stripe_checkout_session_id,
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

      reason =
        coalesce(
          excluded.reason,
          vip_refunds.reason
        ),

      stripe_session_id =
        excluded.stripe_session_id,

      payment_transaction_id =
        excluded.payment_transaction_id,

      amount =
        excluded.amount,

      currency =
        excluded.currency

    returning *
    into v;

  end loop;


  if not v_initial_found then
    raise exception
      'Transaction financière initiale introuvable.';
  end if;


  -- Tous les refunds existent maintenant en DB.
  -- Le moteur Stripe peut les traiter sans risque de clôturer
  -- prématurément la réservation après le premier refund.

  return query
  select vr.*
  from public.vip_refunds vr
  where vr.reservation_id = r.id
    and vr.payment_transaction_id is not null
    and vr.payment_type in (
      'full_payment_initial',
      'supplement'
    )
  order by
    case
      when vr.payment_type = 'full_payment_initial'
        then 0
      else 1
    end,
    vr.created_at,
    vr.id;

end;
$$;


revoke all on function
  public.prepare_full_payment_refunds(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.prepare_full_payment_refunds(uuid, uuid, text)
to service_role;



-- ============================================================
-- 2. COMPATIBILITE AVEC L'ANCIEN RPC SINGULIER
--
-- Même si un ancien appel utilise encore
-- prepare_full_payment_refund(), les DEUX refunds sont préparés
-- avant de retourner le refund initial.
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
  v public.vip_refunds%rowtype;
begin

  select prepared.*
  into v
  from public.prepare_full_payment_refunds(
    p_reservation_id,
    p_requested_by,
    p_reason
  ) prepared
  where prepared.payment_type = 'full_payment_initial'
  limit 1;

  if v.id is null then
    raise exception
      'Remboursement initial introuvable.';
  end if;

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
-- 3. FINALISATION GENERIQUE
-- initial OU supplement
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
    raise exception
      'Remboursement introuvable.';
  end if;


  if v.payment_type not in (
    'full_payment_initial',
    'supplement'
  ) then
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


  -- Correspondance stricte refund <-> ledger.

  if (
    v.payment_type = 'full_payment_initial'
    and t.payment_type <> 'initial'
  ) then
    raise exception
      'Le remboursement initial ne correspond pas à la transaction initiale.';
  end if;


  if (
    v.payment_type = 'supplement'
    and t.payment_type <> 'supplement'
  ) then
    raise exception
      'Le remboursement supplément ne correspond pas à la transaction supplément.';
  end if;


  if t.status not in (
    'confirmed',
    'refunded'
  ) then
    raise exception
      'Transaction financière non remboursable.';
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


  -- ----------------------------------------------------------
  -- Si le club a déjà reçu son net pour CETTE transaction,
  -- son Transfer doit avoir été inversé avant finalisation.
  -- ----------------------------------------------------------

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
      coalesce(
        processed_at,
        clock_timestamp()
      ),

    processed_by =
      coalesce(
        processed_by,
        p_processed_by
      ),

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


  -- ----------------------------------------------------------
  -- IMPORTANT :
  --
  -- Tous les refunds initial + supplément ont été créés par
  -- prepare_full_payment_refunds AVANT le premier appel Stripe.
  --
  -- Donc remaining = 0 signifie réellement que tout ce qui
  -- devait être remboursé a été remboursé.
  -- ----------------------------------------------------------

  select count(*)
  into remaining
  from public.vip_refunds vr
  where vr.reservation_id =
      v.reservation_id

    and vr.payment_transaction_id
        is not null

    and vr.payment_type in (
      'full_payment_initial',
      'supplement'
    )

    and vr.status <> 'refunded';


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
