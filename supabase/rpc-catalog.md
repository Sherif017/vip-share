# RPC Supabase utilisées par l’application

Ce catalogue est basé sur les appels présents dans `app/`. Les signatures marquées « déduite » proviennent des objets passés à `supabase.rpc`; la définition PostgreSQL distante n’est pas disponible dans ce dépôt.

| RPC | Appelant / paramètres observés | SQL versionné | Transaction / idempotence | Permissions et risque |
| --- | --- | --- | --- | --- |
| `create_vip_reservation` | `app/api/reservations/route.ts`; event slug, offer id, identité, quantité, montants | Non | Inconnues | Service role uniquement côté serveur ; réservation/overselling à auditer |
| `confirm_vip_reservation` | Stripe webhook; `p_reservation_id` | Non | Inconnues ; doit être idempotente | Service role ; double webhook à vérifier |
| `expire_vip_reservation` | création de réservation et webhook; `p_reservation_id` | Non | Inconnues ; doit être idempotente | Service role ; concurrence paiement/expiration à vérifier |
| `check_in_reservation` | API scanner; `p_reservation_code` | Non | Inconnues | Service role après `canScanClub`; double scan à vérifier |
| `undo_check_in_reservation` | API scanner; `p_reservation_code` | Non | Inconnues | Service role après `canScanClub` |
| `resolve_vip_offer_decision` | maintain/refund; `p_vip_offer_id` | Non | Inconnues | Service role après contrôle propriétaire |
| `admin_accept_vip_offer_as_is` | API admin; `p_vip_offer_id`, `p_admin_user_id` | Non | Inconnues | Service role; contrôle admin applicatif |
| `admin_start_vip_offer_supplement` | API admin; `p_offer_id`, `p_admin_user_id`, `p_expires_at` | Non | Inconnues | Service role; contrôle admin applicatif |
| `customer_decide_vip_offer_supplement` | API client; `p_reservation_id`, `p_user_id`, `p_choice` | Non | Inconnues | Service role après contrôle propriétaire |
| `confirm_vip_supplement_payment` | Stripe webhook; reservation id et Stripe session id | Non | Inconnues ; doit être idempotente | Service role ; double paiement à vérifier |
| `expire_vip_supplement_checkout` | Stripe webhook; reservation id et Stripe session id | Non | Inconnues ; doit être idempotente | Service role |
| `admin_propose_vip_offer_merge` | API admin; source, cible, admin id, expiration | Oui, migration `202609160001_secure_vip_offer_merge.sql` | Transactionnelle avec verrous de tables | `SECURITY DEFINER`, EXECUTE service role uniquement |
| `customer_decide_vip_offer_merge` | API client; reservation id, user id, choix | Oui, même migration | Transactionnelle ; choix répétée idempotent | `SECURITY DEFINER`, EXECUTE service role uniquement |
| `finalize_vip_offer_merge` | appelée par la RPC client de fusion; source offer id | Oui, même migration | Transactionnelle, transfert intégral ou rollback | `SECURITY DEFINER`, EXECUTE révoqué y compris service role par la migration actuelle |

## Audit de la migration de fusion

La migration crée `vip_merge_proposals`, verrouille `vip_offers` et `reservations`, vérifie l’événement, les prix, le Deposit, le solde, la capacité, le check-in et les paiements de supplément, puis effectue le transfert et le recalcul des compteurs dans une seule transaction PostgreSQL. Elle n’a pas été réécrite pendant la Mission 6.

Les définitions des RPC fournies lors de l’audit sont décrites dans [remote-rpc-audit.md](./remote-rpc-audit.md). Elles sont connues pour `create_vip_reservation`, `confirm_vip_reservation`, `expire_vip_reservation`, `check_in_reservation`, `undo_check_in_reservation`, `confirm_vip_supplement_payment`, `expire_vip_supplement_checkout`, `customer_decide_vip_offer_supplement`, `resolve_vip_offer_decision`, `admin_accept_vip_offer_as_is` et `admin_start_vip_offer_supplement`, mais leur présence distante doit encore être validée. Les autres corps SQL restent inconnus.

## RPC d’orchestration des deadlines (Mission 9)

`expire_stale_pending_reservations`, `refresh_due_vip_offers`, `expire_due_merge_proposals` et `expire_due_supplement_decisions` sont versionnées dans `202609160003_deadline_maintenance.sql` et exécutables uniquement par `service_role`. Elles orchestrent respectivement les réservations non payées, les tables arrivées à `booking_deadline`, les propositions de fusion échues et les décisions de supplément échues. Les trois dernières délèguent les transitions métier aux RPC existantes lorsque leur corps reste distant et inconnu.
