# Supabase

Le dépôt contient actuellement une migration métier versionnée :

- `migrations/202609160001_secure_vip_offer_merge.sql` — migration de sécurisation de la fusion, préparée pour la base existante. Son application distante n’a pas été vérifiée dans cette session.
- `migrations/202609160002_secure_refunds.sql` — modèle de remboursement, préparé mais non appliqué à distance.
- `migrations/202609160003_deadline_maintenance.sql` — RPC d’orchestration des expirations, préparée mais non appliquée à distance.
- `migrations/202609160004_harden_remote_offer_decisions.sql` — durcissement des RPC admin basé sur les définitions distantes fournies, préparé mais non appliqué à distance.
- `migrations/202609160005_staging_compatibility.sql` — correction additive des statuts supplément et des droits `EXECUTE`, prévue après `004`.
- `migrations/202609170001_fix_deadline_maintenance_runtime.sql` — correction du conflit d’alias PL/pgSQL de la maintenance des expirations.
- `migrations/202609170002_harden_initial_deposit.sql` — idempotence de tentative de checkout Deposit, liaison session/réservation et réconciliation paiement/expiration.
- `migrations/202609170003_fix_late_payment_idempotence.sql` — rend idempotent le rejeu d’un webhook après passage en `refund_pending` pour capacité insuffisante.
- `tests/mission11.sql` — batterie SQL transactionnelle Mission 11, strictement Staging et annulée par rollback final.

Le dump Production brut est conservé dans `snapshots/20260915000000_production_schema_baseline.sql`. La migration `migrations/20260915000000_production_schema_baseline.sql` est une copie préparée sans `CREATE SCHEMA public` ni directives psql `\\restrict`/`\\unrestrict`.

Les autres fonctions RPC appelées par Next.js existent selon le contrat PostgREST utilisé par l’application, mais leurs définitions SQL ne sont pas versionnées ici. La liste et les signatures déduites sont dans [rpc-catalog.md](./rpc-catalog.md). Il ne faut pas présenter le dépôt comme un schéma reproductible complet tant que ces fonctions n’ont pas été exportées depuis la base distante.

Pour appliquer une migration, utiliser l’environnement Supabase du projet après revue et sauvegarde, par exemple `supabase db push` ou l’outil SQL de Supabase. Vérifier d’abord le projet cible, l’ordre des migrations et les dépendances des fonctions existantes. Aucune migration n’est appliquée automatiquement par ce dépôt.

Avant production : sauvegarder la base, tester les RPC avec des données de test, vérifier les droits `SECURITY DEFINER`/`EXECUTE`, puis contrôler les scénarios concurrents (réservation, expiration, webhooks Stripe, supplément et check-in). Les remboursements Stripe réels restent hors périmètre de cette documentation.

Le Cron Vercel appelle `/api/cron/maintenance` chaque heure avec `Authorization: Bearer $CRON_SECRET`. Définir `CRON_SECRET` comme variable serveur (jamais `NEXT_PUBLIC_*`). La route ne déclenche aucun `stripe.refunds.create`. Une migration n’est considérée comme appliquée qu’après vérification explicite sur le projet Supabase cible.
