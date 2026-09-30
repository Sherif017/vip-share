-- ============================================================
-- K-RÉ — CHANTIER 2
-- Mutualisation + circulation de l'argent
--
-- Objectifs :
-- 1. conserver les snapshots financiers du Chantier 1 ;
-- 2. ajouter un cycle de vie explicite des transferts club ;
-- 3. imposer une validation K-RÉ avant tout transfert ;
-- 4. rendre les transferts retry-safe ;
-- 5. adapter les fusions au nouveau modèle full_payment ;
-- 6. ne modifier aucune réservation legacy existante.
-- ============================================================

begin;

-- ============================================================
-- 1. ETAT DE REGLEMENT D'UNE SOIREE
-- ============================================================

create table if not exists public.event_settlements (
  event_id uuid primary key references public.events(id) on delete restrict,
  club_id uuid not null references public.clubs(id) on delete restrict,

  status text not null default 'pending_review'
    check (
      status in (
        'pending_review',
        'approved',
        'held',
        'settled'
      )
    ),

  approved_at timestamptz,
  approved_by uuid references public.profiles(id),

  held_at timestamptz,
  held_by uuid references public.profiles(id),
  hold_reason text,

  settled_at timestamptz,

  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

comment on table public.event_settlements is
  'Validation K-RÉ avant transfert des fonds d''une soirée vers le compte Stripe Connect du club. Le transfert Stripe est distinct du payout bancaire.';

alter table public.event_settlements enable row level security;

revoke all on table public.event_settlements
from public, anon, authenticated;

grant select, insert, update, delete
on table public.event_settlements
to service_role;

grant select
on table public.event_settlements
to authenticated;

drop policy if exists
  "platform_managers_read_event_settlements"
on public.event_settlements;

create policy "platform_managers_read_event_settlements"
on public.event_settlements
for select
to authenticated
using (
  public.is_manager((select auth.uid()))
);

drop policy if exists
  "club_admins_read_own_event_settlements"
on public.event_settlements;

create policy "club_admins_read_own_event_settlements"
on public.event_settlements
for select
to authenticated
using (
  exists (
    select 1
    from public.club_memberships cm
    where cm.user_id = (select auth.uid())
      and cm.club_id = event_settlements.club_id
      and cm.role = 'admin'
      and cm.status = 'active'
  )
);

-- ============================================================
-- 2. CYCLE DE VIE DES TRANSFERTS
-- ============================================================

alter table public.payment_transactions
  add column if not exists transfer_status text
    not null default 'not_ready';

alter table public.payment_transactions
  drop constraint if exists
    payment_transactions_transfer_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_transfer_status_check
  check (
    transfer_status in (
      'not_ready',
      'ready',
      'processing',
      'transferred',
      'failed',
      'reversed'
    )
  );

alter table public.payment_transactions
  add column if not exists transfer_attempt_count integer
    not null default 0;

alter table public.payment_transactions
  add column if not exists transfer_requested_at timestamptz;

alter table public.payment_transactions
  add column if not exists transferred_at timestamptz;

alter table public.payment_transactions
  add column if not exists transfer_failed_at timestamptz;

alter table public.payment_transactions
  add column if not exists transfer_last_error text;

alter table public.payment_transactions
  add column if not exists transfer_reversed_at timestamptz;

alter table public.payment_transactions
  add column if not exists transfer_reversal_reason text;

create index if not exists
  payment_transactions_transfer_status_idx
on public.payment_transactions(transfer_status);

create index if not exists
  payment_transactions_event_transfer_idx
on public.payment_transactions(event_id, transfer_status);

comment on column public.payment_transactions.transfer_status is
  'Etat du transfert Stripe Connect vers le club. Un paiement client confirmé ne devient ready qu''après validation explicite de la soirée par K-RÉ.';

-- ============================================================
-- 3. APPROBATION MANUELLE K-RÉ
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
    raise exception 'Seul un administrateur K-RÉ peut valider le règlement d''une soirée.'
      using errcode = '42501';
  end if;

  select *
  into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Soirée introuvable.';
  end if;

  select *
  into v_club
  from public.clubs
  where id = v_event.club_id
  for update;

  if not found then
    raise exception 'Club introuvable.';
  end if;

  if v_club.stripe_account_id is null
     or v_club.stripe_charges_enabled is not true
     or v_club.stripe_payouts_enabled is not true
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
    approved_at = clock_timestamp(),
    approved_by = p_admin_user_id,
    held_at = null,
    held_by = null,
    hold_reason = null,
    updated_at = clock_timestamp();

  update public.payment_transactions pt
  set
    transfer_status = 'ready',
    transfer_last_error = null
  where pt.event_id = p_event_id
    and pt.status = 'confirmed'
    and pt.club_net_cents > 0
    and pt.stripe_transfer_id is null
    and pt.transfer_status in (
      'not_ready',
      'failed'
    );

  get diagnostics v_ready = row_count;

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'status', 'approved',
    'transactions_ready', v_ready
  );
end;
$$;

revoke all on function
  public.admin_approve_event_settlement(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.admin_approve_event_settlement(uuid, uuid)
to service_role;

-- ============================================================
-- 4. HOLD MANUEL K-RÉ
-- ============================================================

create or replace function public.admin_hold_event_settlement(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
begin
  if p_admin_user_id is null
     or not exists (
       select 1
       from public.profiles
       where id = p_admin_user_id
         and role = 'manager'
     )
  then
    raise exception 'Seul un administrateur K-RÉ peut bloquer le règlement.'
      using errcode = '42501';
  end if;

  select *
  into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Soirée introuvable.';
  end if;

  insert into public.event_settlements (
    event_id,
    club_id,
    status,
    held_at,
    held_by,
    hold_reason,
    updated_at
  )
  values (
    v_event.id,
    v_event.club_id,
    'held',
    clock_timestamp(),
    p_admin_user_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    clock_timestamp()
  )
  on conflict (event_id)
  do update set
    status = 'held',
    held_at = clock_timestamp(),
    held_by = p_admin_user_id,
    hold_reason =
      nullif(trim(coalesce(p_reason, '')), ''),
    updated_at = clock_timestamp();

  update public.payment_transactions
  set transfer_status = 'not_ready'
  where event_id = p_event_id
    and stripe_transfer_id is null
    and transfer_status in ('ready', 'failed');

  return jsonb_build_object(
    'success', true,
    'event_id', p_event_id,
    'status', 'held'
  );
end;
$$;

revoke all on function
  public.admin_hold_event_settlement(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.admin_hold_event_settlement(uuid, uuid, text)
to service_role;

-- ============================================================
-- 5. CLAIM ATOMIQUE D'UN TRANSFERT
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
begin
  select *
  into v_txn
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction introuvable.';
  end if;

  if v_txn.stripe_transfer_id is not null
     or v_txn.transfer_status = 'transferred'
  then
    return v_txn;
  end if;

  select *
  into v_settlement
  from public.event_settlements
  where event_id = v_txn.event_id
  for update;

  if not found
     or v_settlement.status <> 'approved'
  then
    raise exception 'Le règlement de cette soirée n''est pas approuvé.'
      using errcode = '55000';
  end if;

  if v_txn.status <> 'confirmed' then
    raise exception 'La transaction client n''est pas confirmée.';
  end if;

  if v_txn.club_net_cents <= 0 then
    raise exception 'Montant club invalide.';
  end if;

  if v_txn.stripe_account_id is null then
    raise exception 'Compte Stripe du club absent.';
  end if;

  -- Un claim processing récent appartient potentiellement encore
  -- à un worker actif : on ne le vole jamais.
  --
  -- En revanche, un worker mort après le claim SQL aurait laissé
  -- la transaction bloquée indéfiniment. Après 15 minutes, elle
  -- devient récupérable. Le moteur Stripe recherchera d'abord un
  -- éventuel transfert déjà créé avant d'en créer un nouveau.
  if v_txn.transfer_status = 'processing'
     and coalesce(
       v_txn.transfer_requested_at,
       '-infinity'::timestamptz
     ) >= clock_timestamp() - interval '15 minutes'
  then
    raise exception 'Un transfert est déjà en cours pour cette transaction.'
      using errcode = '55000';
  end if;

  if v_txn.transfer_status not in (
    'ready',
    'failed',
    'processing'
  ) then
    raise exception 'Cette transaction n''est pas transférable actuellement.';
  end if;

  update public.payment_transactions
  set
    transfer_status = 'processing',
    transfer_requested_at = clock_timestamp(),
    transfer_attempt_count = transfer_attempt_count + 1,
    transfer_last_error = null
  where id = v_txn.id
  returning * into v_txn;

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
-- 6. CONFIRMATION DU TRANSFERT
-- ============================================================

create or replace function public.complete_payment_transfer(
  p_transaction_id uuid,
  p_stripe_transfer_id text,
  p_stripe_charge_id text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txn public.payment_transactions%rowtype;
begin
  select *
  into v_txn
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction introuvable.';
  end if;

  if v_txn.stripe_transfer_id is not null then
    if v_txn.stripe_transfer_id <> p_stripe_transfer_id then
      raise exception 'Un autre transfert Stripe est déjà enregistré.';
    end if;

    return v_txn;
  end if;

  if v_txn.transfer_status <> 'processing' then
    raise exception 'La transaction n''est pas en cours de transfert.';
  end if;

  update public.payment_transactions
  set
    stripe_transfer_id = p_stripe_transfer_id,
    stripe_charge_id =
      coalesce(stripe_charge_id, p_stripe_charge_id),
    transfer_status = 'transferred',
    transferred_at = clock_timestamp(),
    transfer_failed_at = null,
    transfer_last_error = null
  where id = v_txn.id
  returning * into v_txn;

  return v_txn;
end;
$$;

revoke all on function
  public.complete_payment_transfer(uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.complete_payment_transfer(uuid, text, text)
to service_role;

-- ============================================================
-- 7. ECHEC RETRYABLE
-- ============================================================

create or replace function public.fail_payment_transfer(
  p_transaction_id uuid,
  p_error text
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txn public.payment_transactions%rowtype;
begin
  update public.payment_transactions
  set
    transfer_status = 'failed',
    transfer_failed_at = clock_timestamp(),
    transfer_last_error =
      left(coalesce(p_error, 'Erreur Stripe'), 2000)
  where id = p_transaction_id
    and stripe_transfer_id is null
    and transfer_status = 'processing'
  returning * into v_txn;

  if v_txn.id is null then
    select *
    into v_txn
    from public.payment_transactions
    where id = p_transaction_id;
  end if;

  return v_txn;
end;
$$;

revoke all on function
  public.fail_payment_transfer(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.fail_payment_transfer(uuid, text)
to service_role;

-- ============================================================
-- 8. FINALISATION DU REGLEMENT DE SOIREE
-- ============================================================

create or replace function public.finalize_event_settlement_if_complete(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
begin
  select count(*)::integer
  into v_remaining
  from public.payment_transactions
  where event_id = p_event_id
    and status = 'confirmed'
    and club_net_cents > 0
    and transfer_status not in (
      'transferred',
      'reversed'
    );

  if v_remaining = 0 then
    update public.event_settlements
    set
      status = 'settled',
      settled_at = coalesce(
        settled_at,
        clock_timestamp()
      ),
      updated_at = clock_timestamp()
    where event_id = p_event_id
      and status = 'approved';

    return jsonb_build_object(
      'success', true,
      'settled', true,
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'settled', false,
    'remaining', v_remaining
  );
end;
$$;

revoke all on function
  public.finalize_event_settlement_if_complete(uuid)
from public, anon, authenticated;

grant execute on function
  public.finalize_event_settlement_if_complete(uuid)
to service_role;

-- ============================================================
-- 9. MUTUALISATION : COMPATIBILITE FULL_PAYMENT
-- ============================================================
--
-- L'ancienne fonction imposait :
--
-- reservation.deposit_paid =
--   offer.deposit_per_person * quantity
--
-- Ce test est correct pour legacy_deposit mais faux pour
-- full_payment, où deposit_paid = total_price après paiement.
--
-- On conserve donc STRICTEMENT l'ancien contrôle pour legacy,
-- et on valide full_payment contre payment_transactions.
-- ============================================================

create or replace function public.vip_merge_invalid_reason(
  p_source uuid,
  p_target uuid,
  p_final boolean
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  s public.vip_offers%rowtype;
  t public.vip_offers%rowtype;
  source_count bigint;
  target_count bigint;
begin
  select * into s
  from public.vip_offers
  where id = p_source;

  select * into t
  from public.vip_offers
  where id = p_target;

  if s.id is null
     or t.id is null
     or s.id = t.id
  then
    return 'Tables invalides.';
  end if;

  if s.event_id is distinct from t.event_id then
    return 'Les tables doivent appartenir à la même soirée.';
  end if;

  if s.status is distinct from
       (
         case
           when p_final then 'merge_pending'
           else 'admin_review'
         end
       )
     or t.status is null
     or t.status not in (
       'forming',
       'confirmed',
       'admin_review'
     )
     or t.merge_status = 'pending'
     or (
       not p_final
       and s.merge_status = 'pending'
     )
  then
    return 'Une table est indisponible pour une fusion.';
  end if;

  if exists (
    select 1
    from public.vip_offers o
    where o.merge_status = 'pending'
      and o.id <> p_source
      and (
        o.id = p_target
        or o.merge_target_offer_id in (
          p_source,
          p_target
        )
      )
  ) then
    return 'Une autre fusion implique déjà une de ces tables.';
  end if;

  if exists (
    select 1
    from public.vip_merge_proposals p
    where p.status = 'pending'
      and p.source_offer_id <> p_source
      and (
        p.source_offer_id in (
          p_source,
          p_target
        )
        or p.target_offer_id in (
          p_source,
          p_target
        )
      )
  ) then
    return 'Une autre fusion est en attente.';
  end if;

  -- Même prix VIP obligatoire :
  -- une fusion ne doit jamais modifier l'économie du client.
  if s.price_per_person is distinct from t.price_per_person
     or s.price_per_person <= 0
  then
    return 'Les tarifs VIP des deux tables doivent être identiques.';
  end if;

  -- Legacy uniquement : ancien découpage acompte/reste.
  if exists (
    select 1
    from public.reservations r
    where r.vip_offer_id in (
      p_source,
      p_target
    )
      and r.status = 'confirmed'
      and coalesce(
        r.payment_model,
        'legacy_deposit'
      ) = 'legacy_deposit'
  ) then
    if s.deposit_per_person
         is distinct from
         t.deposit_per_person
       or s.remaining_per_person
         is distinct from
         t.remaining_per_person
       or s.deposit_per_person < 0
       or s.remaining_per_person < 0
       or s.price_per_person
         <> s.deposit_per_person
            + s.remaining_per_person
    then
      return 'Les conditions legacy des deux tables sont incompatibles.';
    end if;
  end if;

  -- Aucun workflow financier concurrent.
  if exists (
    select 1
    from public.reservations r
    where r.vip_offer_id in (
      p_source,
      p_target
    )
      and (
        r.status = 'checked_in'
        or coalesce(r.checked_in, false)
        or coalesce(
          r.checked_in_quantity,
          0
        ) > 0
        or r.checked_in_at is not null
        or r.supplement_paid_at is not null
        or coalesce(
          r.supplement_amount,
          0
        ) <> 0
        or r.supplement_status is not null
        or r.supplement_stripe_session_id
             is not null
        or r.stripe_supplement_session_id
             is not null
        or r.status is null
        or r.status not in (
          'confirmed',
          'cancelled',
          'expired',
          'refunded'
        )
      )
  ) then
    return 'Check-in, paiement ou supplément incompatible avec une fusion.';
  end if;

  -- Validation des réservations legacy.
  if exists (
    select 1
    from public.reservations r
    where r.vip_offer_id in (
      p_source,
      p_target
    )
      and r.status = 'confirmed'
      and coalesce(
        r.payment_model,
        'legacy_deposit'
      ) = 'legacy_deposit'
      and (
        r.event_id
          is distinct from
          s.event_id
        or r.user_id is null
        or r.quantity <= 0
        or r.refunded_at is not null
        or r.refund_requested_at
             is not null
        or r.decision_choice is not null
        or r.total_price
             <> s.price_per_person
                * r.quantity
        or r.deposit_paid
             <> s.deposit_per_person
                * r.quantity
        or r.remaining_amount
             <> s.remaining_per_person
                * r.quantity
      )
  ) then
    return 'Une réservation legacy possède des conditions financières incompatibles.';
  end if;

  -- Validation des réservations full_payment.
  if exists (
    select 1
    from public.reservations r
    left join public.payment_transactions pt
      on pt.reservation_id = r.id
     and pt.payment_type = 'initial'
    where r.vip_offer_id in (
      p_source,
      p_target
    )
      and r.status = 'confirmed'
      and r.payment_model = 'full_payment'
      and (
        r.event_id
          is distinct from
          s.event_id
        or r.user_id is null
        or r.quantity <= 0
        or r.refunded_at is not null
        or r.refund_requested_at
             is not null
        or r.decision_choice is not null
        or pt.id is null
        or pt.status <> 'confirmed'
        or pt.event_id
             is distinct from
             r.event_id
        or pt.club_id
             is distinct from
             r.club_id
        or pt.vip_subtotal_cents
             <> round(
                  r.total_price
                  * 100
                )::integer
      )
  ) then
    return 'Une réservation en paiement intégral possède des conditions financières incompatibles.';
  end if;

  select coalesce(
    sum(quantity),
    0
  )
  into source_count
  from public.reservations
  where vip_offer_id = p_source
    and status = 'confirmed';

  select coalesce(
    sum(quantity),
    0
  )
  into target_count
  from public.reservations
  where vip_offer_id = p_target
    and status = 'confirmed';

  if source_count = 0
     or source_count >=
        s.confirmation_threshold
  then
    return 'La table source doit avoir des participants et être sous son seuil.';
  end if;

  if source_count + target_count
       > t.capacity
  then
    return 'Capacité de la table cible insuffisante.';
  end if;

  return null;
end;
$$;

-- Fonction interne uniquement.
revoke all on function
  public.vip_merge_invalid_reason(uuid, uuid, boolean)
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
