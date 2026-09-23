import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import Stripe from 'stripe';

const require = createRequire(import.meta.url);
const clone = value => JSON.parse(JSON.stringify(value));

const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OFFER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_EMAIL = 'customer@example.test';

function freshReservationRow() {
  return {
    id: RESERVATION_ID,
    user_id: USER_ID,
    vip_offer_id: OFFER_ID,
    firstname: 'Camille',
    email: CUSTOMER_EMAIL,
    quantity: 2,
    reservation_code: 'VIP-TESTCODE',
    total_price: 100,
    deposit_paid: 30,
    remaining_amount: 70,
    status: 'pending_payment',
    stripe_checkout_session_id: 'cs_test_synthetic',
    paid_at: null,
    vip_offers: { table_number: 'K-RÉ 1' },
    events: {
      name: 'Shadow Club Night',
      event_date: '2026-09-19',
      start_time: '23:30',
      clubs: { name: 'Shadow Club', city: 'Paris' },
    },
  };
}

// Load actual route/lib TypeScript source with explicit, network-free
// dependencies, mirroring the pattern already used by
// tests/checkout-retry.test.mjs so this suite exercises the real code,
// not a re-implementation of it.
function load(path, dependencies, clock, logs) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(source, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'stripe') return require(name);
      if (name === 'server-only') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
    URL, Response, Request, setTimeout,
    Date: class extends Date { static now() { return clock.now; } },
    console: {
      error(...args) { logs.push(args); },
      info() {},
    },
    process: { env: { STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret' } },
  }, { filename: path });
  return loadedModule.exports;
}

// Faithful in-memory model of the SQL claim: 'pending' and 'failed' rows
// are claimable, 'sent' never is, and a 'processing' row is only
// reclaimable once it has been stale for longer than the stale window —
// exactly the semantics of claim_reservation_email() in
// supabase/migrations/202609230001_reservation_emails.sql. Because this
// mock has no internal `await` before mutating state, two calls issued
// via Promise.all still execute their critical section in call order
// (the first completes synchronously before the second starts), which is
// enough to exercise the "only one caller wins the claim" contract.
function makeDb(state, clock) {
  const STALE_AFTER_MS = 5 * 60 * 1000;

  return {
    from(table) {
      if (table === 'reservations') {
        const filters = [];
        const query = {
          select() { return query; },
          eq(key, value) { filters.push(row => row[key] === value); return query; },
          maybeSingle() { return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              const row = state.reservationRow;
              if (!row || !filters.every(f => f(row))) return { data: null, error: null };
              return { data: clone(row), error: null };
            }).then(resolve, reject);
          },
        };
        return query;
      }

      if (table === 'reservation_emails') {
        let patch;
        const filters = [];
        const query = {
          update(value) { patch = clone(value); return query; },
          eq(key, value) { filters.push(row => row[key] === value); return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              const row = state.emailRow;
              if (!row || !filters.every(f => f(row))) return { error: { message: 'row not found' } };
              if (patch) Object.assign(row, patch);
              return { error: null };
            }).then(resolve, reject);
          },
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },

    async rpc(name, args) {
      if (name === 'confirm_vip_reservation_payment') {
        assert.equal(args.p_reservation_id, state.reservationRow.id);
        if (state.reservationRow.status === 'pending_payment') {
          state.reservationRow.status = 'confirmed';
          state.reservationRow.paid_at = new Date(clock.now).toISOString();
          return {
            data: { success: true, already_confirmed: false, reservation_id: state.reservationRow.id, status: 'confirmed' },
            error: null,
          };
        }
        return {
          data: { success: true, already_confirmed: true, reservation_id: state.reservationRow.id, status: state.reservationRow.status },
          error: null,
        };
      }

      if (name === 'claim_reservation_email') {
        if (!state.emailRow) {
          state.emailRow = {
            id: 'email-row-1',
            reservation_id: args.p_reservation_id,
            email_type: args.p_email_type,
            idempotency_key: args.p_idempotency_key,
            status: 'pending',
            attempts: 0,
            last_error: null,
            updated_at: clock.now,
          };
        }

        const row = state.emailRow;
        const claimable =
          row.status === 'pending' ||
          row.status === 'failed' ||
          (row.status === 'processing' && (clock.now - row.updated_at) > STALE_AFTER_MS);

        if (claimable) {
          row.status = 'processing';
          row.attempts += 1;
          row.updated_at = clock.now;
          return {
            data: [{ claimed: true, row_id: row.id, attempts: row.attempts, status: row.status, idempotency_key: row.idempotency_key }],
            error: null,
          };
        }

        return {
          data: [{ claimed: false, row_id: row.id, attempts: row.attempts, status: row.status, idempotency_key: row.idempotency_key }],
          error: null,
        };
      }

      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
}

function makeResend(state) {
  return {
    emails: {
      async send(payload, options) {
        state.resendCalls.push({ payload: clone(payload), idempotencyKey: options?.idempotencyKey });
        if (state.resendShouldFail) {
          return { data: null, error: { message: state.resendFailureMessage || 'Resend indisponible' } };
        }
        return { data: { id: `msg_${state.resendCalls.length}` }, error: null };
      },
    },
  };
}

function harness(options = {}) {
  const clock = { now: Date.now() };
  const logs = [];
  const state = {
    reservationRow: freshReservationRow(),
    emailRow: null,
    resendCalls: [],
    resendShouldFail: false,
    resendFailureMessage: null,
  };

  const db = makeDb(state, clock);
  const resendConfigured = options.resendConfigured !== false;
  const resendClient = resendConfigured ? makeResend(state) : null;

  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/stripe': { stripe: new Stripe('sk_test_synthetic') },
    '@/lib/email/resend': {
      resend: resendClient,
      EMAIL_FROM: 'K-RÉ <reservations@k-re.org>',
      EMAIL_REPLY_TO: 'support@k-re.org',
    },
  };

  const emailModule = load('lib/email/reservation-confirmed.ts', dependencies, clock, logs);
  dependencies['@/lib/email/reservation-confirmed'] = emailModule;

  const webhook = load('app/api/stripe/webhook/route.ts', dependencies, clock, logs);

  const sdk = new Stripe('sk_test_synthetic');

  const deliver = async (overrides = {}) => {
    const session = {
      id: 'cs_test_synthetic',
      payment_status: 'paid',
      currency: 'eur',
      amount_total: 3000,
      metadata: {
        reservation_id: state.reservationRow.id,
        payment_type: 'initial_deposit',
        user_id: state.reservationRow.user_id,
        vip_offer_id: state.reservationRow.vip_offer_id,
      },
      ...overrides,
    };
    const payload = JSON.stringify({ id: 'evt_synthetic', type: 'checkout.session.completed', data: { object: session } });
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: 'synthetic-webhook-secret' });
    return webhook.POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', body: payload, headers: { 'stripe-signature': signature },
    }));
  };

  return { state, clock, logs, deliver, emailModule, db };
}

test('1. premier webhook confirmé -> un seul email envoyé', async () => {
  const h = harness();
  const res = await h.deliver();
  assert.equal(res.status, 200);
  assert.equal(h.state.resendCalls.length, 1);
  assert.equal(h.state.resendCalls[0].payload.to, CUSTOMER_EMAIL);
  assert.equal(h.state.resendCalls[0].payload.from, 'K-RÉ <reservations@k-re.org>');
  assert.equal(h.state.resendCalls[0].payload.replyTo, 'support@k-re.org');
  assert.equal(h.state.emailRow.status, 'sent');
  assert.equal(h.state.reservationRow.status, 'confirmed');
});

test('2. replay du webhook après sent -> aucun nouvel email', async () => {
  const h = harness();
  await h.deliver();
  assert.equal(h.state.resendCalls.length, 1);
  const res2 = await h.deliver();
  assert.equal(res2.status, 200);
  assert.equal(h.state.resendCalls.length, 1);
  assert.equal(h.state.emailRow.status, 'sent');
});

test('3. deux dispatch concurrents -> un seul claim, un seul envoi Resend', async () => {
  const h = harness();
  h.state.reservationRow.status = 'confirmed';
  await Promise.all([
    h.emailModule.dispatchReservationConfirmedEmail(RESERVATION_ID),
    h.emailModule.dispatchReservationConfirmedEmail(RESERVATION_ID),
  ]);
  assert.equal(h.state.resendCalls.length, 1);
  assert.equal(h.state.emailRow.status, 'sent');
  assert.equal(h.state.emailRow.attempts, 1);
});

test('4. Resend indisponible -> réservation reste confirmed, email reste retryable', async () => {
  const h = harness();
  h.state.resendShouldFail = true;
  h.state.resendFailureMessage = 'Resend indisponible (503)';
  const res = await h.deliver();
  assert.equal(res.status, 200); // Stripe voit toujours un succès.
  assert.equal(h.state.reservationRow.status, 'confirmed'); // Jamais annulé.
  assert.equal(h.state.emailRow.status, 'failed');
  assert.equal(h.state.resendCalls.length, 1);
});

test('5. retry après failed -> email envoyé au second passage', async () => {
  const h = harness();
  h.state.resendShouldFail = true;
  await h.deliver();
  assert.equal(h.state.emailRow.status, 'failed');
  h.state.resendShouldFail = false;
  const res2 = await h.deliver(); // Simule un replay Stripe ou un renvoi manuel.
  assert.equal(res2.status, 200);
  assert.equal(h.state.emailRow.status, 'sent');
  assert.equal(h.state.resendCalls.length, 2);
});

test('6. RESEND_API_KEY absente -> le webhook Stripe n\'est jamais cassé', async () => {
  const h = harness({ resendConfigured: false });
  const res = await h.deliver();
  assert.equal(res.status, 200);
  assert.equal(h.state.reservationRow.status, 'confirmed');
  assert.equal(h.state.emailRow.status, 'failed');
  assert.match(h.state.emailRow.last_error, /RESEND_API_KEY/);
});

test('7. même reservation_id -> même idempotency key sur toutes les tentatives', async () => {
  const h = harness();
  h.state.resendShouldFail = true;
  await h.deliver();
  h.state.resendShouldFail = false;
  await h.deliver();
  assert.equal(h.state.resendCalls.length, 2);
  const expectedKey = `reservation-confirmed/${RESERVATION_ID}`;
  for (const call of h.state.resendCalls) {
    assert.equal(call.idempotencyKey, expectedKey);
  }
});

test('8. aucune donnée sensible dans les logs', async () => {
  const h = harness();
  h.state.resendShouldFail = true;
  await h.deliver();
  const serialized = JSON.stringify(h.logs);
  assert.ok(!serialized.includes(CUSTOMER_EMAIL), "l'email du client ne doit jamais apparaître dans les logs");
  assert.ok(!serialized.includes('sk_test_'), 'aucune clé secrète Stripe ne doit apparaître dans les logs');
  assert.ok(!serialized.includes('re_'), 'aucune clé Resend ne doit apparaître dans les logs');
});

test('bonus. une ligne "sent" n\'est jamais reprise, même longtemps après', async () => {
  const h = harness();
  await h.deliver();
  assert.equal(h.state.emailRow.status, 'sent');
  h.clock.now += 999 * 60 * 1000;
  await h.deliver();
  assert.equal(h.state.resendCalls.length, 1);
});

test('bonus. un claim "processing" abandonné plus de 5 minutes redevient réclamable', async () => {
  const h = harness();
  const key = `reservation-confirmed/${RESERVATION_ID}`;
  const args = { p_reservation_id: RESERVATION_ID, p_email_type: 'reservation_confirmed', p_idempotency_key: key };

  const first = await h.db.rpc('claim_reservation_email', args);
  assert.equal(first.data[0].claimed, true);

  const tooSoon = await h.db.rpc('claim_reservation_email', args);
  assert.equal(tooSoon.data[0].claimed, false);

  h.clock.now += 6 * 60 * 1000; // 6 minutes plus tard : tentative considérée abandonnée.
  const reclaimed = await h.db.rpc('claim_reservation_email', args);
  assert.equal(reclaimed.data[0].claimed, true);
});
