begin;

-- ============================================================
-- K-RÉ — empêcher toute NOUVELLE réservation après le début
-- d'une soirée.
--
-- Important :
-- - aucune réservation historique n'est modifiée ;
-- - aucun statut d'événement historique n'est modifié ;
-- - Admin / Manager conservent donc tout l'historique ;
-- - ce garde s'applique aussi bien au nouveau full-payment
--   qu'à toute ancienne route legacy encore présente.
-- ============================================================

create or replace function public.guard_reservation_before_event_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_date date;
  v_start_time time without time zone;
  v_event_start timestamptz;
begin
  select
    e.event_date,
    e.start_time
  into
    v_event_date,
    v_start_time
  from public.events e
  where e.id = new.event_id;

  if not found then
    raise exception
      'Événement introuvable pour cette réservation.'
      using errcode = '23503';
  end if;

  -- Les horaires des événements K-RÉ sont des horaires locaux Paris.
  v_event_start :=
    (v_event_date + v_start_time)
    at time zone 'Europe/Paris';

  if clock_timestamp() >= v_event_start then
    raise exception
      'Les réservations sont terminées pour cette soirée.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists
  reservations_block_after_event_start
on public.reservations;

create trigger reservations_block_after_event_start
before insert on public.reservations
for each row
execute function public.guard_reservation_before_event_start();

revoke all
on function public.guard_reservation_before_event_start()
from public, anon, authenticated;

grant execute
on function public.guard_reservation_before_event_start()
to service_role;

comment on function public.guard_reservation_before_event_start() is
  'K-RÉ safety guard: blocks creation of a reservation once the associated event has started in Europe/Paris. Existing reservations are untouched.';

commit;
