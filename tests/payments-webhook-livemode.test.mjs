import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import Stripe from 'stripe';

const require = createRequire(import.meta.url);
const SECRET = 'synthetic-webhook-secret';
const sdk = new Stripe('sk_test_synthetic');

// Charge la vraie route avec des dependances sans reseau.
// Toute lecture/ecriture Supabase est enregistree dans `calls`.
function harness(env) {
  const calls = [];
  const record = name => () => {
    calls.push(name);
    return chain;
  };
  const chain = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return resolve => resolve({ data: null, error: null });
      return record(String(prop));
    },
  });
  const supabaseAdmin = { from: record('from'), rpc: record('rpc') };
  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase-admin': { supabaseAdmin },
    '@/lib/stripe': { stripe: sdk },
    '@/lib/email/reservation-confirmed': { dispatchReservationConfirmedEmail: async () => { calls.push('email'); } },
    '@/lib/email/table-confirmed': { dispatchTableConfirmedEmails: async () => { calls.push('email'); } },
    '@/lib/stripe-connect': { applyStripeAccountSnapshot: async () => { calls.push('snapshot'); } },
  };
  const source = ts.transpileModule(readFileSync('app/api/stripe/webhook/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(source, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'stripe') return require(name);
      throw new Error(`Unexpected dependency: ${name}`);
    },
    URL, Response, Request, setTimeout, Date,
    console: { error() {}, info() {}, warn() {} },
    process: { env },
  });
  const deliver = async (event, secret = SECRET) => {
    const payload = JSON.stringify({ id: 'evt_synthetic', data: { object: { id: 'cs_synthetic', metadata: { reservation_id: '44444444-4444-4444-8444-444444444444' }, payment_status: 'paid' } }, type: 'checkout.session.completed', ...event });
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret });
    const response = await loadedModule.exports.POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', body: payload, headers: { 'stripe-signature': signature },
    }));
    return { status: response.status, body: await response.json() };
  };
  return { deliver, calls };
}

const LIVE = { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: 'sk_live_synthetic' };
const TEST = { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: 'sk_test_synthetic' };

test('1. serveur LIVE + evenement TEST : ignore, aucun traitement metier', async () => {
  const h = harness(LIVE);
  const r = await h.deliver({ livemode: false });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true, ignored: true });
  assert.deepEqual(h.calls, []);
});

test('2. serveur TEST + evenement LIVE : ignore, aucun traitement metier', async () => {
  const h = harness(TEST);
  const r = await h.deliver({ livemode: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true, ignored: true });
  assert.deepEqual(h.calls, []);
});

test('3. evenement sans livemode explicite : ignore', async () => {
  const h = harness(LIVE);
  const r = await h.deliver({});
  assert.deepEqual(r.body, { received: true, ignored: true });
  assert.deepEqual(h.calls, []);
});

test('4. serveur LIVE + evenement LIVE : traitement metier atteint', async () => {
  const h = harness(LIVE);
  await h.deliver({ livemode: true });
  assert.ok(h.calls.includes('from') || h.calls.includes('rpc'));
});

test('5. serveur TEST + evenement TEST : traitement metier atteint', async () => {
  const h = harness(TEST);
  await h.deliver({ livemode: false });
  assert.ok(h.calls.includes('from') || h.calls.includes('rpc'));
});

test('6. cle Stripe de mode inconnu ou absente : 500 (rejeu Stripe), aucun traitement', async () => {
  for (const key of [undefined, '', ' sk_live_x', '"sk_live_x"', 'pk_live_x']) {
    const env = { STRIPE_WEBHOOK_SECRET: SECRET };
    if (key !== undefined) env.STRIPE_SECRET_KEY = key;
    const h = harness(env);
    const r = await h.deliver({ livemode: true });
    assert.equal(r.status, 500, String(key));
    assert.deepEqual(h.calls, []);
  }
});

test('7. mauvaise signature : 400 avant le controle de mode', async () => {
  const h = harness(LIVE);
  const r = await h.deliver({ livemode: true }, 'wrong-secret');
  assert.equal(r.status, 400);
  assert.deepEqual(h.calls, []);
});

test('8. evenement synthetique de validation production : 200 sans aucun effet', async () => {
  const h = harness(LIVE);
  const r = await h.deliver({
    livemode: true,
    data: { object: { id: 'cs_synthetic', metadata: {}, payment_status: 'unpaid' } },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true });
  assert.deepEqual(h.calls, []);
});
