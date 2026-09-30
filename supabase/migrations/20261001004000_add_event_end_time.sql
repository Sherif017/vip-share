-- ============================================================
-- K-RÉ — heure de fin des soirées
-- ============================================================
--
-- start_time = fermeture des nouvelles réservations
-- end_time   = disparition du catalogue public
--
-- Si end_time <= start_time, la fin est le lendemain.
-- Exemple : 23:30 -> 05:00.
--
-- Les soirées historiques reçoivent 06:00.
-- ============================================================

alter table public.events
  add column if not exists end_time time without time zone;

update public.events
set end_time = time '06:00'
where end_time is null;

alter table public.events
  alter column end_time set default time '06:00';

alter table public.events
  alter column end_time set not null;

comment on column public.events.end_time is
  'Heure locale Europe/Paris de fin de soirée. Si end_time <= start_time, la fin est le lendemain.';
