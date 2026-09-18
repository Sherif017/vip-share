# Production migration history

Production existed before the current numbered Supabase migration history was
introduced. A controlled, transactional reconciliation was performed against
the real Production schema on 2026-09-18. The original production baseline
(`20260915000000_production_schema_baseline.sql`) was deliberately not replayed,
because doing so could conflict with existing Production objects and data.

The reconciliation preserved business rows, added the missing final objects and
security rules, removed the obsolete `undo_check_in_reservation` function, and
recomputed `vip_offers.spots_reserved` from the final active reservation
statuses (`confirmed`, `checked_in`, and `pending_payment`).

`202609180006_production_reconciliation.sql` records that reconciled state. It
is intentionally idempotent and does not contain secrets, seeds, or destructive
data operations.

## Future migrations

Future schema changes must be added as new numbered migrations after
`202609180006` and validated on Staging first. Do not replay the baseline or
the historical migrations against Production. Before the next Production
release, review the migration against the live schema and apply it through the
approved Production workflow.

The migration history repair is intentionally a separate operation. After a
human review, use the Supabase CLI linked to Production only to mark the
historical versions as already represented by the reconciliation; this records
their effective state and does not execute their SQL:

```sh
supabase migration repair --linked --status applied \
  20260915000000 \
  202609160001 202609160002 202609160003 202609160004 202609160005 \
  202609170001 202609170002 202609170003 202609170004 \
  202609180001 202609180002 202609180003 202609180004 202609180005 \
  202609180006
```

That command is a proposed follow-up only; it was not run as part of the
reconciliation. The release record must explicitly state that the baseline was
not replayed and that these versions are being marked applied because their
effective schema and security state are already present.
