# VIP Share — machines à états métier

Les états appartiennent à des objets différents. Un état de réservation ne déduit pas l'état de sa table.

Les deadlines sont traitées par le Cron horaire `/api/cron/maintenance`. Les transitions de paiement et de décision restent déléguées aux RPC existantes ; leurs garanties internes restent à confirmer tant que leur SQL distant n’est pas versionné.

## Event

| État actuel | Déclencheur | État suivant |
| --- | --- | --- |
| `draft` | publication admin | `published` |
| `published` | annulation admin | `cancelled` (terminal) |

## Table (`vip_offers.status`)

| État actuel | Déclencheur | État suivant |
| --- | --- | --- |
| `forming` | seuil atteint | `confirmed` |
| `forming` | échéance sous le seuil | `admin_review` |
| `admin_review` | admin accepte telle quelle (`accept_as_is`) | `confirmed` |
| `admin_review` | admin propose un supplément | `decision_pending` |
| `admin_review` | admin propose une fusion | `merge_pending` |
| `admin_review` | annulation/remboursement demandé | `refund_pending` |
| `decision_pending` | tous maintiennent | `supplement_payment_pending` |
| `decision_pending` | refus ou expiration | `refund_pending` |
| `supplement_payment_pending` | tous les paiements réussissent | `confirmed` |
| `merge_pending` | tous acceptent | `merged` (terminal) |
| `merge_pending` | refus, expiration ou invalidation | `admin_review` |
| `refund_pending` | traitement démarré | `refunding` |
| `refunding` | remboursement terminé | `refunded` (terminal) |

`accept_as_is` est sticky : un rafraîchissement ou un recalcul de seuil ne remet pas la table en `admin_review`. `merged`, `refunded` et `cancelled` sont terminaux, sauf action administrative explicite. Le SQL de la Mission 2 reste la source transactionnelle de la finalisation de fusion.

## Reservation (`reservations.status`)

| État actuel | Déclencheur | État suivant |
| --- | --- | --- |
| `pending_payment` | paiement Deposit confirmé | `confirmed` |
| `pending_payment` | session expirée | `cancelled`/`expired` selon le RPC distant |
| `confirmed` | entrée complète constatée | `checked_in` |
| `confirmed` ou `checked_in` | annulation/remboursement | `cancelled` ou `refunded` |

`decision_choice` porte la décision de supplément (`maintain`/`refund`) dans l’implémentation actuelle. `decision_at` est le timestamp utilisé par les handlers ; `decision_choice_at` est legacy (lu pour compatibilité, jamais écrit par le nouveau code).

## Merge

`merge_status = pending` et `merge_choice = accept|refuse` décrivent la proposition. Tous les participants doivent répondre `accept`; une réponse manquante ou expirée n’est jamais un consentement. `merge_target_offer_id` et `merge_expires_at` bornent la proposition. La RPC `customer_decide_vip_offer_merge` déclenche la finalisation transactionnelle de la Mission 2.

## Supplement

`admin_decision = supplement` ouvre `decision_pending`. Une décision `maintain` mène à `supplement_payment_pending`; `supplement_status` suit `pending` → `payment_pending` → `paid`. Un refus mène à `refund_pending`. Aucun remboursement Stripe n’est déclenché par cette mission.

## Refund

Les états de table sont `refund_pending` → `refunding` → `refunded`. Le remboursement Stripe réel sera traité en Mission 8.

## Check-in

La source de vérité opérationnelle est `checked_in_quantity`, car elle permet l’entrée partielle. `checked_in` et `checked_in_at`, ainsi que `status = checked_in` lorsque l’entrée est complète, sont des marqueurs dénormalisés maintenus par les RPC `check_in_reservation` et `undo_check_in_reservation`. Le scanner continue d’appeler ces RPC; aucune mise à jour non transactionnelle n’a été ajoutée.

## Vocabulaire financier

L’interface parle de **Deposit**. `events.commission_percentage` reste inchangé en base pour compatibilité.
