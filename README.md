# K-RÉ — Shared VIP tables

> **The VIP table, without paying for the whole table.**

K-RÉ is a marketplace that lets people book **individual seats at a shared VIP table** in partner nightclubs. Customers pay only for their seats; clubs fill tables that would otherwise stay empty.

**Status:** MVP, pre-launch (Paris) · **Live:** [vip-share-lipv.vercel.app](https://vip-share-lipv.vercel.app)

---

## What it does

**Customers**
- Browse upcoming events and the VIP tables open for sharing
- Book and pay for one or more seats online (Stripe Checkout)
- Receive a QR-code pass by email

**Clubs and organisers**
- Create and manage events and VIP offers
- Scan passes at the door, with partial check-in for groups
- Follow reservations and receive their payout after each event

**Platform admin**
- Set each club's commission and onboard clubs to Stripe Connect
- Decide what happens when a table does not fill up: accept it as is, ask participants for a supplement, merge it with another table, or refund

## Engineering highlights

- **Security-first payments**
  - Stripe webhooks are verified by signature before anything is processed
  - Prices and amounts are computed on the server, never trusted from the browser
  - Idempotency keys on every checkout, refund and transfer, so a retry never charges or pays twice
  - Sensitive database functions are revoked from `anon` and `authenticated` and only callable by the server
- **Explicit state machines** for tables, reservations, merges, supplements and refunds ([docs/state-machine.md](./docs/state-machine.md))
- **Role-based access** for customers, club staff, scanners and platform admins
- **Scheduled maintenance**: an hourly Vercel Cron job, protected by a bearer secret, handles deadlines and expirations
- **Automated tests** on pricing, checkout retries, refunds, supplements, transfers and transactional emails

## Tech stack

| Layer | Tools |
|---|---|
| Front end | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Back end | Next.js route handlers, Supabase (PostgreSQL, Auth, RPC functions) |
| Payments | Stripe Checkout, Stripe Connect transfers, refunds, webhooks |
| Email | Resend |
| Check-in | QR codes (`qrcode.react`, `html5-qrcode`) |
| Hosting | Vercel (with Vercel Cron) |
| Tests | Node.js test runner |

## Project structure

```
app/            Pages and API routes (booking, checkout, admin, manager, Stripe webhook, cron)
components/     UI components
lib/            Pricing, checkout, refunds, Stripe Connect transfers, emails, access control
supabase/       SQL migrations, RPC catalogue, seeds and database tests
tests/          Automated tests for payment, refund and email flows
docs/           State machines, Stripe payment flows, staging workflow
```

## Getting started

```bash
npm install
npm run dev
```

Required environment variables (never commit their values, never put a secret in `NEXT_PUBLIC_*`):

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`

- Database migrations live in [supabase/migrations](./supabase/migrations) and are not applied automatically. See [supabase/README.md](./supabase/README.md).
- The Stripe webhook endpoint is `/api/stripe/webhook`.
- Vercel Cron calls `/api/cron/maintenance` every hour with `Authorization: Bearer $CRON_SECRET`.

## Checks and tests

```bash
npx tsc --noEmit
npm run lint
npm run build -- --webpack

npm run test:pricing
npm run test:checkout-retry
npm run test:refund
npm run test:stripe-transfers
npm run test:full-payment
```

## Documentation

- [State machines](./docs/state-machine.md)
- [Stripe payment flows](./docs/stripe-payments.md)
- [Staging workflow](./docs/staging-workflow.md)

## Author

Built by **Sheril Kuete Hanfo** — engineer (Mines Saint-Étienne), founder of K-RÉ.
