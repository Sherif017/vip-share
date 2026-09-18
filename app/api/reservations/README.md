# Routes de réservation

Un seul segment dynamique, `[reservationRef]`, doit exister directement sous
`app/api/reservations/`. Son nom interne ne change pas les URL publiques.
Chaque action détermine le type de référence attendu, sans détection automatique
ni recherche alternative entre UUID et code.

| Méthode et URL | Référence attendue |
| --- | --- |
| `POST /api/reservations` | Aucun paramètre de chemin ; création d'une réservation |
| `POST /api/reservations/:reservationRef/maintain` | `reservations.reservation_code`, alias local `code` |
| `POST /api/reservations/:reservationRef/refund-request` | `reservations.reservation_code`, alias local `code` |
| `POST /api/reservations/:reservationRef/supplement-decision` | UUID `reservations.id`, alias local `id` |
| `POST /api/reservations/:reservationRef/supplement-checkout` | UUID `reservations.id`, alias local `id` |
| `POST /api/reservations/:reservationRef/merge-decision` | UUID `reservations.id`, décision `accept` ou `refuse` |

La page `/confirmation/:code` récupère la réservation par `reservation_code` et
vérifie son propriétaire. Le QR contient ce même code ; les API de check-in le
reçoivent dans le corps de la requête. Ces parcours sont indépendants du nom du
segment dynamique des API ci-dessus.

Le composant `MergeDecisionActions` appelle
`POST /api/reservations/:reservationId/merge-decision` avec un UUID. Ce handler
vérifie l'utilisateur et la propriété de la réservation, puis délègue la décision
et la finalisation transactionnelles à Supabase.
