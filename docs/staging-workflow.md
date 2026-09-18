# Workflow Supabase Staging

Le dump brut Production est conservé dans `supabase/snapshots/20260915000000_production_schema_baseline.sql` et ne doit pas être exécuté comme migration. La baseline destinée à Staging est `supabase/migrations/20260915000000_production_schema_baseline.sql`; elle retire `CREATE SCHEMA public` et les directives psql `\\restrict`/`\\unrestrict`.

Ordre prévu :

```text
20260915000000_production_schema_baseline.sql
202609160001_secure_vip_offer_merge.sql
202609160002_secure_refunds.sql
202609160003_deadline_maintenance.sql
202609160004_harden_remote_offer_decisions.sql
202609160005_staging_compatibility.sql
```

La dernière migration élargit la contrainte `supplement_status` aux seules valeurs utilisées (`pending`, `payment_pending`, `paid`, `refund_pending`, `cancelled`) et ferme les droits `EXECUTE` hérités du dump `--no-privileges`. Elle laisse `is_manager(uuid)` exécutable par `authenticated`, car cette fonction est utilisée par une policy RLS.

Avant import, vérifier sur le projet vide `vip-share-staging` la présence de `auth.users`, `auth.uid()`, du schéma `extensions`, de `uuid_generate_v4()` et de `gen_random_uuid()`. Ne jamais recréer manuellement le schéma Auth.

## Données de test Staging

Le seed optionnel `supabase/seed/staging-test-data.sql` est strictement réservé au projet `vip-share-staging`. Il ne crée aucun compte Auth : les sept comptes de test doivent d'abord être créés dans Supabase Auth (ou via l'API Admin du projet Staging) avec les adresses `@example.test` indiquées dans le fichier. Le seed vérifie leur présence et utilise leurs UUID réels pour respecter les clés étrangères.

Il n'est pas chargé par défaut par `supabase/config.toml`. Après vérification du projet cible et des comptes, l'exécution manuelle prévue est :

```sh
psql --set=STAGING_ONLY=1 \
  --set=STAGING_PROJECT_REF=okplunqjwklzpfacuskd "$STAGING_DATABASE_URL" \
  -f supabase/seed/staging-test-data.sql
```

Le seed vérifie le project ref Staging attendu et refuse un second lancement si
une fixture existe déjà. Cette vérification porte sur la valeur psql fournie à
la commande ; le hostname de `$STAGING_DATABASE_URL` doit donc aussi être
contrôlé manuellement avant exécution. Le seed contient uniquement un club, un
événement, douze tables et treize réservations de test. Il ne contient ni mot
de passe, ni secret Stripe, ni identifiant de paiement réel. Les paiements
doivent ensuite être créés par l'application avec Stripe Test Mode.
