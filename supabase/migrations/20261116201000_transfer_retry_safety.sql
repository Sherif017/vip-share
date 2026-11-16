begin;

-- Conserver la premiere tentative independamment des reprises.
alter table public.payment_transactions
  add column if not exists
    transfer_first_requested_at timestamptz;

comment on column
  public.payment_transactions.transfer_first_requested_at
is
  'Premiere tentative de transfert. Ne doit pas etre reinitialisee lors des reprises.';

-- Protection conservatrice des transactions historiques.
-- Leur premiere tentative exacte ne peut pas etre reconstruite
-- de maniere fiable. Elles devront passer par reconciliation
-- avant toute nouvelle creation de transfert.
update public.payment_transactions
set transfer_first_requested_at =
  '1970-01-01 00:00:00+00'::timestamptz
where transfer_first_requested_at is null
  and (
    transfer_attempt_count > 0
    or transfer_requested_at is not null
    or transfer_status in ('processing', 'failed')
  );

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

    transfer_first_requested_at =
      coalesce(
        transfer_first_requested_at,
        clock_timestamp()
      ),

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

notify pgrst, 'reload schema';

commit;
