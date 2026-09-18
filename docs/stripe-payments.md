# Flux de paiement Stripe

## Deposit initial

Le navigateur envoie uniquement les informations de réservation et un identifiant UUID de tentative de checkout. L’API authentifiée crée la réservation via l’overload idempotent de `create_vip_reservation`; la contrainte `(user_id, initial_checkout_attempt_id)` empêche deux réservations pour la même tentative concurrente. Le Deposit retourné par Supabase est la seule source du montant Stripe. L’API crée une Checkout Session `card` avec `payment_type=initial_deposit`, puis enregistre son identifiant. Stripe appelle ensuite le webhook signé, qui exige `payment_status=paid`, vérifie la session, la devise et le montant contre la réservation, puis appelle `confirm_vip_reservation_payment`. Les anciennes sessions sans `payment_type` restent interprétées comme des Deposits.

## Supplément

Après la décision `maintain`, l’API charge `supplement_amount` depuis Supabase. Elle réutilise une session ouverte, ou crée une session `card` avec `payment_type=supplement` et une clé d’idempotence stable par réservation. Le webhook signé appelle `confirm_vip_supplement_payment` avec l’identifiant de session Stripe. Une session expirée appelle `expire_vip_supplement_checkout` et permet une nouvelle tentative.

La clé d’idempotence Stripe `initial-deposit:<reservation_id>` est maintenant réutilisée lorsque l’API reçoit le même identifiant de tentative. La nouvelle RPC de confirmation verrouille la réservation, vérifie le session ID et le montant, et réconcilie un paiement arrivé après expiration : elle reprend la place si la capacité le permet, sinon place la réservation en `refund_pending` pour traitement administratif. Les doubles webhooks deviennent sans effet.

Le webhook lit le corps brut, vérifie `stripe-signature` avec `STRIPE_WEBHOOK_SECRET`, ne fait confiance à aucun montant de metadata et ne journalise que l’événement, la session, la réservation et le type de paiement. Aucun remboursement Stripe n’est exécuté.

## Remboursements Stripe (audit)

Le bouton d'administration appelle `POST /api/admin/reservations/:id/refund`.
Après `getAdminAccess` puis `canManageVipOffer`, la route appelle les RPC
`prepare_vip_refund` et `claim_vip_refund`. La table `vip_refunds` possède une
clé unique `(reservation_id, payment_type)`, ce qui sépare `initial_deposit` et
`supplement`. La clé Stripe `vip-refund:<refund-row-id>` rend les nouvelles
tentatives idempotentes, y compris après perte de la réponse Stripe ou une
erreur lors de la mise à jour DB.

Avant de créer un refund, la route liste aussi les refunds existants du
PaymentIntent. Un refund EUR du montant attendu est réutilisé, ce qui protège
le retry même après la rétention Stripe des clés d’idempotence. Un remboursement
partiel d’un montant différent fait échouer la tentative sans créer de nouveau
refund.

Avant `stripe.refunds.create`, la route relit la session Checkout associée,
exige `complete` + `paid` + `eur`, vérifie `payment_type`, `reservation_id`,
`user_id` et `vip_offer_id`, puis compare le montant Stripe au montant serveur :
`deposit_paid * 100` pour le Deposit ou `supplement_amount * 100` pour le
supplément. Le montant envoyé à Stripe vient donc de la réservation DB, jamais
du navigateur. Le PaymentIntent développé par la session doit être `succeeded`,
en EUR, avec `amount_received` identique. Le RPC `complete_vip_refund` conserve
les identifiants Stripe, le montant et les timestamps ; la réservation passe à
`refunded` seulement lorsque toutes ses lignes de remboursement sont terminées.

Une demande client (`refund-request`) ne fait qu'enregistrer une décision et
ne déclenche jamais Stripe. Un customer ou scanner ne passe pas
`canManageVipOffer`; un club admin reste limité à son club et un manager peut
agir globalement. Les RPC de refund sont `SECURITY DEFINER`, accessibles à
`service_role` uniquement. Aucun remboursement réel n'a été lancé pendant cet
audit.

## Mission 12A — retry du Checkout initial

`checkoutAttemptId` → réservation stable → clé Stripe stable → paramètres
persistés stables → session réutilisée → confirmation par webhook signé.

La migration additive `202609170004_stable_initial_checkout.sql` ajoute
`reservations.initial_checkout_params`. Avant tout appel Stripe, le serveur y
enregistre le premier payload complet (montant, metadata, email, URL et expiration)
avec un UPDATE conditionné à NULL, puis relit le gagnant. Deux processus concurrents
utilisent ainsi le même payload, même si leur horloge, origine HTTP ou formulaire
diffèrent. Les prix et identifiants viennent de la réservation persistée.
Cette colonne ne contient aucune clé API ; son écriture utilise uniquement
`service_role`, sans nouvelle permission client ni nouvelle RPC.

L'expiration est fixée une seule fois à 31 minutes lors de cette préparation,
puis persistée : la minute de marge permet la sauvegarde et l'appel Stripe avant
son minimum de 30 minutes. Une première création retardée au-delà de cette marge
peut être refusée par Stripe ; elle ne provoque jamais une libération immédiate.
La maintenance utilise cette expiration persistée, avec un verrou sur la
réservation ; les anciennes réservations sans snapshot gardent les 30 minutes
depuis `created_at`. Le snapshot n'est jamais renouvelé pour une même tentative.

| Fenêtre | Comportement |
| --- | --- |
| A — aucune session créée | Sauvegarder le snapshot puis créer ; échec avant sauvegarde : aucun appel Stripe. Erreur de création : conserver la réservation et permettre le retry/maintenance. |
| B — ID enregistré | Récupérer la session actuelle ; si open et réservation pending, retourner la même URL sans créer. |
| C — réponse perdue avant association DB | Rejouer exactement le snapshot avec `initial-deposit:<reservation_id>`, associer conditionnellement le même ID, puis récupérer son état actuel. |
| D — session réellement expired | Appeler l'expiration métier existante uniquement après lecture de cet état Stripe ; répondre 409 et demander une nouvelle réservation. |
| E — session complete ou paid | Retourner la page de confirmation, sans nouveau Checkout ni confirmation DB ; attendre le webhook. |
| F — POST concurrents | Snapshot unique, clé unique, association DB conditionnelle ; réessayer brièvement `idempotency_key_in_use`, puis 503 récupérable si le conflit persiste. |

Un timeout, une erreur Stripe générique, une erreur d'association DB ou une
réponse sans URL n'expire jamais automatiquement une réservation/session.
Les erreurs retournées sont génériques et ne journalisent aucun objet Stripe.
Un ID de session déjà associé n'est jamais écrasé par le retry.
Le résultat mis en cache de `sessions.create` est toujours suivi de `retrieve`,
car une session initialement open peut désormais être expired ou complete.

Une tentative sans ID associé est bloquée à expiration + 22 heures, avant les
24 heures minimales de conservation de la clé d'idempotence Stripe. Elle exige
alors une réconciliation ; aucune nouvelle session ne doit être créée avec une
clé potentiellement purgée. Les tentatives anciennes, créées avant ce correctif
et sans ID associé, peuvent aussi nécessiter une réconciliation : leur payload
historique n'est pas reconstructible avec certitude.

Les webhooks existants restent inchangés. S'ils arrivent avant l'association DB,
ils répondent 500 afin de permettre leur redélivrance après un retry qui associe
la session. Sans retry, une association perdue exige une réconciliation ; ce
correctif n'ajoute pas de worker de récupération. La logique tardive Mission 11
reste l'autorité après expiration métier.

Validation locale : `npm run test:checkout-retry`. Les tests exécutent les vrais
handlers POST et webhook, utilisent le SDK Stripe pour signer les événements
synthétiques et modélisent les contrats Stripe/Supabase en mémoire. Ils ne sont
ni un paiement réel ni un remplacement des tests SQL Mission 11.
Le test complémentaire `supabase/tests/mission12a.sql` vérifie sur Staging
la sauvegarde conditionnelle, la réservation stable, le compteur, le calcul de
deadline et les permissions. Toutes ses fixtures sont annulées par rollback.
