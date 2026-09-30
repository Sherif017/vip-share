-- CHANTIER 1 : fondation financiere + Stripe Connect + paiement integral.
-- Purement additif : aucune colonne/fonction/route legacy supprimee ou
-- modifiee dans son comportement. Les anciennes reservations (acompte,
-- deposit_paid/remaining_amount, events.commission_percentage) continuent
-- de fonctionner sans aucun changement.
--
-- Reconstruit fidelement a partir de ce qui a ete applique directement
-- sur share vip (xhgwosyiudkpmgppxhdb) via apply_migration. Non rejouee
-- sur Production (deja appliquee) -- ce fichier sert de reference
-- versionnee pour Staging et pour l'historique du projet.
begin;

-- ==========================================================
-- 1. PARAMETRES GLOBAUX K-RE (singleton)
-- ==========================================================

create table public.platform_settings (
  id boolean primary key default true check (id),
  service_fee_bps integer not null default 275 check (service_fee_bps >= 0 and service_fee_bps <= 10000),
  service_fee_minimum_cents integer not null default 30 check (service_fee_minimum_cents >= 0),
  currency text not null default 'eur',
  country text not null default 'FR',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.profiles(id)
);

insert into public.platform_settings (id) values (true);

comment on table public.platform_settings is
  'Parametres financiers globaux K-RE (frais de service, devise). Ligne unique (id=true). Pilote : EUR/FR uniquement, mais schema pret pour evolution ulterieure.';

alter table public.platform_settings enable row level security;

revoke all on table public.platform_settings from anon, authenticated;
grant select, update on table public.platform_settings to service_role;

-- Lecture publique du SEUL taux de frais de service (necessaire pour que
-- le checkout client affiche le bon montant avant paiement), sans exposer
-- le reste de la table de config par une vue dediee restreinte.
create view public.public_service_fee_config
  with (security_invoker = true) as
  select service_fee_bps, service_fee_minimum_cents, currency
  from public.platform_settings
  where id = true;

grant select on public.public_service_fee_config to anon, authenticated;

-- ==========================================================
-- 2. CLUBS : Stripe Connect + commission (additif)
-- ==========================================================

alter table public.clubs
  add column commission_bps integer check (commission_bps is null or (commission_bps >= 0 and commission_bps <= 10000)),
  add column stripe_account_id text,
  add column stripe_onboarding_status text not null default 'not_started'
    check (stripe_onboarding_status in ('not_started','pending','complete')),
  add column stripe_details_submitted boolean not null default false,
  add column stripe_charges_enabled boolean not null default false,
  add column stripe_payouts_enabled boolean not null default false,
  add column stripe_account_updated_at timestamptz,
  add column commission_updated_at timestamptz,
  add column commission_updated_by uuid references public.profiles(id);

comment on column public.clubs.commission_bps is
  'Taux de commission K-RE pour ce club, en basis points (1500 = 15%). NULL = non configure, le club ne peut pas encore vendre en paiement integral. Modifiable uniquement par un admin K-RE (profiles.role=''manager'').';
comment on column public.clubs.stripe_account_id is 'Connected account Stripe (acct_...) de ce club.';

create unique index clubs_stripe_account_id_key on public.clubs (stripe_account_id) where stripe_account_id is not null;

-- ==========================================================
-- 3. RESERVATIONS : distinction legacy / paiement integral (additif)
-- ==========================================================

alter table public.reservations
  add column payment_model text not null default 'legacy_deposit'
    check (payment_model in ('legacy_deposit','full_payment')),
  add column club_id uuid references public.clubs(id);

comment on column public.reservations.payment_model is
  'legacy_deposit = ancien modele acompte+restant (inchange). full_payment = nouveau modele 100% + frais de service K-RE. Fixe a la creation, jamais retroactif.';

-- Backfill non destructif pour les lignes existantes (toutes legacy_deposit
-- par le defaut ci-dessus) : renseigne juste club_id pour accelerer les
-- futures policies RLS/dashboards, ne touche a aucun montant existant.
update public.reservations r
set club_id = e.club_id
from public.events e
where e.id = r.event_id
  and r.club_id is null;

create index reservations_club_id_idx on public.reservations (club_id);
create index reservations_payment_model_idx on public.reservations (payment_model);

-- ==========================================================
-- 4. PAYMENT_TRANSACTIONS : snapshot financier + futur ledger transferts
-- ==========================================================

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_type text not null default 'initial' check (payment_type in ('initial','supplement')),
  club_id uuid not null references public.clubs(id),
  event_id uuid not null references public.events(id),

  vip_subtotal_cents integer not null check (vip_subtotal_cents >= 0),
  service_fee_rate_bps integer not null check (service_fee_rate_bps >= 0),
  service_fee_cents integer not null check (service_fee_cents >= 0),
  commission_rate_bps integer not null check (commission_rate_bps >= 0),
  commission_cents integer not null check (commission_cents >= 0),
  club_net_cents integer not null check (club_net_cents >= 0),
  total_customer_cents integer not null check (total_customer_cents >= 0),
  currency text not null default 'eur',

  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_account_id text,
  transfer_group text,
  stripe_transfer_id text,
  stripe_transfer_reversal_id text,

  status text not null default 'pending' check (status in ('pending','confirmed','expired','refunded')),

  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,

  constraint payment_transactions_vip_split_check
    check (commission_cents + club_net_cents = vip_subtotal_cents),
  constraint payment_transactions_total_check
    check (vip_subtotal_cents + service_fee_cents = total_customer_cents),

  unique (reservation_id, payment_type)
);

comment on table public.payment_transactions is
  'Ledger/snapshot financier : une ligne par transaction de paiement integral (initial ou supplement futur). Source de verite pour la repartition VIP/frais service/commission/net club et pour les futurs transferts Stripe Connect (Chantier 2). Jamais modifie retroactivement quand le taux du club change ensuite.';

create index payment_transactions_club_id_idx on public.payment_transactions (club_id);
create index payment_transactions_status_idx on public.payment_transactions (status);

alter table public.payment_transactions enable row level security;

revoke all on table public.payment_transactions from anon, authenticated;
grant select, insert, update, delete on table public.payment_transactions to service_role;

-- Lecture seule pour les managers de club (leur club uniquement) et les
-- admins K-RE (tous), performance-optimisee ((select auth.uid())) suivant
-- la recommandation de l'advisor Supabase releve lors de l'audit.
create policy "platform_managers_read_all_payment_transactions"
  on public.payment_transactions for select to authenticated
  using (public.is_manager((select auth.uid())));

create policy "club_admins_read_own_club_payment_transactions"
  on public.payment_transactions for select to authenticated
  using (
    exists (
      select 1 from public.club_memberships cm
      where cm.user_id = (select auth.uid())
        and cm.club_id = payment_transactions.club_id
        and cm.role = 'admin'
        and cm.status = 'active'
    )
  );

-- ==========================================================
-- 5. is_manager() : durcissement des grants (hygiene, non-bloquant)
--
-- La fonction contient deja le garde p_user_id = auth.uid() (verifie
-- avant migration) : aucune fuite inter-utilisateurs n'est possible en
-- pratique. On retire neanmoins l'acces explicite a anon/public, en
-- conservant authenticated puisque les policies RLS existantes
-- (club_memberships) en dependent directement.
-- ==========================================================

revoke all on function public.is_manager(uuid) from public, anon;
grant execute on function public.is_manager(uuid) to authenticated, service_role;

-- ==========================================================
-- 6. create_full_payment_reservation : creation cote nouveau modele
--
-- Parallele a create_vip_reservation, JAMAIS un branchement dedans :
-- zero risque de regression sur le chemin legacy, deja tres teste.
-- Meme protections (FOR UPDATE, deadline, capacite) que la fonction
-- legacy ; calcul serveur des montants (le navigateur ne fournit que
-- offer_id/quantite) ; bloque si le club n'est pas Stripe-pret.
-- ==========================================================

create or replace function public.create_full_payment_reservation(
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
returns table(
  reservation_id uuid,
  reservation_code text,
  vip_subtotal_cents integer,
  service_fee_cents integer,
  total_customer_cents integer,
  commission_rate_bps integer,
  service_fee_rate_bps integer,
  currency text,
  stripe_account_id text,
  already_exists boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.reservations%rowtype;
  v_existing_txn public.payment_transactions%rowtype;
  v_event_id uuid;
  v_club_id uuid;
  v_offer_id uuid;
  v_capacity integer;
  v_spots_reserved integer;
  v_price_per_person numeric(10,2);
  v_booking_deadline timestamptz;
  v_club_stripe_account_id text;
  v_club_charges_enabled boolean;
  v_commission_bps integer;
  v_settings public.platform_settings%rowtype;
  v_vip_subtotal_cents integer;
  v_service_fee_cents integer;
  v_commission_cents integer;
  v_club_net_cents integer;
  v_total_customer_cents integer;
  v_reservation_id uuid;
  v_reservation_code text;
begin
  if p_checkout_attempt_id is null then
    raise exception 'Identifiant de tentative de paiement obligatoire.' using errcode = '22023';
  end if;

  select * into v_existing from public.reservations
  where user_id = p_user_id and initial_checkout_attempt_id = p_checkout_attempt_id
  for update;

  if found then
    select * into v_existing_txn from public.payment_transactions
    where reservation_id = v_existing.id and payment_type = 'initial';

    return query select v_existing.id, v_existing.reservation_code,
      v_existing_txn.vip_subtotal_cents, v_existing_txn.service_fee_cents, v_existing_txn.total_customer_cents,
      v_existing_txn.commission_rate_bps, v_existing_txn.service_fee_rate_bps, v_existing_txn.currency,
      v_existing_txn.stripe_account_id, true;
    return;
  end if;

  if p_user_id is null then raise exception 'Utilisateur invalide.'; end if;
  if p_event_slug is null or trim(p_event_slug) = '' then raise exception 'Evenement invalide.'; end if;
  if p_vip_offer_id is null then raise exception 'Table invalide.'; end if;
  if p_firstname is null or trim(p_firstname) = '' then raise exception 'Prenom obligatoire.'; end if;
  if p_lastname is null or trim(p_lastname) = '' then raise exception 'Nom obligatoire.'; end if;
  if p_email is null or trim(p_email) = '' then raise exception 'Email obligatoire.'; end if;
  if p_phone is null or trim(p_phone) = '' then raise exception 'Telephone obligatoire.'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantite invalide.'; end if;

  select e.id, e.club_id into v_event_id, v_club_id
  from public.events e
  where e.slug = p_event_slug and e.status = 'published'
  limit 1;

  if v_event_id is null then raise exception 'Evenement introuvable.'; end if;

  select c.stripe_account_id, c.stripe_charges_enabled, c.commission_bps
  into v_club_stripe_account_id, v_club_charges_enabled, v_commission_bps
  from public.clubs c
  where c.id = v_club_id
  for update;

  -- Jamais confiance au frontend : re-verifie cote serveur que le club
  -- est reellement pret, quel que soit ce que l'UI affichait.
  if v_club_charges_enabled is not true or v_club_stripe_account_id is null then
    raise exception 'Ce club n''accepte pas encore le paiement integral (Stripe Connect non actif).' using errcode = '55000';
  end if;

  if v_commission_bps is null then
    raise exception 'La commission de ce club n''est pas encore configuree par K-RE.' using errcode = '55000';
  end if;

  select vo.id, vo.capacity, coalesce(vo.spots_reserved, 0), vo.price_per_person, vo.booking_deadline
  into v_offer_id, v_capacity, v_spots_reserved, v_price_per_person, v_booking_deadline
  from public.vip_offers vo
  where vo.id = p_vip_offer_id and vo.event_id = v_event_id
  limit 1
  for update;

  if v_offer_id is null then raise exception 'Cette table est introuvable pour cette soiree.'; end if;

  if v_booking_deadline is not null and now() >= v_booking_deadline then
    raise exception 'Les reservations sont terminees pour cette table.';
  end if;

  if v_spots_reserved + p_quantity > v_capacity then
    raise exception 'Il ne reste pas assez de places disponibles sur cette table.';
  end if;

  select * into v_settings from public.platform_settings where id = true;

  v_vip_subtotal_cents := round(v_price_per_person * p_quantity * 100)::integer;
  v_service_fee_cents := greatest(
    round(v_vip_subtotal_cents * v_settings.service_fee_bps / 10000.0)::integer,
    v_settings.service_fee_minimum_cents
  );
  v_total_customer_cents := v_vip_subtotal_cents + v_service_fee_cents;
  v_commission_cents := round(v_vip_subtotal_cents * v_commission_bps / 10000.0)::integer;
  v_club_net_cents := v_vip_subtotal_cents - v_commission_cents;

  v_reservation_id := gen_random_uuid();
  v_reservation_code := 'VIP-' || upper(replace(gen_random_uuid()::text, '-', ''));

  insert into public.reservations (
    id, event_id, vip_offer_id, club_id, user_id,
    firstname, lastname, email, phone, quantity,
    total_price, deposit_paid, remaining_amount,
    payment_model, status, reservation_code,
    initial_checkout_attempt_id, created_at
  ) values (
    v_reservation_id, v_event_id, v_offer_id, v_club_id, p_user_id,
    trim(p_firstname), trim(p_lastname), lower(trim(p_email)), trim(p_phone), p_quantity,
    v_vip_subtotal_cents / 100.0, 0, 0,
    'full_payment', 'pending_payment', v_reservation_code,
    p_checkout_attempt_id, now()
  );

  insert into public.payment_transactions (
    reservation_id, payment_type, club_id, event_id,
    vip_subtotal_cents, service_fee_rate_bps, service_fee_cents,
    commission_rate_bps, commission_cents, club_net_cents,
    total_customer_cents, currency, stripe_account_id, transfer_group, status
  ) values (
    v_reservation_id, 'initial', v_club_id, v_event_id,
    v_vip_subtotal_cents, v_settings.service_fee_bps, v_service_fee_cents,
    v_commission_bps, v_commission_cents, v_club_net_cents,
    v_total_customer_cents, v_settings.currency, v_club_stripe_account_id,
    'reservation:' || v_reservation_id::text, 'pending'
  );

  update public.vip_offers
  set spots_reserved = coalesce(spots_reserved, 0) + p_quantity
  where id = v_offer_id;

  return query select v_reservation_id, v_reservation_code,
    v_vip_subtotal_cents, v_service_fee_cents, v_total_customer_cents,
    v_commission_bps, v_settings.service_fee_bps, v_settings.currency,
    v_club_stripe_account_id, false;

exception
  when unique_violation then
    select * into v_existing from public.reservations
    where user_id = p_user_id and initial_checkout_attempt_id = p_checkout_attempt_id
    for update;
    if found then
      select * into v_existing_txn from public.payment_transactions
      where reservation_id = v_existing.id and payment_type = 'initial';
      return query select v_existing.id, v_existing.reservation_code,
        v_existing_txn.vip_subtotal_cents, v_existing_txn.service_fee_cents, v_existing_txn.total_customer_cents,
        v_existing_txn.commission_rate_bps, v_existing_txn.service_fee_rate_bps, v_existing_txn.currency,
        v_existing_txn.stripe_account_id, true;
      return;
    end if;
    raise;
end;
$$;

revoke all on function public.create_full_payment_reservation(text, uuid, uuid, text, text, text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.create_full_payment_reservation(text, uuid, uuid, text, text, text, text, integer, uuid)
  to service_role;

-- ==========================================================
-- 7. confirm_full_payment_reservation : confirmation webhook
--
-- Parallele a confirm_vip_reservation_payment. Meme contrat idempotent
-- (already_confirmed), meme re-verification serveur montant/devise. Le
-- trigger existant trigger_refresh_vip_offer_status se declenche
-- automatiquement sur l'UPDATE reservations ci-dessous, sans aucun code
-- supplementaire : la mutualisation (Email A "table confirmee" inclus)
-- fonctionne donc deja pour le nouveau modele.
-- ==========================================================

create or replace function public.confirm_full_payment_reservation(
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
  v_txn public.payment_transactions%rowtype;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;

  if v_reservation.id is null then
    return jsonb_build_object('success', false, 'error', 'reservation_not_found');
  end if;

  if v_reservation.payment_model <> 'full_payment' then
    return jsonb_build_object('success', false, 'error', 'wrong_payment_model');
  end if;

  select * into v_txn from public.payment_transactions
  where reservation_id = p_reservation_id and payment_type = 'initial'
  for update;

  if v_txn.id is null then
    return jsonb_build_object('success', false, 'error', 'transaction_not_found');
  end if;

  if v_txn.status = 'confirmed' then
    return jsonb_build_object(
      'success', true, 'already_confirmed', true,
      'reservation_id', p_reservation_id, 'status', v_reservation.status
    );
  end if;

  if p_amount_total is distinct from v_txn.total_customer_cents
     or lower(p_currency) is distinct from v_txn.currency then
    return jsonb_build_object('success', false, 'error', 'amount_mismatch');
  end if;

  update public.payment_transactions
  set status = 'confirmed',
      confirmed_at = clock_timestamp(),
      stripe_checkout_session_id = p_stripe_session_id,
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      stripe_charge_id = p_stripe_charge_id
  where id = v_txn.id;

  update public.reservations
  set status = 'confirmed',
      paid_at = clock_timestamp(),
      deposit_paid = total_price,
      remaining_amount = 0,
      stripe_checkout_session_id = p_stripe_session_id
  where id = p_reservation_id;

  return jsonb_build_object(
    'success', true, 'already_confirmed', false,
    'reservation_id', p_reservation_id, 'status', 'confirmed'
  );
end;
$$;

revoke all on function public.confirm_full_payment_reservation(uuid, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_full_payment_reservation(uuid, text, integer, text, text, text)
  to service_role;

-- ==========================================================
-- 8. expire_full_payment_reservation : miroir de expire_vip_reservation
-- ==========================================================

create or replace function public.expire_full_payment_reservation(
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
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;

  if v_reservation.id is null then
    return jsonb_build_object('success', false, 'error', 'reservation_not_found');
  end if;

  if v_reservation.status <> 'pending_payment' then
    return jsonb_build_object('success', true, 'already_handled', true, 'status', v_reservation.status);
  end if;

  update public.reservations set status = 'expired' where id = p_reservation_id;

  update public.payment_transactions
  set status = 'expired'
  where reservation_id = p_reservation_id and payment_type = 'initial' and status = 'pending';

  update public.vip_offers
  set spots_reserved = greatest(coalesce(spots_reserved, 0) - v_reservation.quantity, 0)
  where id = v_reservation.vip_offer_id;

  return jsonb_build_object('success', true, 'already_handled', false, 'status', 'expired');
end;
$$;

revoke all on function public.expire_full_payment_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.expire_full_payment_reservation(uuid, text)
  to service_role;

-- ==========================================================
-- 9. admin_set_club_commission : seul point d'ecriture de commission
--
-- SECURITY DEFINER necessaire ici : verifie lui-meme is_manager() en
-- interne avant d'ecrire, plutot que de compter uniquement sur le code
-- Node (defense en profondeur explicitement demandee).
-- ==========================================================

create or replace function public.admin_set_club_commission(
  p_club_id uuid,
  p_commission_bps integer
)
returns public.clubs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_club public.clubs%rowtype;
begin
  if not public.is_manager((select auth.uid())) then
    raise exception 'Seul un administrateur K-RE peut modifier la commission d''un club.' using errcode = '42501';
  end if;

  if p_commission_bps is null or p_commission_bps < 0 or p_commission_bps > 10000 then
    raise exception 'Taux de commission invalide.' using errcode = '22023';
  end if;

  update public.clubs
  set commission_bps = p_commission_bps,
      commission_updated_at = clock_timestamp(),
      commission_updated_by = (select auth.uid())
  where id = p_club_id
  returning * into v_club;

  if v_club.id is null then
    raise exception 'Club introuvable.';
  end if;

  return v_club;
end;
$$;

revoke all on function public.admin_set_club_commission(uuid, integer) from public, anon;
grant execute on function public.admin_set_club_commission(uuid, integer) to authenticated, service_role;

commit;
