-- P1 : les remboursements peuvent légitimement se répéter pour une même
-- réservation (deposit ET supplément sont deux lignes distinctes dans
-- vip_refunds, unique(reservation_id, payment_type)). L'unicité actuelle
-- de reservation_emails sur (reservation_id, email_type) bloquerait le
-- second remboursement. Migration additive : ajout d'une dimension
-- entity_id, rétrocompatible à 100% avec les lignes et appels P0
-- existants (entity_id='' partout où il n'y a qu'une seule occurrence
-- possible par réservation, exactement le comportement actuel).
begin;

alter table public.reservation_emails
  add column entity_id text not null default '';

alter table public.reservation_emails
  drop constraint reservation_emails_reservation_id_email_type_key;

alter table public.reservation_emails
  add constraint reservation_emails_reservation_id_email_type_entity_id_key
  unique (reservation_id, email_type, entity_id);

comment on column public.reservation_emails.entity_id is
  'Identifiant de l''occurrence métier précise pour les types d''email '
  'pouvant se répéter légitimement pour une même réservation (ex : '
  'refund_id pour refund_requested/refund_completed, proposal_id pour '
  'merge_proposed/merge_completed, round key pour supplement_required). '
  'Chaîne vide pour les types à occurrence unique par réservation '
  '(reservation_confirmed, table_confirmed) : comportement identique à '
  'avant cette migration.';

-- claim_reservation_email doit maintenant accepter et utiliser
-- entity_id dans son verrou d'unicité. p_entity_id a un défaut '', donc
-- tous les appels P0 existants (named args, sans ce paramètre) gardent
-- exactement le même comportement qu'avant cette migration.
drop function public.claim_reservation_email(uuid, text, text, interval);

create or replace function public.claim_reservation_email(
  p_reservation_id uuid,
  p_email_type text,
  p_idempotency_key text,
  p_entity_id text default '',
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
  insert into public.reservation_emails (reservation_id, email_type, entity_id, idempotency_key, status)
  values (p_reservation_id, p_email_type, p_entity_id, p_idempotency_key, 'pending')
  on conflict (reservation_id, email_type, entity_id) do nothing;

  update public.reservation_emails as re
  set status = 'processing',
      attempts = re.attempts + 1,
      updated_at = clock_timestamp()
  where re.reservation_id = p_reservation_id
    and re.email_type = p_email_type
    and re.entity_id = p_entity_id
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
    and email_type = p_email_type
    and entity_id = p_entity_id;

  return query select false, v_row.id, v_row.attempts, v_row.status, v_row.idempotency_key;
end;
$$;

revoke all on function public.claim_reservation_email(uuid, text, text, text, interval)
  from public;

revoke all on function public.claim_reservation_email(uuid, text, text, text, interval)
  from anon;

revoke all on function public.claim_reservation_email(uuid, text, text, text, interval)
  from authenticated;

grant execute on function public.claim_reservation_email(uuid, text, text, text, interval)
  to service_role;

commit;
