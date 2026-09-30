-- ============================================================
-- K-RÉ — CHANTIER 2 FINAL HARDENING
--
-- Objectifs :
-- 1. aucun règlement club avant J+1 calendrier Europe/Paris ;
-- 2. aucun règlement avec opération VIP non résolue ;
-- 3. aucun règlement avec paiement/refund en cours ;
-- 4. sérialiser refund et transfert Stripe ;
-- 5. conserver une validation K-RÉ manuelle avant transfert ;
-- 6. préserver les réservations legacy.
-- ============================================================

begin;


-- ============================================================
-- 1. GARDE-FOUS CENTRALISES D'UNE SOIREE
-- ============================================================

create or replace function public.event_settlement_blockers(
  p_event_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_blockers text[] := array[]::text[];
begin

  select *
  into v_event
  from public.events
  where id = p_event_id;

  if not found then
    return array[
      'Soirée introuvable.'
    ];
  end if;


  -- ----------------------------------------------------------
  -- K-RÉ fonctionne actuellement en France.
  --
  -- Règle métier retenue :
  -- règlement à partir de J+1 calendrier.
  --
  -- Aucune heure arbitraire n'est inventée ici.
  -- ----------------------------------------------------------

  if (
    clock_timestamp()
      at time zone 'Europe/Paris'
  )::date <= v_event.event_date then

    v_blockers :=
      array_append(
        v_blockers,
        'Le règlement club est disponible à partir de J+1.'
      );

  end if;


  -- Une soirée annulée ou encore en brouillon
  -- ne doit jamais déclencher un règlement club.

  if coalesce(
       v_event.status,
       'draft'
     ) <> 'published'
  then

    v_blockers :=
      array_append(
        v_blockers,
        'La soirée doit être publiée et non annulée.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Aucun Checkout full-payment encore potentiellement payable.
  -- Cela couvre initial ET supplément.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.payment_transactions pt
    where pt.event_id = p_event_id
      and pt.status = 'pending'
  ) then

    v_blockers :=
      array_append(
        v_blockers,
        'Un paiement client est encore en attente de finalisation.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Aucun refund en attente ou en cours.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.vip_refunds vr
    join public.reservations r
      on r.id = vr.reservation_id
    where r.event_id = p_event_id
      and vr.status in (
        'refund_pending',
        'refunding'
      )
  ) then

    v_blockers :=
      array_append(
        v_blockers,
        'Un remboursement est encore en attente ou en cours.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Aucun état métier non résolu sur une table possédant
  -- réellement une transaction financière K-RÉ active.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.vip_offers o
    where o.event_id = p_event_id

      and o.status in (
        'forming',
        'admin_review',
        'merge_pending',
        'decision_pending',
        'supplement_payment_pending',
        'refund_pending'
      )

      and exists (
        select 1
        from public.reservations r
        join public.payment_transactions pt
          on pt.reservation_id = r.id
        where r.vip_offer_id = o.id
          and pt.status in (
            'pending',
            'confirmed'
          )
      )
  ) then

    v_blockers :=
      array_append(
        v_blockers,
        'Une table VIP possède encore une opération de mutualisation ou de décision non résolue.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Aucun merge proposal encore actif.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.vip_merge_proposals mp
    join public.vip_offers source_offer
      on source_offer.id =
         mp.source_offer_id
    where source_offer.event_id =
          p_event_id
      and mp.status = 'pending'
  ) then

    v_blockers :=
      array_append(
        v_blockers,
        'Une proposition de fusion est encore en attente.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Toute transaction encaissée qui doit potentiellement être
  -- transférée doit avoir son identité Stripe complète.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.payment_transactions pt
    where pt.event_id = p_event_id
      and pt.status = 'confirmed'
      and pt.club_net_cents > 0
      and (
        pt.stripe_payment_intent_id
          is null
        or
        pt.stripe_account_id
          is null
      )
  ) then

    v_blockers :=
      array_append(
        v_blockers,
        'Une transaction confirmée possède un snapshot Stripe incomplet.'
      );

  end if;


  return v_blockers;

end;
$$;


revoke all on function
  public.event_settlement_blockers(uuid)
from public, anon, authenticated;

grant execute on function
  public.event_settlement_blockers(uuid)
to service_role;



-- ============================================================
-- 2. APPROBATION K-RÉ DURCIE
-- ============================================================

create or replace function public.admin_approve_event_settlement(
  p_event_id uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
  v_club public.clubs%rowtype;

  v_blockers text[];
  v_ready integer := 0;
begin

  if p_admin_user_id is null
     or not exists (
       select 1
       from public.profiles
       where id = p_admin_user_id
         and role = 'manager'
     )
  then
    raise exception
      'Seul un administrateur K-RÉ peut valider le règlement d''une soirée.'
      using errcode = '42501';
  end if;


  select *
  into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception
      'Soirée introuvable.';
  end if;


  v_blockers :=
    public.event_settlement_blockers(
      p_event_id
    );


  if coalesce(
       array_length(
         v_blockers,
         1
       ),
       0
     ) > 0
  then
    raise exception
      'Règlement impossible : %',
      array_to_string(
        v_blockers,
        ' | '
      )
      using errcode = '55000';
  end if;


  select *
  into v_club
  from public.clubs
  where id = v_event.club_id
  for update;

  if not found then
    raise exception
      'Club introuvable.';
  end if;


  /*
   * Ces flags restent un filtre conservateur local.
   *
   * Le moteur TypeScript vérifiera EN PLUS la capability
   * Stripe "transfers" directement auprès de Stripe avant
   * tout mouvement d'argent.
   */

  if v_club.stripe_account_id is null
     or v_club.stripe_charges_enabled
          is not true
     or v_club.stripe_payouts_enabled
          is not true
  then
    raise exception
      'Le compte Stripe Connect du club n''est pas prêt pour le règlement.'
      using errcode = '55000';
  end if;


  insert into public.event_settlements (
    event_id,
    club_id,
    status,
    approved_at,
    approved_by,
    held_at,
    held_by,
    hold_reason,
    updated_at
  )
  values (
    v_event.id,
    v_event.club_id,
    'approved',
    clock_timestamp(),
    p_admin_user_id,
    null,
    null,
    null,
    clock_timestamp()
  )
  on conflict (event_id)
  do update set

    status = 'approved',

    approved_at =
      clock_timestamp(),

    approved_by =
      p_admin_user_id,

    held_at = null,
    held_by = null,
    hold_reason = null,

    updated_at =
      clock_timestamp();


  update public.payment_transactions pt
  set

    transfer_status =
      'ready',

    transfer_last_error =
      null

  where pt.event_id =
        p_event_id

    and pt.status =
        'confirmed'

    and pt.club_net_cents > 0

    and pt.stripe_transfer_id
        is null

    and pt.transfer_status in (
      'not_ready',
      'failed'
    )

    and not exists (
      select 1
      from public.vip_refunds vr
      where vr.payment_transaction_id =
            pt.id
        and vr.status in (
          'refund_pending',
          'refunding'
        )
    );


  get diagnostics
    v_ready = row_count;


  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'status', 'approved',
    'transactions_ready', v_ready
  );

end;
$$;


revoke all on function
  public.admin_approve_event_settlement(
    uuid,
    uuid
  )
from public, anon, authenticated;

grant execute on function
  public.admin_approve_event_settlement(
    uuid,
    uuid
  )
to service_role;



-- ============================================================
-- 3. CLAIM TRANSFERT DURCI
-- ============================================================

create or replace function public.claim_payment_transfer(
  p_transaction_id uuid
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txn public.payment_transactions%rowtype;
  v_settlement public.event_settlements%rowtype;

  v_blockers text[];
begin

  /*
   * Le lock sur payment_transactions est également utilisé
   * par le trigger refund défini plus bas.
   *
   * Refund et transfert deviennent donc mutuellement exclusifs
   * pendant la phase critique.
   */

  select *
  into v_txn
  from public.payment_transactions
  where id = p_transaction_id
  for update;


  if not found then
    raise exception
      'Transaction introuvable.';
  end if;


  if v_txn.stripe_transfer_id
       is not null
     or v_txn.transfer_status =
        'transferred'
  then
    return v_txn;
  end if;


  select *
  into v_settlement
  from public.event_settlements
  where event_id =
        v_txn.event_id
  for update;


  if not found
     or v_settlement.status <>
        'approved'
  then
    raise exception
      'Le règlement de cette soirée n''est pas approuvé.'
      using errcode = '55000';
  end if;


  -- Revalidation juste avant le claim.
  -- Une approbation ancienne ne suffit jamais.

  v_blockers :=
    public.event_settlement_blockers(
      v_txn.event_id
    );


  if coalesce(
       array_length(
         v_blockers,
         1
       ),
       0
     ) > 0
  then
    raise exception
      'Transfert impossible : %',
      array_to_string(
        v_blockers,
        ' | '
      )
      using errcode = '55000';
  end if;


  if v_txn.status <>
     'confirmed'
  then
    raise exception
      'La transaction client n''est pas confirmée.';
  end if;


  if exists (
    select 1
    from public.vip_refunds vr
    where vr.payment_transaction_id =
          v_txn.id
      and vr.status in (
        'refund_pending',
        'refunding'
      )
  ) then
    raise exception
      'Un remboursement est en cours pour cette transaction.'
      using errcode = '55000';
  end if;


  if v_txn.club_net_cents <= 0 then
    raise exception
      'Montant club invalide.';
  end if;


  if v_txn.stripe_account_id
       is null
  then
    raise exception
      'Compte Stripe du club absent.';
  end if;


  if v_txn.transfer_status =
       'processing'

     and coalesce(
       v_txn.transfer_requested_at,
       '-infinity'::timestamptz
     ) >=
       clock_timestamp()
       - interval '15 minutes'
  then

    raise exception
      'Un transfert est déjà en cours pour cette transaction.'
      using errcode = '55000';

  end if;


  if v_txn.transfer_status
       not in (
         'ready',
         'failed',
         'processing'
       )
  then
    raise exception
      'Cette transaction n''est pas transférable actuellement.';
  end if;


  update public.payment_transactions
  set

    transfer_status =
      'processing',

    transfer_requested_at =
      clock_timestamp(),

    transfer_attempt_count =
      transfer_attempt_count + 1,

    transfer_last_error =
      null

  where id = v_txn.id

  returning *
  into v_txn;


  return v_txn;

end;
$$;


revoke all on function
  public.claim_payment_transfer(uuid)
from public, anon, authenticated;

grant execute on function
  public.claim_payment_transfer(uuid)
to service_role;



-- ============================================================
-- 4. VERROU REFUND <-> TRANSFER
-- ============================================================

create or replace function
public.guard_refund_against_processing_transfer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer_status text;
begin

  -- Les anciens refunds legacy n'ont pas forcément
  -- payment_transaction_id.
  if new.payment_transaction_id
       is null
  then
    return new;
  end if;


  /*
   * On prend volontairement le même row lock que
   * claim_payment_transfer().
   *
   * Si le refund gagne la course :
   *   le claim attend puis voit le vip_refund.
   *
   * Si le transfert gagne la course :
   *   le refund attend puis voit processing.
   */

  select pt.transfer_status
  into v_transfer_status
  from public.payment_transactions pt
  where pt.id =
        new.payment_transaction_id
  for update;


  if not found then
    raise exception
      'Transaction financière du remboursement introuvable.';
  end if;


  if v_transfer_status =
       'processing'
  then
    raise exception
      'Un transfert club est actuellement en cours pour cette transaction.'
      using errcode = '55000';
  end if;


  return new;

end;
$$;


revoke all on function
  public.guard_refund_against_processing_transfer()
from public, anon, authenticated;


drop trigger if exists
  guard_refund_against_processing_transfer
on public.vip_refunds;


create trigger
  guard_refund_against_processing_transfer

before insert or update of
  payment_transaction_id,
  status

on public.vip_refunds

for each row

execute function
  public.guard_refund_against_processing_transfer();



-- ============================================================
-- 5. FINALISATION SETTLEMENT DURCIE
-- ============================================================

create or replace function
public.finalize_event_settlement_if_complete(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
  v_blockers text[];
begin

  v_blockers :=
    public.event_settlement_blockers(
      p_event_id
    );


  if coalesce(
       array_length(
         v_blockers,
         1
       ),
       0
     ) > 0
  then

    return jsonb_build_object(
      'success', true,
      'settled', false,
      'remaining', null,
      'blocked', true,
      'blockers', v_blockers
    );

  end if;


  select count(*)::integer
  into v_remaining
  from public.payment_transactions
  where event_id =
        p_event_id

    and status =
        'confirmed'

    and club_net_cents > 0

    and transfer_status
        not in (
          'transferred',
          'reversed'
        );


  if v_remaining = 0 then

    update public.event_settlements
    set

      status =
        'settled',

      settled_at =
        coalesce(
          settled_at,
          clock_timestamp()
        ),

      updated_at =
        clock_timestamp()

    where event_id =
          p_event_id

      and status =
          'approved';


    return jsonb_build_object(
      'success', true,
      'settled', true,
      'remaining', 0,
      'blocked', false
    );

  end if;


  return jsonb_build_object(
    'success', true,
    'settled', false,
    'remaining', v_remaining,
    'blocked', false
  );

end;
$$;


revoke all on function
  public.finalize_event_settlement_if_complete(uuid)
from public, anon, authenticated;

grant execute on function
  public.finalize_event_settlement_if_complete(uuid)
to service_role;


notify pgrst, 'reload schema';

commit;
