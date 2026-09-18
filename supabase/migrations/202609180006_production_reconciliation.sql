-- VIP Share — Production reconciliation marker
--
-- Production predated the numbered migration history. Its schema was aligned
-- by a separately reviewed, transactional reconciliation on 2026-09-18.
-- The baseline migration was intentionally not replayed. This migration is a
-- safe, repeatable declaration of that reconciled state for future history;
-- it does not recreate the baseline or delete business data.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF to_regclass('public.vip_refunds') IS NULL THEN
    RAISE EXCEPTION 'Production reconciliation prerequisite missing: public.vip_refunds';
  END IF;
  IF to_regclass('public.vip_merge_proposals') IS NULL THEN
    RAISE EXCEPTION 'Production reconciliation prerequisite missing: public.vip_merge_proposals';
  END IF;
  IF to_regprocedure('public.undo_check_in_reservation(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Production reconciliation prerequisite failed: undo_check_in_reservation still exists';
  END IF;
  IF to_regprocedure('public.is_manager(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Production reconciliation prerequisite missing: public.is_manager(uuid)';
  END IF;
END
$$;

-- Keep the denormalized counters aligned with the final application definition
-- of an active reservation. This UPDATE is idempotent and preserves all rows.
UPDATE public.vip_offers AS offer
SET spots_reserved = counts.active_count
FROM (
  SELECT
    offer_id,
    count(*)::integer AS active_count
  FROM public.reservations
  WHERE status IN ('confirmed', 'checked_in', 'pending_payment')
  GROUP BY offer_id
) AS counts
WHERE offer.id = counts.offer_id
  AND offer.spots_reserved IS DISTINCT FROM counts.active_count;

UPDATE public.vip_offers AS offer
SET spots_reserved = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.reservations AS reservation
  WHERE reservation.offer_id = offer.id
    AND reservation.status IN ('confirmed', 'checked_in', 'pending_payment')
)
  AND offer.spots_reserved <> 0;

COMMIT;
