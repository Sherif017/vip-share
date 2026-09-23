-- Mission : suivi des emails transactionnels, découplé de l'état de
-- réservation. Migration additive : ne modifie ni ne supprime aucune
-- table, colonne, RPC ou politique existante. Le workflow de paiement
-- Stripe (RPC confirm_vip_reservation_payment, expire_vip_reservation,
-- confirm_vip_supplement_payment, expire_vip_supplement_checkout) n'est
-- pas touché.
begin;

create table public.reservation_emails (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  email_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  idempotency_key text not null,
  resend_message_id text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  unique (reservation_id, email_type)
);

comment on table public.reservation_emails is
  'Suivi de l''état d''envoi des emails transactionnels par réservation, '
  'volontairement indépendant de reservations.status : une panne ou un '
  'retry Resend ne doit jamais affecter ni être confondu avec l''état du '
  'paiement/réservation.';

-- Table strictement interne : aucun accès anon/authenticated. Seul
-- service_role (utilisé par supabaseAdmin, cf. lib/supabase-admin.ts)
-- peut lire ou écrire ici.
alter table public.reservation_emails enable row level security;

revoke all on table public.reservation_emails from anon, authenticated;

grant select, insert, update, delete
  on table public.reservation_emails
  to service_role;

-- Claim atomique : unique point de protection contre la concurrence.
--
-- Une ligne est réclamable quand :
--   - elle n'existe pas encore (premier passage) ;
--   - son dernier statut est 'failed' (retry autorisé) ;
--   - elle est 'processing' depuis plus longtemps que p_stale_after
--     (tentative abandonnée : fonction crashée/timeout, par exemple).
--
-- Une ligne 'sent' n'est JAMAIS reprise. Seul l'appelant qui gagne
-- l'UPDATE (verrouillage de ligne Postgres standard, une seule
-- instruction SQL) doit appeler Resend ; un appelant concurrent reçoit
-- claimed = false et ne doit rien envoyer.
--
-- SECURITY INVOKER (et non DEFINER) : cette fonction n'est exécutable
-- que par service_role (EXECUTE révoqué à PUBLIC/anon/authenticated
-- ci-dessous), et service_role possède déjà, par ses propres droits,
-- tout ce qu'il faut : les GRANT directs sur public.reservation_emails
-- ci-dessus, et le contournement natif de la RLS propre à ce rôle. Il
-- n'y a donc aucun besoin d'élévation de privilèges via SECURITY
-- DEFINER. En INVOKER, même si l'EXECUTE était un jour accordé par
-- erreur à un rôle moins privilégié, celui-ci resterait bloqué par la
-- RLS/les GRANT de table existants — la fonction ne peut rien faire de
-- plus que ce que son appelant peut déjà faire lui-même. search_path
-- reste explicitement fixé et tous les objets qualifiés avec public.
-- par précaution supplémentaire, indépendamment du mode choisi.
create or replace function public.claim_reservation_email(
  p_reservation_id uuid,
  p_email_type text,
  p_idempotency_key text,
  p_stale_after interval default interval '5 minutes'
)
returns table(
  claimed boolean,
  row_id uuid,
  attempts integer,
  status text,
  idempotency_key text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.reservation_emails%rowtype;
begin
  insert into public.reservation_emails (reservation_id, email_type, idempotency_key, status)
  values (p_reservation_id, p_email_type, p_idempotency_key, 'pending')
  on conflict (reservation_id, email_type) do nothing;

  update public.reservation_emails as re
  set status = 'processing',
      attempts = re.attempts + 1,
      updated_at = clock_timestamp()
  where re.reservation_id = p_reservation_id
    and re.email_type = p_email_type
    and (
      re.status in ('pending', 'failed')
      or (re.status = 'processing' and re.updated_at < clock_timestamp() - p_stale_after)
    )
  returning re.* into v_row;

  if found then
    return query select true, v_row.id, v_row.attempts, v_row.status, v_row.idempotency_key;
    return;
  end if;

  select * into v_row
  from public.reservation_emails
  where reservation_id = p_reservation_id
    and email_type = p_email_type;

  return query select false, v_row.id, v_row.attempts, v_row.status, v_row.idempotency_key;
end;
$$;

-- Verrouillage explicite de la fonction : seul service_role peut
-- l'exécuter. Trois REVOKE distincts (au lieu d'un REVOKE ALL groupé)
-- pour que chaque rôle soit explicitement et individuellement couvert.
revoke all on function public.claim_reservation_email(uuid, text, text, interval)
  from public;

revoke all on function public.claim_reservation_email(uuid, text, text, interval)
  from anon;

revoke all on function public.claim_reservation_email(uuid, text, text, interval)
  from authenticated;

grant execute on function public.claim_reservation_email(uuid, text, text, interval)
  to service_role;

commit;
