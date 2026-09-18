# Audit des RPC distantes fournies

Les définitions SQL reçues ont été comparées aux appels applicatifs. Elles ne sont pas considérées comme appliquées par le dépôt tant qu’une validation contrôlée sur Supabase n’a pas été faite.

- `create_vip_reservation` verrouille la table, calcule les montants côté serveur et incrémente `spots_reserved` dans la transaction.
- `confirm_vip_reservation` et `expire_vip_reservation` verrouillent la réservation ; leurs transitions sont idempotentes et l’expiration ne libère les places que depuis `pending_payment`.
- `confirm_vip_supplement_payment` verrouille réservation et table, vérifie le Stripe session ID et ignore un webhook répété après `paid`.
- `expire_vip_supplement_checkout` ne modifie pas une réservation déjà payée et efface uniquement la session correspondante.
- `check_in_reservation` et `undo_check_in_reservation` verrouillent la réservation et utilisent `checked_in_quantity` comme compteur canonique ; le statut reste `confirmed` dans le SQL fourni.
- `customer_decide_vip_offer_supplement` verrouille réservation et table et refuse une seconde décision.

La migration `202609160004_harden_remote_offer_decisions.sql` corrige deux incohérences : l’acceptation admin exige `admin_review` (avec répétition idempotente si déjà `confirmed`/`accept_as_is`) et le démarrage du supplément écrit `supplement_status = 'pending'` au lieu de `pending_decision`.

Point critique restant : `resolve_vip_offer_decision` fourni transforme les participants sans réponse en `decision_choice = 'refund'`. Cela ne devient pas `maintain`, mais efface la distinction entre refus explicite et absence de réponse. Cette décision doit être validée avant production.
