begin;

create or replace function public.complete_vip_refund(
  p_refund_id uuid,
  p_stripe_refund_id text,
  p_payment_intent_id text,
  p_amount integer,
  p_processed_by uuid
)
returns public.vip_refunds
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v public.vip_refunds%rowtype;
  v_reservation public.reservations%rowtype;
  remaining integer;
begin
  select *
  into v
  from public.vip_refunds
  where id = p_refund_id
  for update;

  if v.id is null then
    raise exception 'Remboursement introuvable.';
  end if;

  -- Idempotence :
  -- un refund déjà finalisé ne doit ni rappeler Stripe
  -- ni libérer les places une seconde fois.
  if v.status = 'refunded' then
    return v;
  end if;

  update public.vip_refunds
  set
    status = 'refunded',
    stripe_refund_id =
      coalesce(stripe_refund_id, p_stripe_refund_id),
    stripe_payment_intent_id =
      coalesce(
        stripe_payment_intent_id,
        p_payment_intent_id
      ),
    amount = coalesce(amount, p_amount),
    processed_at = clock_timestamp(),
    processed_by = p_processed_by,
    last_error = null
  where id = v.id
  returning * into v;

  select count(*)
  into remaining
  from public.vip_refunds
  where reservation_id = v.reservation_id
    and status <> 'refunded';

  if remaining = 0 then

    -- Verrouiller la réservation avant sa transition finale.
    select *
    into v_reservation
    from public.reservations
    where id = v.reservation_id
    for update;

    if v_reservation.id is null then
      raise exception 'Réservation introuvable.';
    end if;

    -- Ne libérer les places qu'au PREMIER passage vers refunded.
    if v_reservation.status <> 'refunded' then

      update public.vip_offers
      set spots_reserved =
        greatest(
          0,
          spots_reserved - v_reservation.quantity
        )
      where id = v_reservation.vip_offer_id;

      update public.reservations
      set
        refunded_at =
          coalesce(refunded_at, clock_timestamp()),
        status = 'refunded'
      where id = v_reservation.id;

    end if;

  end if;

  return v;
end;
$function$;

-- Conserver les permissions sensibles existantes.
revoke execute on function public.complete_vip_refund(
  uuid,
  text,
  text,
  integer,
  uuid
) from public, anon, authenticated;

grant execute on function public.complete_vip_refund(
  uuid,
  text,
  text,
  integer,
  uuid
) to service_role;

commit;
