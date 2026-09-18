--
-- PostgreSQL database dump
--

\restrict YLaQLVmu3esNsn7P3WuFYCCgfbi0epg5LtYMIrYNOu5P0uErq7UkJAXvVaHhTvI

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: admin_accept_vip_offer_as_is(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_accept_vip_offer_as_is(p_vip_offer_id uuid, p_admin_user_id uuid, p_note text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare

  v_offer public.vip_offers%rowtype;

begin

  -- ----------------------------------------------------------
  -- Verrouillage
  -- ----------------------------------------------------------

  select *
  into v_offer

  from public.vip_offers

  where id =
    p_vip_offer_id

  for update;


  if not found then

    raise exception
      'VIP offer not found: %',
      p_vip_offer_id;

  end if;


  -- ----------------------------------------------------------
  -- On ne peut pas accepter une table déjà finalisée
  -- dans un autre workflow.
  -- ----------------------------------------------------------

  if v_offer.status in (
    'cancelled',
    'refunding',
    'refunded',
    'merged'
  ) then

    raise exception
      'VIP offer cannot be accepted from status %',
      v_offer.status;

  end if;


  -- ----------------------------------------------------------
  -- Pas après paiement d'un supplément
  -- ----------------------------------------------------------

  if exists (

    select 1

    from public.reservations

    where vip_offer_id =
      p_vip_offer_id

      and supplement_status =
        'paid'

  ) then

    raise exception
      'A supplement has already been paid for this VIP offer';

  end if;


  -- ----------------------------------------------------------
  -- Décision admin
  -- ----------------------------------------------------------

  update public.vip_offers

  set
    status =
      'confirmed',

    admin_decision =
      'accept_as_is',

    admin_decision_at =
      now(),

    admin_decision_by =
      p_admin_user_id,

    admin_decision_note =
      nullif(
        trim(
          p_note
        ),
        ''
      ),

    -- --------------------------------------
    -- Aucune décision de supplément
    -- --------------------------------------

    decision_started_at =
      null,

    decision_expires_at =
      null,

    decision_snapshot_count =
      null,

    decision_price_per_person =
      null,

    decision_supplement_per_person =
      null,

    decision_original_price_per_person =
      null

  where id =
    p_vip_offer_id;


  -- ----------------------------------------------------------
  -- Nettoyage des anciennes décisions client éventuelles
  -- ----------------------------------------------------------

  update public.reservations

  set
    decision_choice =
      null,

    decision_at =
      null,

    supplement_amount =
      null,

    supplement_status =
      null,

    refund_requested_at =
      null

  where vip_offer_id =
    p_vip_offer_id

    and status =
      'confirmed'

    and supplement_status
      is distinct from
      'paid';


  return
    'confirmed';

end;
$$;


--
-- Name: admin_propose_vip_offer_merge(uuid, uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_propose_vip_offer_merge(p_source_offer_id uuid, p_target_offer_id uuid, p_admin_user_id uuid, p_expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_source public.vip_offers%rowtype;
  v_target public.vip_offers%rowtype;

  v_source_people integer := 0;
  v_target_people integer := 0;
begin
  if p_source_offer_id = p_target_offer_id then
    raise exception 'La table source et la table cible doivent être différentes.';
  end if;

  select *
  into v_source
  from public.vip_offers
  where id = p_source_offer_id
  for update;

  if not found then
    raise exception 'Table source introuvable.';
  end if;

  select *
  into v_target
  from public.vip_offers
  where id = p_target_offer_id
  for update;

  if not found then
    raise exception 'Table cible introuvable.';
  end if;

  if v_source.event_id <> v_target.event_id then
    raise exception 'Les deux tables doivent appartenir à la même soirée.';
  end if;

  if v_source.status <> 'admin_review' then
    raise exception 'La table source doit être en attente de décision administrateur.';
  end if;

  if v_target.status in (
    'cancelled',
    'refunding',
    'refunded',
    'merged',
    'refund_pending'
  ) then
    raise exception 'La table cible ne peut pas recevoir de fusion.';
  end if;

  if v_source.merge_status = 'pending' then
    raise exception 'Une fusion est déjà en attente pour cette table.';
  end if;

  if v_source.price_per_person <> v_target.price_per_person
     or v_source.deposit_per_person <> v_target.deposit_per_person
     or v_source.remaining_per_person <> v_target.remaining_per_person then
    raise exception 'Les deux tables doivent avoir les mêmes conditions tarifaires.';
  end if;

  select coalesce(sum(quantity), 0)::integer
  into v_source_people
  from public.reservations
  where vip_offer_id = v_source.id
    and status in ('confirmed', 'checked_in');

  select coalesce(sum(quantity), 0)::integer
  into v_target_people
  from public.reservations
  where vip_offer_id = v_target.id
    and status in ('confirmed', 'checked_in');

  if (v_source_people + v_target_people) > v_target.capacity then
    raise exception 'La table cible n''a pas assez de capacité.';
  end if;

  update public.vip_offers
  set
    status = 'merge_pending',
    admin_decision = 'merge',
    admin_decision_at = now(),
    admin_decision_by = p_admin_user_id,
    merge_status = 'pending',
    merge_target_offer_id = v_target.id,
    merge_proposed_at = now(),
    merge_expires_at = p_expires_at
  where id = v_source.id;

  update public.reservations
  set
    merge_choice = null,
    merge_choice_at = null
  where vip_offer_id = v_source.id
    and status in ('confirmed', 'checked_in');

  return jsonb_build_object(
    'success', true,
    'source_offer_id', v_source.id,
    'target_offer_id', v_target.id,
    'source_people', v_source_people,
    'target_people', v_target_people,
    'target_capacity', v_target.capacity,
    'expires_at', p_expires_at
  );
end;
$$;


--
-- Name: admin_start_vip_offer_supplement(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_start_vip_offer_supplement(p_offer_id uuid, p_admin_user_id uuid, p_expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval)) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_offer public.vip_offers%rowtype;
  v_snapshot_count integer := 0;
  v_new_price numeric(10,2);
  v_supplement numeric(10,2);
begin
  select * into v_offer
  from public.vip_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Table introuvable.';
  end if;

  if v_offer.status <> 'admin_review' then
    raise exception 'La table doit être en attente de décision administrateur.';
  end if;

  select coalesce(sum(quantity), 0)::integer
  into v_snapshot_count
  from public.reservations
  where vip_offer_id = v_offer.id
    and status in ('confirmed', 'checked_in');

  if v_snapshot_count <= 0 then
    raise exception 'Aucun participant confirmé sur cette table.';
  end if;

  v_new_price := round(
    (v_offer.total_table_price / v_snapshot_count)::numeric,
    2
  );

  v_supplement := round(
    (v_new_price - v_offer.price_per_person)::numeric,
    2
  );

  if v_supplement <= 0 then
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
    decision_snapshot_count = v_snapshot_count,
    decision_price_per_person = v_new_price,
    supplement_per_person = v_supplement
  where id = v_offer.id;

  update public.reservations
  set
    decision_choice = null,
    decision_choice_at = null,
    supplement_amount = round((v_supplement * quantity)::numeric, 2),
    supplement_status = 'pending_decision',
    supplement_paid_at = null,
    supplement_stripe_session_id = null
  where vip_offer_id = v_offer.id
    and status in ('confirmed', 'checked_in');

  return jsonb_build_object(
    'success', true,
    'offer_id', v_offer.id,
    'snapshot_count', v_snapshot_count,
    'original_price_per_person', v_offer.price_per_person,
    'new_price_per_person', v_new_price,
    'supplement_per_person', v_supplement,
    'expires_at', p_expires_at
  );
end;
$$;


--
-- Name: admin_update_vip_offer_deadline(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_vip_offer_deadline(p_vip_offer_id uuid, p_booking_deadline timestamp with time zone) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare

  v_offer public.vip_offers%rowtype;

begin

  select *
  into v_offer

  from public.vip_offers

  where id =
    p_vip_offer_id

  for update;


  if not found then

    raise exception
      'VIP offer not found: %',
      p_vip_offer_id;

  end if;


  -- ----------------------------------------------------------
  -- Une table déjà acceptée telle quelle n'est pas
  -- automatiquement réouverte.
  -- ----------------------------------------------------------

  if
    v_offer.admin_decision =
      'accept_as_is'
  then

    update public.vip_offers

    set booking_deadline =
      p_booking_deadline

    where id =
      p_vip_offer_id;


    return
      v_offer.status;

  end if;


  -- ----------------------------------------------------------
  -- On interdit la modification si un supplément
  -- a réellement été payé.
  -- ----------------------------------------------------------

  if exists (

    select 1

    from public.reservations

    where vip_offer_id =
      p_vip_offer_id

      and supplement_status =
        'paid'

  ) then

    raise exception
      'Deadline cannot be modified after a supplement payment';

  end if;


  -- ----------------------------------------------------------
  -- Nouvelle deadline
  -- ----------------------------------------------------------

  update public.vip_offers

  set
    booking_deadline =
      p_booking_deadline,

    admin_decision =
      null,

    admin_decision_at =
      null,

    admin_decision_by =
      null,

    admin_decision_note =
      null,

    decision_started_at =
      null,

    decision_expires_at =
      null,

    decision_snapshot_count =
      null,

    decision_price_per_person =
      null,

    decision_supplement_per_person =
      null,

    decision_original_price_per_person =
      null

  where id =
    p_vip_offer_id;


  -- ----------------------------------------------------------
  -- Nettoyage décisions client
  -- ----------------------------------------------------------

  update public.reservations

  set
    decision_choice =
      null,

    decision_at =
      null,

    supplement_amount =
      null,

    supplement_status =
      null,

    refund_requested_at =
      null

  where vip_offer_id =
    p_vip_offer_id

    and status =
      'confirmed'

    and supplement_status
      is distinct from
      'paid';


  -- ----------------------------------------------------------
  -- Recalcul
  -- ----------------------------------------------------------

  return public.refresh_vip_offer_status(
    p_vip_offer_id
  );

end;
$$;


--
-- Name: can_manage_club(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_club(p_club_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

  select

    public.is_manager(
      p_user_id
    )

    or

    public.is_club_admin(
      p_club_id,
      p_user_id
    );

$$;


--
-- Name: can_scan_club(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_scan_club(p_club_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

  select

    public.is_manager(
      p_user_id
    )

    or

    exists (

      select 1

      from public.club_memberships

      where user_id =
        p_user_id

        and club_id =
          p_club_id

        and role in (
          'admin',
          'scanner'
        )

        and status =
          'active'

    );

$$;


--
-- Name: check_in_reservation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_reservation(p_reservation_code text) RETURNS TABLE(success boolean, message text, reservation_id uuid, firstname text, lastname text, quantity integer, checked_in_quantity integer, remaining_entries integer, event_name text, club_name text, checked_in boolean, checked_in_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_reservation record;
  v_new_checked_in_quantity integer;
  v_remaining integer;
  v_fully_checked_in boolean;
  v_checked_in_at timestamptz;
begin

  select
    r.id,
    r.firstname,
    r.lastname,
    r.quantity,
    r.status,
    coalesce(r.checked_in_quantity, 0) as checked_in_quantity,
    coalesce(r.checked_in, false) as checked_in,
    r.checked_in_at,
    e.name as event_name,
    c.name as club_name
  into v_reservation
  from public.reservations r
  join public.events e
    on e.id = r.event_id
  join public.clubs c
    on c.id = e.club_id
  where r.reservation_code = p_reservation_code
  limit 1
  for update;

  if not found then
    return query
    select
      false,
      'Réservation introuvable.',
      null::uuid,
      null::text,
      null::text,
      null::integer,
      null::integer,
      null::integer,
      null::text,
      null::text,
      false,
      null::timestamptz;

    return;
  end if;

  if v_reservation.status <> 'confirmed' then
    return query
    select
      false,
      'Cette réservation n''est pas confirmée.',
      v_reservation.id,
      v_reservation.firstname,
      v_reservation.lastname,
      v_reservation.quantity,
      v_reservation.checked_in_quantity,
      greatest(
        0,
        v_reservation.quantity -
        v_reservation.checked_in_quantity
      ),
      v_reservation.event_name,
      v_reservation.club_name,
      v_reservation.checked_in,
      v_reservation.checked_in_at;

    return;
  end if;

  if
    v_reservation.checked_in_quantity
    >= v_reservation.quantity
  then
    return query
    select
      false,
      'Toutes les places de ce pass ont déjà été utilisées.',
      v_reservation.id,
      v_reservation.firstname,
      v_reservation.lastname,
      v_reservation.quantity,
      v_reservation.checked_in_quantity,
      0,
      v_reservation.event_name,
      v_reservation.club_name,
      true,
      v_reservation.checked_in_at;

    return;
  end if;

  v_new_checked_in_quantity :=
    v_reservation.checked_in_quantity + 1;

  v_remaining :=
    greatest(
      0,
      v_reservation.quantity -
      v_new_checked_in_quantity
    );

  v_fully_checked_in :=
    v_new_checked_in_quantity
    >= v_reservation.quantity;

  if v_fully_checked_in then
    v_checked_in_at := now();
  else
    v_checked_in_at :=
      v_reservation.checked_in_at;
  end if;

  update public.reservations
  set
    checked_in_quantity =
      v_new_checked_in_quantity,

    checked_in =
      v_fully_checked_in,

    checked_in_at =
      v_checked_in_at

  where id = v_reservation.id;

  return query
  select
    true,

    case
      when v_fully_checked_in
        then 'Entrée validée. Toutes les places ont maintenant été utilisées.'
      else
        'Entrée validée.'
    end,

    v_reservation.id,
    v_reservation.firstname,
    v_reservation.lastname,
    v_reservation.quantity,
    v_new_checked_in_quantity,
    v_remaining,
    v_reservation.event_name,
    v_reservation.club_name,
    v_fully_checked_in,
    v_checked_in_at;

end;
$$;


--
-- Name: confirm_vip_reservation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_vip_reservation(p_reservation_id uuid) RETURNS TABLE(success boolean, message text, reservation_id uuid, reservation_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_reservation record;
begin

  /*
  |--------------------------------------------------------------------------
  | Verrouiller la réservation
  |--------------------------------------------------------------------------
  */

  select
    r.id,
    r.status,
    r.paid_at
  into v_reservation
  from public.reservations r
  where r.id = p_reservation_id
  for update;

  /*
  |--------------------------------------------------------------------------
  | Introuvable
  |--------------------------------------------------------------------------
  */

  if not found then
    return query
    select
      false,
      'Réservation introuvable.',
      null::uuid,
      null::text;

    return;
  end if;

  /*
  |--------------------------------------------------------------------------
  | Déjà confirmée
  |--------------------------------------------------------------------------
  |
  | Stripe peut envoyer plusieurs fois le même webhook.
  | On ne doit donc pas retraiter le paiement.
  |--------------------------------------------------------------------------
  */

  if v_reservation.status = 'confirmed' then
    return query
    select
      true,
      'Réservation déjà confirmée.',
      v_reservation.id,
      v_reservation.status;

    return;
  end if;

  /*
  |--------------------------------------------------------------------------
  | La réservation n'est plus payable
  |--------------------------------------------------------------------------
  */

  if v_reservation.status <> 'pending_payment' then
    return query
    select
      false,
      'Cette réservation ne peut plus être confirmée.',
      v_reservation.id,
      v_reservation.status;

    return;
  end if;

  /*
  |--------------------------------------------------------------------------
  | Confirmation
  |--------------------------------------------------------------------------
  */

  update public.reservations
  set
    status = 'confirmed',
    paid_at = coalesce(paid_at, now())
  where id = v_reservation.id;

  return query
  select
    true,
    'Paiement confirmé.',
    v_reservation.id,
    'confirmed'::text;

end;
$$;


--
-- Name: confirm_vip_supplement_payment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_vip_supplement_payment(p_reservation_id uuid, p_stripe_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
  v_total integer := 0;
  v_paid integer := 0;
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

  -- Idempotence webhook Stripe.
  if v_reservation.supplement_status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'already_paid', true,
      'reservation_id', v_reservation.id,
      'offer_id', v_offer.id
    );
  end if;

  if v_offer.status <> 'supplement_payment_pending'
     or v_offer.admin_decision <> 'supplement' then
    raise exception 'Aucun paiement de supplément actif pour cette table.';
  end if;

  if v_reservation.decision_choice <> 'maintain' then
    raise exception 'Cette réservation n''a pas accepté le maintien.';
  end if;

  if v_reservation.supplement_status <> 'payment_pending' then
    raise exception 'Cette réservation n''attend pas de paiement de supplément.';
  end if;

  if v_reservation.supplement_amount is null
     or v_reservation.supplement_amount <= 0 then
    raise exception 'Montant du supplément invalide.';
  end if;

  if v_reservation.supplement_stripe_session_id is null
     or v_reservation.supplement_stripe_session_id <> p_stripe_session_id then
    raise exception 'Session Stripe de supplément invalide.';
  end if;

  update public.reservations
  set
    supplement_status = 'paid',
    supplement_paid_at = now()
  where id = v_reservation.id;

  select
    count(*)::integer,
    count(*) filter (where supplement_status = 'paid')::integer
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
$$;


--
-- Name: create_vip_reservation(text, uuid, uuid, text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_vip_reservation(p_event_slug text, p_vip_offer_id uuid, p_user_id uuid, p_firstname text, p_lastname text, p_email text, p_phone text, p_quantity integer) RETURNS TABLE(reservation_id uuid, reservation_code text, total_price numeric, deposit_paid numeric, remaining_amount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare
  v_event_id uuid;

  v_offer_id uuid;

  v_capacity integer;
  v_spots_reserved integer;

  v_price_per_person numeric(10,2);
  v_deposit_per_person numeric(10,2);
  v_remaining_per_person numeric(10,2);

  v_booking_deadline timestamptz;

  v_total_price numeric(10,2);
  v_total_deposit numeric(10,2);
  v_total_remaining numeric(10,2);

  v_reservation_id uuid;
  v_reservation_code text;

begin

  -- ==========================================================
  -- Vérification des paramètres
  -- ==========================================================

  if p_user_id is null then
    raise exception
      'Utilisateur invalide.';
  end if;

  if p_event_slug is null
     or trim(p_event_slug) = '' then
    raise exception
      'Événement invalide.';
  end if;

  if p_vip_offer_id is null then
    raise exception
      'Table invalide.';
  end if;

  if p_firstname is null
     or trim(p_firstname) = '' then
    raise exception
      'Prénom obligatoire.';
  end if;

  if p_lastname is null
     or trim(p_lastname) = '' then
    raise exception
      'Nom obligatoire.';
  end if;

  if p_email is null
     or trim(p_email) = '' then
    raise exception
      'Email obligatoire.';
  end if;

  if p_phone is null
     or trim(p_phone) = '' then
    raise exception
      'Téléphone obligatoire.';
  end if;

  if p_quantity is null
     or p_quantity < 1 then
    raise exception
      'Quantité invalide.';
  end if;

  -- ==========================================================
  -- Récupérer l'événement
  -- ==========================================================

  select e.id
  into v_event_id
  from public.events e
  where e.slug = p_event_slug
    and e.status = 'published'
  limit 1;

  if v_event_id is null then
    raise exception
      'Événement introuvable.';
  end if;

  -- ==========================================================
  -- Récupérer EXACTEMENT la table choisie
  --
  -- FOR UPDATE empêche le surbooking lors de deux
  -- réservations simultanées.
  -- ==========================================================

  select
    vo.id,
    vo.capacity,
    coalesce(
      vo.spots_reserved,
      0
    ),
    vo.price_per_person,
    vo.deposit_per_person,
    vo.remaining_per_person,
    vo.booking_deadline
  into
    v_offer_id,
    v_capacity,
    v_spots_reserved,
    v_price_per_person,
    v_deposit_per_person,
    v_remaining_per_person,
    v_booking_deadline
  from public.vip_offers vo
  where vo.id =
        p_vip_offer_id
    and vo.event_id =
        v_event_id
  limit 1
  for update;

  if v_offer_id is null then
    raise exception
      'Cette table est introuvable pour cette soirée.';
  end if;

  -- ==========================================================
  -- Deadline
  -- ==========================================================

  if v_booking_deadline is not null
     and now() >= v_booking_deadline then
    raise exception
      'Les réservations sont terminées pour cette table.';
  end if;

  -- ==========================================================
  -- Disponibilité
  -- ==========================================================

  if
    v_spots_reserved +
    p_quantity >
    v_capacity
  then
    raise exception
      'Il ne reste pas assez de places disponibles sur cette table.';
  end if;

  -- ==========================================================
  -- Prix côté serveur
  --
  -- Le navigateur ne décide jamais des montants.
  -- ==========================================================

  v_total_price :=
    v_price_per_person *
    p_quantity;

  v_total_deposit :=
    v_deposit_per_person *
    p_quantity;

  v_total_remaining :=
    v_remaining_per_person *
    p_quantity;

  -- ==========================================================
  -- Génération réservation
  -- ==========================================================

  v_reservation_id :=
    gen_random_uuid();

  v_reservation_code :=
    'VIP-' ||
    upper(
      replace(
        gen_random_uuid()::text,
        '-',
        ''
      )
    );

  -- ==========================================================
  -- Création
  -- ==========================================================

  insert into public.reservations (
    id,
    event_id,
    vip_offer_id,

    user_id,

    firstname,
    lastname,
    email,
    phone,

    quantity,

    total_price,
    deposit_paid,
    remaining_amount,

    status,

    reservation_code,

    created_at
  )
  values (
    v_reservation_id,
    v_event_id,
    v_offer_id,

    p_user_id,

    trim(p_firstname),
    trim(p_lastname),
    lower(trim(p_email)),
    trim(p_phone),

    p_quantity,

    v_total_price,
    v_total_deposit,
    v_total_remaining,

    'pending_payment',

    v_reservation_code,

    now()
  );

  -- ==========================================================
  -- Bloquer temporairement les places
  -- ==========================================================

  update public.vip_offers
  set
    spots_reserved =
      coalesce(
        spots_reserved,
        0
      ) +
      p_quantity
  where id =
    v_offer_id;

  -- ==========================================================
  -- Retour backend
  -- ==========================================================

  return query
  select
    v_reservation_id,
    v_reservation_code,
    v_total_price,
    v_total_deposit,
    v_total_remaining;

end;

$$;


--
-- Name: customer_decide_vip_offer_merge(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_decide_vip_offer_merge(p_reservation_id uuid, p_user_id uuid, p_choice text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
begin
  if p_choice not in ('accept', 'refuse') then
    raise exception 'Choix invalide.';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Réservation introuvable.';
  end if;

  if v_reservation.user_id is distinct from p_user_id then
    raise exception 'Cette réservation ne vous appartient pas.';
  end if;

  select *
  into v_offer
  from public.vip_offers
  where id = v_reservation.vip_offer_id
  for update;

  if not found then
    raise exception 'Table introuvable.';
  end if;

  if v_offer.status <> 'merge_pending'
     or v_offer.merge_status <> 'pending'
     or v_offer.merge_target_offer_id is null then
    raise exception 'Aucune proposition de fusion active.';
  end if;

  if v_offer.merge_expires_at is not null
     and v_offer.merge_expires_at <= now() then
    raise exception 'La proposition de fusion a expiré.';
  end if;

  update public.reservations
  set
    merge_choice = p_choice,
    merge_choice_at = now()
  where id = p_reservation_id;

  return jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'choice', p_choice
  );
end;
$$;


--
-- Name: customer_decide_vip_offer_supplement(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_decide_vip_offer_supplement(p_reservation_id uuid, p_user_id uuid, p_choice text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_reservation public.reservations%rowtype;
  v_offer public.vip_offers%rowtype;
  v_total integer := 0;
  v_answered integer := 0;
  v_refunds integer := 0;
begin
  if p_choice not in ('maintain', 'refund') then
    raise exception 'Choix invalide.';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Réservation introuvable.';
  end if;

  if v_reservation.user_id is distinct from p_user_id then
    raise exception 'Cette réservation ne vous appartient pas.';
  end if;

  select * into v_offer
  from public.vip_offers
  where id = v_reservation.vip_offer_id
  for update;

  if v_offer.status <> 'decision_pending'
     or v_offer.admin_decision <> 'supplement' then
    raise exception 'Aucune décision de supplément active.';
  end if;

  if v_offer.decision_expires_at is not null
     and v_offer.decision_expires_at <= now() then
    raise exception 'La période de décision a expiré.';
  end if;

  if v_reservation.decision_choice is not null then
    raise exception 'Votre choix a déjà été enregistré.';
  end if;

  update public.reservations
  set
    decision_choice = p_choice,
    decision_choice_at = now()
  where id = v_reservation.id;

  select
    count(*)::integer,
    count(*) filter (where decision_choice is not null)::integer,
    count(*) filter (where decision_choice = 'refund')::integer
  into v_total, v_answered, v_refunds
  from public.reservations
  where vip_offer_id = v_offer.id
    and status in ('confirmed', 'checked_in');

  if v_answered < v_total then
    return jsonb_build_object(
      'success', true,
      'state', 'pending',
      'answered', v_answered,
      'total', v_total
    );
  end if;

  if v_refunds > 0 then
    update public.vip_offers
    set status = 'refund_pending'
    where id = v_offer.id;

    update public.reservations
    set supplement_status =
      case
        when decision_choice = 'refund' then 'refund_pending'
        else 'cancelled'
      end
    where vip_offer_id = v_offer.id
      and status in ('confirmed', 'checked_in');

    return jsonb_build_object(
      'success', true,
      'state', 'refund_pending',
      'refund_reservations', v_refunds
    );
  end if;

  update public.vip_offers
  set status = 'supplement_payment_pending'
  where id = v_offer.id;

  update public.reservations
  set supplement_status = 'payment_pending'
  where vip_offer_id = v_offer.id
    and status in ('confirmed', 'checked_in');

  return jsonb_build_object(
    'success', true,
    'state', 'supplement_payment_pending',
    'total', v_total
  );
end;
$$;


--
-- Name: expire_vip_offer_supplement_decision(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_vip_offer_supplement_decision(p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_offer public.vip_offers%rowtype;
begin
  select * into v_offer
  from public.vip_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Table introuvable.';
  end if;

  if v_offer.status <> 'decision_pending'
     or v_offer.admin_decision <> 'supplement' then
    return jsonb_build_object(
      'success', false,
      'state', 'not_pending'
    );
  end if;

  if v_offer.decision_expires_at is null
     or v_offer.decision_expires_at > now() then
    return jsonb_build_object(
      'success', true,
      'state', 'not_expired'
    );
  end if;

  update public.vip_offers
  set status = 'refund_pending'
  where id = v_offer.id;

  update public.reservations
  set supplement_status =
    case
      when decision_choice = 'maintain' then 'cancelled'
      else 'refund_pending'
    end
  where vip_offer_id = v_offer.id
    and status in ('confirmed', 'checked_in');

  return jsonb_build_object(
    'success', true,
    'state', 'refund_pending'
  );
end;
$$;


--
-- Name: expire_vip_reservation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_vip_reservation(p_reservation_id uuid) RETURNS TABLE(success boolean, message text, reservation_id uuid, released_quantity integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_reservation record;
  v_current_spots integer;
begin

  /*
  |--------------------------------------------------------------------------
  | Verrouiller la réservation
  |--------------------------------------------------------------------------
  */

  select
    r.id,
    r.vip_offer_id,
    r.quantity,
    r.status
  into v_reservation
  from public.reservations r
  where r.id = p_reservation_id
  for update;

  /*
  |--------------------------------------------------------------------------
  | Introuvable
  |--------------------------------------------------------------------------
  */

  if not found then
    return query
    select
      false,
      'Réservation introuvable.',
      null::uuid,
      0;

    return;
  end if;

  /*
  |--------------------------------------------------------------------------
  | Déjà traitée
  |--------------------------------------------------------------------------
  */

  if v_reservation.status <> 'pending_payment' then
    return query
    select
      true,
      'Réservation déjà traitée.',
      v_reservation.id,
      0;

    return;
  end if;

  /*
  |--------------------------------------------------------------------------
  | Verrouiller l'offre
  |--------------------------------------------------------------------------
  */

  select
    coalesce(vo.spots_reserved, 0)
  into v_current_spots
  from public.vip_offers vo
  where vo.id = v_reservation.vip_offer_id
  for update;

  if not found then
    return query
    select
      false,
      'Offre VIP introuvable.',
      v_reservation.id,
      0;

    return;
  end if;

  /*
  |--------------------------------------------------------------------------
  | Libérer les places
  |--------------------------------------------------------------------------
  */

  update public.vip_offers
  set
    spots_reserved = greatest(
      0,
      v_current_spots - v_reservation.quantity
    )
  where id = v_reservation.vip_offer_id;

  /*
  |--------------------------------------------------------------------------
  | Expirer la réservation
  |--------------------------------------------------------------------------
  */

  update public.reservations
  set
    status = 'payment_expired'
  where id = v_reservation.id;

  return query
  select
    true,
    'Réservation expirée et places libérées.',
    v_reservation.id,
    v_reservation.quantity;

end;
$$;


--
-- Name: expire_vip_supplement_checkout(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_vip_supplement_checkout(p_reservation_id uuid, p_stripe_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_reservation public.reservations%rowtype;
begin
  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'Réservation introuvable.';
  end if;

  -- Si déjà payé, un ancien événement "expired" ne doit rien changer.
  if v_reservation.supplement_status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'state', 'already_paid'
    );
  end if;

  if v_reservation.supplement_stripe_session_id = p_stripe_session_id then
    update public.reservations
    set supplement_stripe_session_id = null
    where id = v_reservation.id
      and supplement_status = 'payment_pending';
  end if;

  return jsonb_build_object(
    'success', true,
    'state', 'payment_pending'
  );
end;
$$;


--
-- Name: finalize_vip_offer_merge(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_vip_offer_merge(p_source_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_source public.vip_offers%rowtype;
  v_target public.vip_offers%rowtype;

  v_total_reservations integer := 0;
  v_answered_reservations integer := 0;
  v_refused_reservations integer := 0;

  v_source_people integer := 0;
  v_target_people integer := 0;
begin
  select *
  into v_source
  from public.vip_offers
  where id = p_source_offer_id
  for update;

  if not found then
    raise exception 'Table source introuvable.';
  end if;

  if v_source.status <> 'merge_pending'
     or v_source.merge_status <> 'pending'
     or v_source.merge_target_offer_id is null then
    return jsonb_build_object(
      'success', false,
      'state', 'not_pending'
    );
  end if;

  select *
  into v_target
  from public.vip_offers
  where id = v_source.merge_target_offer_id
  for update;

  if not found then
    raise exception 'Table cible introuvable.';
  end if;

  select
    count(*)::integer,
    count(*) filter (where merge_choice is not null)::integer,
    count(*) filter (where merge_choice = 'refuse')::integer,
    coalesce(sum(quantity), 0)::integer
  into
    v_total_reservations,
    v_answered_reservations,
    v_refused_reservations,
    v_source_people
  from public.reservations
  where vip_offer_id = v_source.id
    and status in ('confirmed', 'checked_in');

  if v_refused_reservations > 0 then
    update public.vip_offers
    set
      status = 'admin_review',
      merge_status = 'refused',
      merge_target_offer_id = null,
      merge_expires_at = null
    where id = v_source.id;

    return jsonb_build_object(
      'success', true,
      'state', 'refused'
    );
  end if;

  if v_total_reservations = 0 then
    update public.vip_offers
    set
      status = 'admin_review',
      merge_status = 'cancelled',
      merge_target_offer_id = null,
      merge_expires_at = null
    where id = v_source.id;

    return jsonb_build_object(
      'success', true,
      'state', 'cancelled_no_participants'
    );
  end if;

  if v_answered_reservations < v_total_reservations then
    if v_source.merge_expires_at is not null
       and v_source.merge_expires_at <= now() then

      update public.vip_offers
      set
        status = 'admin_review',
        merge_status = 'expired',
        merge_target_offer_id = null,
        merge_expires_at = null
      where id = v_source.id;

      return jsonb_build_object(
        'success', true,
        'state', 'expired'
      );
    end if;

    return jsonb_build_object(
      'success', true,
      'state', 'pending',
      'answered', v_answered_reservations,
      'total', v_total_reservations
    );
  end if;

  select coalesce(sum(quantity), 0)::integer
  into v_target_people
  from public.reservations
  where vip_offer_id = v_target.id
    and status in ('confirmed', 'checked_in');

  if (v_target_people + v_source_people) > v_target.capacity then
    update public.vip_offers
    set
      status = 'admin_review',
      merge_status = 'cancelled',
      merge_target_offer_id = null,
      merge_expires_at = null
    where id = v_source.id;

    return jsonb_build_object(
      'success', true,
      'state', 'cancelled_capacity_changed'
    );
  end if;

  -- Déplacer les réservations actives.
  update public.reservations
  set vip_offer_id = v_target.id
  where vip_offer_id = v_source.id
    and status in ('confirmed', 'checked_in');

  -- Recalcul simple des compteurs.
  update public.vip_offers
  set spots_reserved = (
    select coalesce(sum(quantity), 0)::integer
    from public.reservations
    where vip_offer_id = v_target.id
      and status in ('confirmed', 'checked_in', 'pending_payment')
  )
  where id = v_target.id;

  update public.vip_offers
  set
    spots_reserved = 0,
    status = 'merged',
    merge_status = 'completed'
  where id = v_source.id;

  return jsonb_build_object(
    'success', true,
    'state', 'completed',
    'source_offer_id', v_source.id,
    'target_offer_id', v_target.id
  );
end;
$$;


--
-- Name: get_reservation_by_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reservation_by_code(p_reservation_code text) RETURNS TABLE(reservation_id uuid, reservation_code text, firstname text, quantity integer, total_price numeric, deposit_paid numeric, remaining_amount numeric, reservation_status text, event_slug text, event_name text, event_date date, start_time time without time zone, club_name text, club_city text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    r.id,
    r.reservation_code,
    r.firstname,
    r.quantity,
    r.total_price,
    r.deposit_paid,
    r.remaining_amount,
    r.status,
    e.slug,
    e.name,
    e.event_date,
    e.start_time,
    c.name,
    c.city
  from public.reservations r
  join public.events e
    on e.id = r.event_id
  join public.clubs c
    on c.id = e.club_id
  where r.reservation_code = p_reservation_code
  limit 1;
$$;


--
-- Name: is_club_admin(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_club_admin(p_club_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

  select exists (

    select 1

    from public.club_memberships

    where user_id = p_user_id

      and club_id = p_club_id

      and role = 'admin'

      and status = 'active'

  );

$$;


--
-- Name: is_manager(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_manager(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$

  select exists (

    select 1

    from public.profiles

    where id = p_user_id

      and role = 'manager'

  );

$$;


--
-- Name: refresh_all_vip_offer_statuses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_all_vip_offer_statuses() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare

  v_offer record;

  v_count integer :=
    0;

begin

  for v_offer in

    select id

    from public.vip_offers

    where status not in (
      'cancelled',
      'refunding',
      'refunded',
      'merged'
    )

  loop

    perform public.refresh_vip_offer_status(
      v_offer.id
    );


    v_count :=
      v_count + 1;

  end loop;


  return
    v_count;

end;
$$;


--
-- Name: refresh_vip_offer_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_vip_offer_status(p_vip_offer_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare

  v_offer public.vip_offers%rowtype;

  v_confirmed_people integer := 0;

  v_new_status text;

begin

  -- ----------------------------------------------------------
  -- Verrouillage
  -- ----------------------------------------------------------

  select *
  into v_offer

  from public.vip_offers

  where id =
    p_vip_offer_id

  for update;


  if not found then

    raise exception
      'VIP offer not found: %',
      p_vip_offer_id;

  end if;


  -- ----------------------------------------------------------
  -- Statuts opérationnels protégés
  --
  -- Le refresh automatique ne doit surtout pas
  -- écraser un workflow déjà commencé.
  -- ----------------------------------------------------------

  if v_offer.status in (
    'cancelled',
    'refunding',
    'refunded',

    'merge_pending',
    'merged',

    'decision_pending',
    'supplement_payment_pending',

    'refund_pending'
  ) then

    return
      v_offer.status;

  end if;


  -- ----------------------------------------------------------
  -- Si l'admin a explicitement accepté la table telle quelle,
  -- la confirmation devient "sticky".
  --
  -- Même si le seuil n'est toujours pas atteint.
  -- ----------------------------------------------------------

  if
    v_offer.admin_decision =
      'accept_as_is'
  then

    if
      v_offer.status <>
        'confirmed'
    then

      update public.vip_offers
      set status =
        'confirmed'

      where id =
        p_vip_offer_id;

    end if;


    return
      'confirmed';

  end if;


  -- ----------------------------------------------------------
  -- Nombre réellement confirmé
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(quantity),
      0
    )::integer

  into v_confirmed_people

  from public.reservations

  where vip_offer_id =
    p_vip_offer_id

    and status =
      'confirmed';


  -- ----------------------------------------------------------
  -- Table pleine
  -- ----------------------------------------------------------

  if
    v_confirmed_people >=
    v_offer.capacity
  then

    v_new_status :=
      'full';


    update public.vip_offers

    set status =
      v_new_status

    where id =
      p_vip_offer_id;


    return
      v_new_status;

  end if;


  -- ----------------------------------------------------------
  -- Seuil atteint naturellement
  -- ----------------------------------------------------------

  if
    v_confirmed_people >=
    v_offer.confirmation_threshold
  then

    v_new_status :=
      'confirmed';


    update public.vip_offers

    set status =
      v_new_status

    where id =
      p_vip_offer_id;


    return
      v_new_status;

  end if;


  -- ----------------------------------------------------------
  -- Deadline non atteinte
  -- ----------------------------------------------------------

  if
    v_offer.booking_deadline is null
    or
    now() <
      v_offer.booking_deadline
  then

    v_new_status :=
      'forming';


    update public.vip_offers

    set status =
      v_new_status

    where id =
      p_vip_offer_id;


    return
      v_new_status;

  end if;


  -- ----------------------------------------------------------
  -- Deadline dépassée
  -- + seuil non atteint
  --
  -- IMPORTANT :
  --
  -- On ne propose PLUS automatiquement supplément /
  -- remboursement.
  --
  -- On attend la décision du club.
  -- ----------------------------------------------------------

  v_new_status :=
    'admin_review';


  update public.vip_offers

  set status =
    v_new_status

  where id =
    p_vip_offer_id;


  return
    v_new_status;

end;
$$;


--
-- Name: resolve_vip_offer_decision(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_vip_offer_decision(p_vip_offer_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare

  v_offer public.vip_offers%rowtype;

  v_snapshot_count integer := 0;

  v_total_people integer := 0;

  v_answered_people integer := 0;

  v_maintain_people integer := 0;

  v_refund_people integer := 0;

  v_new_status text;

begin

  -- ==========================================================
  -- Verrouillage table
  -- ==========================================================

  select *
  into v_offer
  from public.vip_offers
  where id = p_vip_offer_id
  for update;


  if not found then
    raise exception
      'VIP offer not found: %',
      p_vip_offer_id;
  end if;


  -- ==========================================================
  -- Cette fonction ne travaille que sur decision_pending
  -- ==========================================================

  if v_offer.status <> 'decision_pending' then
    return v_offer.status;
  end if;


  -- ==========================================================
  -- Snapshot
  -- ==========================================================

  v_snapshot_count :=
    coalesce(
      v_offer.decision_snapshot_count,
      0
    );


  if v_snapshot_count <= 0 then
    raise exception
      'Invalid decision snapshot for VIP offer %',
      p_vip_offer_id;
  end if;


  -- ==========================================================
  -- Nombre actuel de personnes encore concernées
  -- ==========================================================

  select
    coalesce(
      sum(quantity),
      0
    )::integer

  into v_total_people

  from public.reservations

  where vip_offer_id = p_vip_offer_id
    and status = 'confirmed';


  -- ==========================================================
  -- Nombre de personnes ayant répondu
  -- ==========================================================

  select
    coalesce(
      sum(quantity),
      0
    )::integer

  into v_answered_people

  from public.reservations

  where vip_offer_id = p_vip_offer_id
    and status = 'confirmed'
    and decision_choice is not null;


  -- ==========================================================
  -- Nombre qui veulent maintenir
  -- ==========================================================

  select
    coalesce(
      sum(quantity),
      0
    )::integer

  into v_maintain_people

  from public.reservations

  where vip_offer_id = p_vip_offer_id
    and status = 'confirmed'
    and decision_choice = 'maintain';


  -- ==========================================================
  -- Nombre qui demandent remboursement
  -- ==========================================================

  select
    coalesce(
      sum(quantity),
      0
    )::integer

  into v_refund_people

  from public.reservations

  where vip_offer_id = p_vip_offer_id
    and status = 'confirmed'
    and decision_choice = 'refund';


  -- ==========================================================
  -- Cas 1 :
  -- La période de décision est expirée
  -- et tout le monde n'a pas répondu
  --
  -- => remboursement
  -- ==========================================================

  if
    v_offer.decision_expires_at is not null
    and now() >= v_offer.decision_expires_at
    and v_answered_people < v_snapshot_count
  then

    v_new_status :=
      'refund_pending';


    update public.vip_offers

    set status =
      v_new_status

    where id =
      p_vip_offer_id;


    -- --------------------------------------------------------
    -- Toute réservation sans réponse est considérée
    -- comme remboursement par défaut
    -- --------------------------------------------------------

    update public.reservations

    set
      decision_choice =
        'refund',

      decision_at =
        coalesce(
          decision_at,
          now()
        ),

      refund_requested_at =
        coalesce(
          refund_requested_at,
          now()
        ),

      supplement_status =
        case
          when supplement_status = 'paid'
          then supplement_status
          else null
        end

    where vip_offer_id =
      p_vip_offer_id

      and status =
        'confirmed'

      and decision_choice
        is null;


    return v_new_status;

  end if;


  -- ==========================================================
  -- Tant que tout le monde n'a pas répondu :
  -- on ne fait rien
  -- ==========================================================

  if v_answered_people < v_snapshot_count then

    return
      'decision_pending';

  end if;


  -- ==========================================================
  -- Sécurité :
  -- on ne doit pas avoir plus de réponses que le snapshot
  -- ==========================================================

  if v_answered_people > v_snapshot_count then

    raise exception
      'Decision participant count exceeds snapshot for VIP offer %',
      p_vip_offer_id;

  end if;


  -- ==========================================================
  -- Cas 2 :
  -- Tout le monde a répondu
  -- et tout le monde accepte
  -- ==========================================================

  if
    v_maintain_people = v_snapshot_count
    and v_refund_people = 0
  then

    v_new_status :=
      'supplement_payment_pending';


    update public.vip_offers

    set status =
      v_new_status

    where id =
      p_vip_offer_id;


    -- --------------------------------------------------------
    -- Toutes les réservations doivent maintenant
    -- payer leur supplément
    -- --------------------------------------------------------

    update public.reservations

    set supplement_status =
      case

        when coalesce(
          supplement_amount,
          0
        ) <= 0
        then 'paid'

        else 'pending'

      end

    where vip_offer_id =
      p_vip_offer_id

      and status =
        'confirmed'

      and decision_choice =
        'maintain';


    return v_new_status;

  end if;


  -- ==========================================================
  -- Cas 3 :
  -- Tout le monde a répondu
  -- mais au moins une personne refuse
  -- ==========================================================

  if v_refund_people > 0 then

    v_new_status :=
      'refund_pending';


    update public.vip_offers

    set status =
      v_new_status

    where id =
      p_vip_offer_id;


    -- --------------------------------------------------------
    -- Puisque notre modèle exige que TOUS acceptent,
    -- la table ne peut plus être maintenue.
    --
    -- Toutes les réservations passent donc vers
    -- le processus de remboursement.
    -- --------------------------------------------------------

    update public.reservations

    set
      decision_choice =
        'refund',

      decision_at =
        coalesce(
          decision_at,
          now()
        ),

      refund_requested_at =
        coalesce(
          refund_requested_at,
          now()
        ),

      supplement_status =
        case
          when supplement_status = 'paid'
          then supplement_status
          else null
        end

    where vip_offer_id =
      p_vip_offer_id

      and status =
        'confirmed';


    return v_new_status;

  end if;


  -- ==========================================================
  -- Fallback
  -- ==========================================================

  return
    'decision_pending';

end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin

  new.updated_at =
    now();

  return new;

end;
$$;


--
-- Name: trigger_refresh_vip_offer_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_refresh_vip_offer_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin

  if tg_op = 'INSERT' then

    perform public.refresh_vip_offer_status(
      new.vip_offer_id
    );

    return new;

  end if;


  if tg_op = 'DELETE' then

    perform public.refresh_vip_offer_status(
      old.vip_offer_id
    );

    return old;

  end if;


  if tg_op = 'UPDATE' then

    if
      old.vip_offer_id
      is distinct from
      new.vip_offer_id
    then

      perform public.refresh_vip_offer_status(
        old.vip_offer_id
      );

      perform public.refresh_vip_offer_status(
        new.vip_offer_id
      );

    else

      perform public.refresh_vip_offer_status(
        new.vip_offer_id
      );

    end if;

    return new;

  end if;


  return null;

end;
$$;


--
-- Name: undo_check_in_reservation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.undo_check_in_reservation(p_reservation_code text) RETURNS TABLE(success boolean, message text, reservation_id uuid, checked_in_quantity integer, remaining_entries integer, checked_in boolean, checked_in_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_reservation record;
  v_new_checked_in_quantity integer;
  v_remaining integer;
  v_fully_checked_in boolean;
begin

  select
    r.id,
    r.quantity,
    coalesce(r.checked_in_quantity, 0) as checked_in_quantity,
    coalesce(r.checked_in, false) as checked_in,
    r.checked_in_at
  into v_reservation
  from public.reservations r
  where r.reservation_code = p_reservation_code
  limit 1
  for update;

  if not found then
    return query
    select
      false,
      'Réservation introuvable.',
      null::uuid,
      null::integer,
      null::integer,
      false,
      null::timestamptz;

    return;
  end if;

  if v_reservation.checked_in_quantity <= 0 then
    return query
    select
      false,
      'Aucune entrée à annuler.',
      v_reservation.id,
      0,
      v_reservation.quantity,
      false,
      null::timestamptz;

    return;
  end if;

  v_new_checked_in_quantity :=
    v_reservation.checked_in_quantity - 1;

  v_remaining :=
    greatest(
      0,
      v_reservation.quantity - v_new_checked_in_quantity
    );

  v_fully_checked_in :=
    v_new_checked_in_quantity >= v_reservation.quantity;

  update public.reservations
  set
    checked_in_quantity = v_new_checked_in_quantity,
    checked_in = v_fully_checked_in,
    checked_in_at =
      case
        when v_fully_checked_in then checked_in_at
        else null
      end
  where id = v_reservation.id;

  return query
  select
    true,
    'Une entrée a été annulée.',
    v_reservation.id,
    v_new_checked_in_quantity,
    v_remaining,
    v_fully_checked_in,
    case
      when v_fully_checked_in then v_reservation.checked_in_at
      else null
    end;

end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: club_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    club_id uuid NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT club_memberships_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'scanner'::text]))),
    CONSTRAINT club_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clubs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    city text NOT NULL,
    address text,
    image_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    club_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    event_date date NOT NULL,
    start_time time without time zone NOT NULL,
    music text,
    status text DEFAULT 'published'::text,
    created_at timestamp with time zone DEFAULT now(),
    image_url text,
    table_map_url text,
    commission_percentage numeric(5,2) DEFAULT 20 NOT NULL,
    CONSTRAINT events_commission_percentage_check CHECK (((commission_percentage >= (0)::numeric) AND (commission_percentage <= (100)::numeric)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'customer'::text NOT NULL,
    firstname text,
    lastname text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['customer'::text, 'manager'::text])))
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    vip_offer_id uuid NOT NULL,
    firstname text NOT NULL,
    lastname text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    quantity integer NOT NULL,
    total_price numeric(10,2) NOT NULL,
    deposit_paid numeric(10,2) NOT NULL,
    remaining_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'confirmed'::text,
    reservation_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    stripe_checkout_session_id text,
    paid_at timestamp with time zone,
    user_id uuid,
    checked_in boolean DEFAULT false,
    checked_in_at timestamp with time zone,
    checked_in_quantity integer DEFAULT 0,
    decision_choice text,
    decision_at timestamp with time zone,
    supplement_amount numeric(10,2),
    supplement_status text,
    supplement_paid_at timestamp with time zone,
    stripe_supplement_session_id text,
    refund_requested_at timestamp with time zone,
    refunded_at timestamp with time zone,
    merge_choice text,
    merge_choice_at timestamp with time zone,
    decision_choice_at timestamp with time zone,
    supplement_stripe_session_id text,
    CONSTRAINT reservations_decision_choice_check CHECK (((decision_choice IS NULL) OR (decision_choice = ANY (ARRAY['maintain'::text, 'refund'::text])))),
    CONSTRAINT reservations_merge_choice_check CHECK (((merge_choice IS NULL) OR (merge_choice = ANY (ARRAY['accept'::text, 'refuse'::text])))),
    CONSTRAINT reservations_supplement_status_check CHECK (((supplement_status IS NULL) OR (supplement_status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text]))))
);


--
-- Name: vip_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vip_offers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    capacity integer NOT NULL,
    confirmation_threshold integer NOT NULL,
    price_per_person numeric(10,2) NOT NULL,
    deposit_per_person numeric(10,2) NOT NULL,
    remaining_per_person numeric(10,2) NOT NULL,
    spots_reserved integer DEFAULT 0,
    status text DEFAULT 'forming'::text,
    created_at timestamp with time zone DEFAULT now(),
    table_number text NOT NULL,
    total_table_price numeric(10,2) NOT NULL,
    booking_deadline timestamp with time zone,
    decision_started_at timestamp with time zone,
    decision_expires_at timestamp with time zone,
    decision_snapshot_count integer,
    decision_price_per_person numeric(10,2),
    decision_supplement_per_person numeric(10,2),
    decision_original_price_per_person numeric(10,2),
    admin_decision text,
    admin_decision_at timestamp with time zone,
    admin_decision_by uuid,
    admin_decision_note text,
    merge_status text,
    merge_target_offer_id uuid,
    merge_proposed_at timestamp with time zone,
    merge_expires_at timestamp with time zone,
    supplement_per_person numeric(10,2),
    supplement_completed_at timestamp with time zone,
    CONSTRAINT vip_offers_admin_decision_check CHECK (((admin_decision IS NULL) OR (admin_decision = ANY (ARRAY['accept_as_is'::text, 'merge'::text, 'supplement'::text, 'refund'::text])))),
    CONSTRAINT vip_offers_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT vip_offers_confirmation_threshold_check CHECK (((confirmation_threshold > 0) AND (confirmation_threshold <= capacity))),
    CONSTRAINT vip_offers_merge_status_check CHECK (((merge_status IS NULL) OR (merge_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'refused'::text, 'expired'::text, 'completed'::text, 'cancelled'::text])))),
    CONSTRAINT vip_offers_total_table_price_check CHECK ((total_table_price > (0)::numeric))
);


--
-- Name: club_memberships club_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: events events_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_reservation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_reservation_code_key UNIQUE (reservation_code);


--
-- Name: vip_offers vip_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_offers
    ADD CONSTRAINT vip_offers_pkey PRIMARY KEY (id);


--
-- Name: club_memberships_club_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_memberships_club_id_idx ON public.club_memberships USING btree (club_id);


--
-- Name: club_memberships_user_club_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX club_memberships_user_club_unique ON public.club_memberships USING btree (user_id, club_id);


--
-- Name: club_memberships_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_memberships_user_id_idx ON public.club_memberships USING btree (user_id);


--
-- Name: idx_reservations_decision_choice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_decision_choice ON public.reservations USING btree (decision_choice);


--
-- Name: idx_reservations_merge_choice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_merge_choice ON public.reservations USING btree (merge_choice);


--
-- Name: idx_reservations_supplement_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_supplement_status ON public.reservations USING btree (supplement_status);


--
-- Name: idx_reservations_supplement_stripe_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_reservations_supplement_stripe_session_id ON public.reservations USING btree (supplement_stripe_session_id) WHERE (supplement_stripe_session_id IS NOT NULL);


--
-- Name: idx_vip_offers_merge_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vip_offers_merge_status ON public.vip_offers USING btree (merge_status);


--
-- Name: idx_vip_offers_merge_target_offer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vip_offers_merge_target_offer_id ON public.vip_offers USING btree (merge_target_offer_id);


--
-- Name: reservations_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservations_user_id_idx ON public.reservations USING btree (user_id);


--
-- Name: vip_offers_event_table_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vip_offers_event_table_number_unique ON public.vip_offers USING btree (event_id, table_number);


--
-- Name: club_memberships club_memberships_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER club_memberships_set_updated_at BEFORE UPDATE ON public.club_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reservations reservations_refresh_vip_offer_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reservations_refresh_vip_offer_status AFTER INSERT OR DELETE OR UPDATE OF status, quantity, vip_offer_id ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.trigger_refresh_vip_offer_status();


--
-- Name: club_memberships club_memberships_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: club_memberships club_memberships_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: club_memberships club_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_memberships
    ADD CONSTRAINT club_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: reservations reservations_vip_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_vip_offer_id_fkey FOREIGN KEY (vip_offer_id) REFERENCES public.vip_offers(id) ON DELETE CASCADE;


--
-- Name: vip_offers vip_offers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_offers
    ADD CONSTRAINT vip_offers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: vip_offers vip_offers_merge_target_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vip_offers
    ADD CONSTRAINT vip_offers_merge_target_offer_id_fkey FOREIGN KEY (merge_target_offer_id) REFERENCES public.vip_offers(id) ON DELETE SET NULL;


--
-- Name: clubs Public can read clubs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read clubs" ON public.clubs FOR SELECT TO authenticated, anon USING (true);


--
-- Name: events Public can read published events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published events" ON public.events FOR SELECT TO authenticated, anon USING ((status = 'published'::text));


--
-- Name: vip_offers Public can read vip offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read vip offers" ON public.vip_offers FOR SELECT TO authenticated, anon USING (true);


--
-- Name: profiles Users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: reservations Users can read own reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own reservations" ON public.reservations FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: reservations Users can read their reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their reservations" ON public.reservations FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: club_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: clubs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: club_memberships managers_read_all_club_memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY managers_read_all_club_memberships ON public.club_memberships FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: club_memberships users_read_own_club_memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_club_memberships ON public.club_memberships FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: vip_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vip_offers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict YLaQLVmu3esNsn7P3WuFYCCgfbi0epg5LtYMIrYNOu5P0uErq7UkJAXvVaHhTvI

