import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import Stripe from 'stripe';

const require = createRequire(import.meta.url);
const clone = value => JSON.parse(JSON.stringify(value));
const user = '11111111-1111-4111-8111-111111111111';
const offer = '22222222-2222-4222-8222-222222222222';
const attempt = '33333333-3333-4333-8333-333333333333';
// Load actual route/helper code with explicit, network-free dependencies.
function load(path, dependencies, clock) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
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
    URL, Response, Request, setTimeout,
    Date: class extends Date { static now() { return clock.now; } },
    console: { error() {}, info() {} },
    process: { env: { STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret' } },
  }, { filename: path });
  return loadedModule.exports;
}
function harness() {
  const clock = { now: Date.now() };
  const state = { row: null, spots: 0, increments: 0, expires: 0, creates: 0, failBind: false, loseResponse: false, conflict: false, failBefore: false, retrieveFails: false };
  const sessions = new Map();
  const requests = new Map();
  const db = {
    from(table) {
      assert.equal(table, 'reservations');
      let patch;
      const filters = [];
      const query = {
        select() { return query; },
        update(value) { patch = clone(value); return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { filters.push(row => row[key] === value); return query; },
        single() { return query; }, maybeSingle() { return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const row = state.row;
            if (!row || !filters.every(filter => filter(row))) return { data: null, error: null };
            if (patch?.stripe_checkout_session_id && state.failBind) {
              state.failBind = false; return { data: null, error: { message: 'DB unavailable' } };
            }
            if (patch) Object.assign(row, patch);
            return { data: clone(row), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      if (name === 'create_vip_reservation') {
        // Model the already-tested Mission 11 unique-attempt SQL contract.
        if (!state.row) {
          state.row = { id: '44444444-4444-4444-8444-444444444444', reservation_code: 'TEST-CODE', user_id: user, vip_offer_id: offer, email: 'customer@example.test', quantity: 1, deposit_paid: 25, total_price: 100, remaining_amount: 75, status: 'pending_payment', created_at: new Date(clock.now).toISOString(), stripe_checkout_session_id: null, initial_checkout_params: null, initial_checkout_attempt_id: args.p_checkout_attempt_id, events: { slug: 'test-event' }, paid_at: null };
          state.spots++; state.increments++;
        }
        assert.equal(args.p_checkout_attempt_id, state.row.initial_checkout_attempt_id);
        return { data: [{ ...clone(state.row), reservation_id: state.row.id }], error: null };
      }
      assert.equal(args.p_reservation_id, state.row.id);
      if (name === 'expire_vip_reservation') {
        state.expires++;
        if (state.row.status === 'pending_payment') { state.row.status = 'payment_expired'; state.spots--; }
      } else if (name === 'confirm_vip_reservation_payment') {
        assert.equal(args.p_stripe_session_id, state.row.stripe_checkout_session_id);
        assert.equal(args.p_amount_total, 2500); assert.equal(args.p_currency, 'eur');
        if (state.row.status === 'pending_payment') { state.row.status = 'confirmed'; state.row.paid_at = new Date(clock.now).toISOString(); }
      } else throw new Error(`Unexpected RPC: ${name}`);
      return { data: { success: true }, error: null };
    },
  };
  const sdk = new Stripe('sk_test_synthetic');
  const stripe = {
    webhooks: sdk.webhooks,
    checkout: { sessions: {
      async create(params, { idempotencyKey }) {
        state.creates++;
        if (state.failBefore) throw new Error('connection failed before create');
        if (state.conflict && state.creates === 2) throw Object.assign(new Error('in progress'), { code: 'idempotency_key_in_use' });
        if (requests.has(idempotencyKey)) {
          assert.deepEqual(clone(params), requests.get(idempotencyKey).params, 'Stripe rejects changed parameters');
          return clone(requests.get(idempotencyKey).result);
        }
        assert.ok(params.expires_at >= clock.now / 1000 + 1800 - 1);
        const session = { id: 'cs_test_synthetic', status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.test/synthetic', metadata: clone(params.metadata), amount_total: 2500, currency: 'eur' };
        sessions.set(session.id, session);
        requests.set(idempotencyKey, { params: clone(params), result: clone(session) });
        if (state.loseResponse) { state.loseResponse = false; throw new Error('connection lost AFTER Stripe create'); }
        return clone(session);
      },
      async retrieve(id) {
        if (state.retrieveFails) throw new Error('retrieve unavailable');
        assert.ok(sessions.has(id)); return clone(sessions.get(id));
      },
    } },
  };
  const dependencies = { 'next/server': { NextResponse: Response }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: user } } }) } }) }, '@/lib/supabase-admin': { supabaseAdmin: db }, '@/lib/stripe': { stripe } };
  dependencies['@/lib/initial-checkout'] = load('lib/initial-checkout.ts', {}, clock);
  const route = load('app/api/reservations/route.ts', dependencies, clock);
  const webhook = load('app/api/stripe/webhook/route.ts', dependencies, clock);
  const post = (overrides = {}, origin = 'http://localhost:3000') => route.POST(new Request(`${origin}/api/reservations`, { method: 'POST', body: JSON.stringify({ eventSlug: 'test-event', vipOfferId: offer, firstname: 'Test', lastname: 'Customer', email: 'customer@example.test', phone: '0000000000', quantity: 1, checkoutAttemptId: attempt, ...overrides }) }));
  const deliver = async (type, overrides = {}) => {
    const session = clone(sessions.values().next().value);
    Object.assign(session, overrides);
    const payload = JSON.stringify({ id: 'evt_synthetic', type, data: { object: session } });
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: 'synthetic-webhook-secret' });
    return webhook.POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
  };
  return { state, clock, sessions, post, deliver };
}

test('1 sequential retry: same reservation, URL, one capacity increment', async () => {
  const h = harness(); const first = await (await h.post()).json(); h.clock.now += 5000;
  const retry = await (await h.post()).json(); assert.deepEqual(retry, first);
  assert.equal(h.state.spots, 1); assert.equal(h.state.increments, 1); assert.equal(h.state.creates, 1);
});
test('2 concurrent POSTs: stable snapshot/key, recover Stripe in-flight conflict', async () => {
  const h = harness(); h.state.conflict = true;
  const responses = await Promise.all([h.post(), h.post({}, 'http://127.0.0.1:3000')]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const bodies = await Promise.all(responses.map(r => r.json())); assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(h.sessions.size, 1); assert.equal(h.state.increments, 1); assert.equal(h.state.expires, 0);
});
test('3 lost Stripe response: persisted parameters survive clock, body and origin changes', async () => {
  const h = harness(); h.state.loseResponse = true;
  assert.equal((await h.post()).status, 503); assert.equal(h.state.row.stripe_checkout_session_id, null);
  h.clock.now += 10000;
  assert.equal((await h.post({ email: 'changed@example.test', quantity: 2 }, 'http://127.0.0.1:3000')).status, 200);
  assert.equal(h.sessions.size, 1); assert.equal(h.state.expires, 0); assert.equal(h.state.spots, 1);
});
test('4 stored open session is retrieved without creating another session', async () => {
  const h = harness(); await h.post(); const count = h.state.creates;
  assert.equal((await h.post()).status, 200); assert.equal(h.state.creates, count);
});
test('5 actual expired session explicitly releases once; never creates replacement', async () => {
  const h = harness(); await h.post(); h.sessions.values().next().value.status = 'expired';
  assert.equal((await h.post()).status, 409); assert.equal((await h.post()).status, 409);
  assert.equal(h.state.spots, 0); assert.equal(h.state.creates, 1); assert.equal(h.state.row.status, 'payment_expired');
});
test('6 complete/paid goes to read-only confirmation; does not confirm via POST', async () => {
  const h = harness(); await h.post(); Object.assign(h.sessions.values().next().value, { status: 'complete', payment_status: 'paid', url: null });
  const retry = await (await h.post()).json(); assert.match(retry.checkoutUrl, /^\/confirmation\//);
  assert.equal(h.state.row.status, 'pending_payment'); assert.equal(h.state.row.paid_at, null); assert.equal(h.state.creates, 1);
});
test('7 ambiguous Stripe errors never expire; retry remains possible', async () => {
  const h = harness(); h.state.failBefore = true; assert.equal((await h.post()).status, 503);
  assert.equal(h.state.expires, 0); assert.equal(h.state.spots, 1);
  h.state.failBefore = false; assert.equal((await h.post()).status, 200);
  h.state.retrieveFails = true; assert.equal((await h.post()).status, 503); assert.equal(h.state.expires, 0);
});
test('8 real signed completed handler after retry invokes bound RPC idempotently', async () => {
  const h = harness(); h.state.loseResponse = true; await h.post(); await h.post();
  assert.equal((await h.deliver('checkout.session.completed', { payment_status: 'paid' })).status, 200);
  const paidAt = h.state.row.paid_at; h.clock.now += 1000;
  assert.equal((await h.deliver('checkout.session.completed', { payment_status: 'paid' })).status, 200);
  assert.equal(h.state.row.status, 'confirmed'); assert.equal(h.state.row.paid_at, paidAt); assert.equal(h.state.spots, 1);
});
test('9 real signed expired handler ignores other sessions and expires matching session only', async () => {
  const h = harness(); await h.post();
  await h.deliver('checkout.session.expired', { id: 'cs_other' }); assert.equal(h.state.expires, 0);
  await h.deliver('checkout.session.expired'); await h.deliver('checkout.session.expired');
  assert.equal(h.state.row.status, 'payment_expired'); assert.equal(h.state.spots, 0);
});
test('DB failure after Stripe creation preserves session and recovers same session', async () => {
  const h = harness(); h.state.failBind = true;
  assert.equal((await h.post()).status, 503); assert.equal(h.sessions.size, 1); assert.equal(h.state.expires, 0);
  h.clock.now += 5000; assert.equal((await h.post()).status, 200); assert.equal(h.sessions.size, 1);
});
test('stale cached create response is refreshed before returning checkout URL', async () => {
  const h = harness(); h.state.loseResponse = true; await h.post();
  Object.assign(h.sessions.values().next().value, { status: 'complete', payment_status: 'paid', url: null });
  assert.match((await (await h.post()).json()).checkoutUrl, /^\/confirmation\//);
});
test('old unbound attempt cannot create again after idempotency retention window', async () => {
  const h = harness(); h.state.loseResponse = true; await h.post(); const count = h.state.creates;
  h.clock.now += 25 * 3600 * 1000; assert.equal((await h.post()).status, 409);
  assert.equal(h.state.creates, count); assert.equal(h.state.expires, 0);
});
test('completed before DB binding requests redelivery; retry binds and redelivery confirms', async () => {
  const h = harness(); h.state.failBind = true; await h.post();
  assert.equal((await h.deliver('checkout.session.completed', { payment_status: 'paid' })).status, 500);
  await h.post(); assert.equal((await h.deliver('checkout.session.completed', { payment_status: 'paid' })).status, 200);
  assert.equal(h.state.spots, 1); assert.equal(h.state.row.status, 'confirmed');
});
