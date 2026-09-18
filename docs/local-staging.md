# Environnement local Staging

Les exports d'un terminal disparaissent à sa fermeture ou au redémarrage du Mac.
Next.js ne charge pas automatiquement `.env.staging.local` : les commandes
ci-dessous le lisent explicitement avant de démarrer un processus enfant.

Depuis la racine du dépôt, avec Node.js 20.12+ :

```sh
npm run check:staging
npm run dev:staging
```

Pour compiler avec les mêmes garde-fous et les variables Staging injectées :

```sh
npm run build:staging
```

Cette commande lance `npm run build -- --webpack`. Webpack évite le problème
local d'ouverture de port rencontré avec Turbopack. `NODE_ENV=production` désigne
ici le mode de compilation Next.js : les URL et les clés restent celles de
Staging, prioritaires sur les fichiers env chargés par Next.js. Aucun fichier
Production n'est modifié. `npm run build` seul ne charge pas explicitement
`.env.staging.local` ; utiliser `build:staging` après chaque redémarrage.

Le lancement exige les sept variables : `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STAGING_DATABASE_URL`.
Les deux URL Supabase doivent cibler Staging et la clé Stripe commencer par
`sk_test_`. Aucun secret ne doit être stocké ailleurs que dans `.env.staging.local`,
ignoré par Git. Remettre la chaîne PostgreSQL Staging existante si elle manque,
ainsi que le secret webhook du contexte Stripe test utilisé localement.

Pour obtenir un terminal Staging :

```sh
npm run shell:staging
```

Dans ce shell, la variable est exportée pour les outils enfants :

```sh
psql "$STAGING_DATABASE_URL"
```

Cette dernière commande ouvre une connexion uniquement lorsque vous l'exécutez.
`exit` quitte le shell Staging ; le terminal parent reste inchangé.
Le shell utilise `/bin/zsh -f -i` sans les fichiers de configuration utilisateur.
Les historiques du shell et de psql sont désactivés pour cette session.

Le fichier est lu comme des données dotenv : aucune commande shell ni référence
`$VARIABLE` n'est évaluée. Utiliser des valeurs complètes et littérales, entre
guillemets si elles contiennent `#`. Les identifiants hérités du terminal ne sont
pas repris ; les sept variables validées ont priorité sur les fichiers env de
Next.js. `CRON_SECRET`, facultatif, est lu depuis le même fichier ou neutralisé.
Ne pas utiliser `NODE_ENV=staging` ; Next.js reste en mode `development`.

La chaîne PostgreSQL est contrôlée sans connexion : hôte direct du projet
Staging, ou pooler Supabase avec l'utilisateur `postgres.<référence Staging>`.
Seuls les paramètres URI `sslmode`, `connect_timeout`, `application_name` et
`channel_binding` sont acceptés afin d'éviter une redirection via les paramètres
libpq. Les clés Supabase opaques ne peuvent pas être rattachées à un projet par
ce seul contrôle local : utiliser exclusivement les clés Staging.

`npm run check:staging` ne démarre rien et n'affiche aucune valeur.
Le lanceur n'exécute aucune migration, déploiement ou opération sur les données.
