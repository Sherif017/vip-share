# VIP Share

Application Next.js de réservation de tables VIP avec Supabase, Stripe Checkout et rôles administratifs.

## Installation et vérifications

```bash
npm install
npm run dev
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

Variables nécessaires : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et `CRON_SECRET`. Ne jamais committer leurs valeurs ni placer un secret dans `NEXT_PUBLIC_*`.

Les migrations additives sont dans [supabase/migrations](./supabase/migrations) et ne sont pas appliquées automatiquement. Voir [supabase/README.md](./supabase/README.md).

Le webhook Stripe utilise `/api/stripe/webhook`. Le Cron Vercel appelle `/api/cron/maintenance` chaque heure avec `Authorization: Bearer $CRON_SECRET`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
