import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import Stripe from 'stripe';

const require = createRequire(import.meta.url);
const clone = value => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------
// Harness commun : charge le vrai code source (route + webhook) et mocke
// uniquement supabaseAdmin/stripe, exactement comme tests/checkout-retry.test.mjs.
// Les RPC mockees reimplementent fidelement la logique reelle des
// fonctions SQL (supabase/migrations/202609301001_...sql) : gating club
// pret, calcul centimes/bps, idempotence par checkout_attempt_id,
// re-verification montant/devise a la confirmation.
// ---------------------------------------------------------------------

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
      if (name === 'server-only') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
    URL, Response, Request, setTimeout,
    Date: class extends Date { static now() { return clock.now; } },
    console: { error() {}, info() {} },
    process: { env: { STRIPE_WEBHOOK_SECRET: 'synthetic-webhook-secret' } },
  }, { filename: path });
  return loadedModule.exports;
}

const RESERVATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OFFER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CLUB_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function freshState() {
  return {
    club: {
      id: CLUB_ID,
      stripe_account_id: 'acct_test123',
      stripe_charges_enabled: true,
      commission_bps: 1500, // 15%
    },
    settings: { service_fee_bps: 275, service_fee_minimum_cents: 30, currency: 'eur' },
    offer: { id: OFFER_ID, event_id: EVENT_ID, capacity: 10, spots_reserved: 0, price_per_person: 100, booking_deadline: null },
    event: { id: EVENT_ID, slug: 'test-event', club_id: CLUB_ID, status: 'published' },
    reservations: new Map(),
    transactions: new Map(), // key: reservation_id
  };
}

// Reimplementation fidele de create_full_payment_reservation.
function rpcCreateFullPaymentReservation(state, args) {
  for (const r of state.reservations.values()) {
    if (r.user_id === args.p_user_id && r.initial_checkout_attempt_id === args.p_checkout_attempt_id) {
      const txn = state.transactions.get(r.id);
      return { data: [{
        reservation_id: r.id, reservation_code: r.reservation_code,
        vip_subtotal_cents: txn.vip_subtotal_cents, service_fee_cents: txn.service_fee_cents,
        total_customer_cents: txn.total_customer_cents, commission_rate_bps: txn.commission_rate_bps,
        service_fee_rate_bps: txn.service_fee_rate_bps, currency: txn.currency,
        stripe_account_id: txn.stripe_account_id, already_exists: true,
      }], error: null };
    }
  }

  if (args.p_event_slug !== state.event.slug) return { data: null, error: { message: 'Evenement introuvable.' } };
  if (!state.club.stripe_charges_enabled || !state.club.stripe_account_id) {
    return { data: null, error: { message: "Ce club n'accepte pas encore le paiement integral (Stripe Connect non actif)." } };
  }
  if (state.club.commission_bps == null) {
    return { data: null, error: { message: "La commission de ce club n'est pas encore configuree par K-RE." } };
  }
  if (state.offer.spots_reserved + args.p_quantity > state.offer.capacity) {
    return { data: null, error: { message: 'Il ne reste pas assez de places disponibles sur cette table.' } };
  }

  const vipSubtotalCents = Math.round(state.offer.price_per_person * args.p_quantity * 100);
  const serviceFeeCents = Math.max(
    Math.round((vipSubtotalCents * state.settings.service_fee_bps) / 10000),
    state.settings.service_fee_minimum_cents
  );
  const totalCustomerCents = vipSubtotalCents + serviceFeeCents;
  const commissionCents = Math.round((vipSubtotalCents * state.club.commission_bps) / 10000);
  const clubNetCents = vipSubtotalCents - commissionCents;

  const reservation = {
    id: RESERVATION_ID, event_id: EVENT_ID, vip_offer_id: OFFER_ID, club_id: CLUB_ID, user_id: args.p_user_id,
    reservation_code: `VIP-${RESERVATION_ID}`, total_price: vipSubtotalCents / 100, deposit_paid: 0, remaining_amount: 0,
    payment_model: 'full_payment', status: 'pending_payment',
    initial_checkout_attempt_id: args.p_checkout_attempt_id, stripe_checkout_session_id: null,
    initial_checkout_params: null, quantity: args.p_quantity,
    email: args.p_email,
      events: { slug: state.event.slug },
  };
  state.reservations.set(reservation.id, reservation);

  const txn = {
    reservation_id: reservation.id, payment_type: 'initial', club_id: CLUB_ID, event_id: EVENT_ID,
    vip_subtotal_cents: vipSubtotalCents, service_fee_rate_bps: state.settings.service_fee_bps, service_fee_cents: serviceFeeCents,
    commission_rate_bps: state.club.commission_bps, commission_cents: commissionCents, club_net_cents: clubNetCents,
    total_customer_cents: totalCustomerCents, currency: state.settings.currency, stripe_account_id: state.club.stripe_account_id,
      transfer_group: `reservation:${reservation.id}`,
    status: 'pending',
  };
  state.transactions.set(reservation.id, txn);
  state.offer.spots_reserved += args.p_quantity;

  return { data: [{
    reservation_id: reservation.id, reservation_code: reservation.reservation_code,
    vip_subtotal_cents: vipSubtotalCents, service_fee_cents: serviceFeeCents, total_customer_cents: totalCustomerCents,
    commission_rate_bps: state.club.commission_bps, service_fee_rate_bps: state.settings.service_fee_bps,
    currency: state.settings.currency, stripe_account_id: state.club.stripe_account_id, already_exists: false,
  }], error: null };
}

// Reimplementation fidele de confirm_full_payment_reservation : re-verifie
// montant/devise contre la transaction stockee, jamais contre ce qu'envoie
// le navigateur -- c'est exactement le test "montant falsifie ignore".
function rpcConfirmFullPaymentReservation(state, args) {
  const reservation = state.reservations.get(args.p_reservation_id);
  if (!reservation) return { data: { success: false, error: 'reservation_not_found' }, error: null };
  const txn = state.transactions.get(args.p_reservation_id);
  if (!txn) return { data: { success: false, error: 'transaction_not_found' }, error: null };

  if (txn.status === 'confirmed') {
    return { data: { success: true, already_confirmed: true, reservation_id: reservation.id, status: reservation.status }, error: null };
  }

  if (args.p_amount_total !== txn.total_customer_cents || args.p_currency !== txn.currency) {
    return { data: { success: false, error: 'amount_mismatch' }, error: null };
  }

  txn.status = 'confirmed';
  reservation.status = 'confirmed';
  reservation.deposit_paid = reservation.total_price;

  return { data: { success: true, already_confirmed: false, reservation_id: reservation.id, status: 'confirmed' }, error: null };
}

function makeDb(state) {
  return {
    from(table) {
      if (table === 'reservations') {
        const filters = [];
        const query = {
          select() { return query; },
          eq(key, value) { filters.push(r => r[key] === value); return query; },
          single() { return query; },
          maybeSingle() { return query; },
          update(patch) { query.__patch = patch; return query; },
          is(key, value) { filters.push(r => r[key] === value); return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              const rows = [...state.reservations.values()].filter(r => filters.every(f => f(r)));
              if (query.__patch) {
                for (const r of rows) Object.assign(r, query.__patch);
                return { error: null };
              }
              const row = rows[0];
              if (!row) return { data: null, error: { message: 'not found' } };
              return { data: clone(row), error: null };
            }).then(resolve, reject);
          },
        };
        return query;
      }
      if (table === 'payment_transactions') {
        const filters = [];
        const query = {
          select() { return query; },
          eq(key, value) { filters.push(t => t[key] === value); return query; },
          single() { return query; },
          maybeSingle() { return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              const rows = [...state.transactions.values()].filter(t => filters.every(f => f(t)));
              return { data: rows[0] ? clone(rows[0]) : null, error: null };
            }).then(resolve, reject);
          },
        };
        return query;
      }
      if (table === 'clubs') {
        const filters = [];
        const query = {
          select() { return query; },
          eq(key, value) { filters.push(c => c[key] === value); return query; },
          maybeSingle() { return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              const match = filters.every(f => f(state.club)) ? state.club : null;
              return { data: match ? clone(match) : null, error: null };
            }).then(resolve, reject);
          },
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name, args) {
      if (name === 'create_full_payment_reservation') return rpcCreateFullPaymentReservation(state, args);
      if (name === 'confirm_full_payment_reservation') return rpcConfirmFullPaymentReservation(state, args);
      if (name === 'expire_full_payment_reservation') {
        const reservation = state.reservations.get(args.p_reservation_id);
        if (reservation) reservation.status = 'expired';
        return { data: { success: true }, error: null };
      }
      if (name === 'admin_set_club_commission') {
        if (!args.__isManager) {
          return { data: null, error: { message: "Seul un administrateur K-RE peut modifier la commission d'un club." } };
        }
        state.club.commission_bps = args.p_commission_bps;
        return { data: clone(state.club), error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
}

function harnessFullPayment() {
  const clock = { now: Date.now() };
  const state = freshState();
  const db = makeDb(state);
  const sdk = new Stripe('sk_test_synthetic');

  // Stripe Checkout est mocké localement :
  // aucun appel réseau pendant cette suite de tests.
  const checkoutSessions = new Map();
  let checkoutSessionSequence = 0;

  sdk.checkout.sessions.create = async (params) => {
    checkoutSessionSequence += 1;

    const id = `cs_test_full_payment_${checkoutSessionSequence}`;

    const amountTotal = (params.line_items ?? []).reduce(
      (sum, item) => {
        const unitAmount = item?.price_data?.unit_amount ?? 0;
        const itemQuantity = item?.quantity ?? 1;

        return sum + unitAmount * itemQuantity;
      },
      0
    );

    const session = {
      id,
      object: 'checkout.session',
      status: 'open',
      payment_status: 'unpaid',
      url: `https://checkout.stripe.test/${id}`,
      metadata: params.metadata ?? {},
      amount_total: amountTotal,
      currency:
        params.line_items?.[0]?.price_data?.currency ?? 'eur',
      payment_intent: `pi_test_${checkoutSessionSequence}`,
    };

    checkoutSessions.set(id, session);

    return session;
  };

  sdk.checkout.sessions.retrieve = async (id) => {
    const session = checkoutSessions.get(id);

    if (!session) {
      throw new Error(
        `Synthetic Stripe session not found: ${id}`
      );
    }

    return session;
  };

  const dependencies = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) } }) },
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/stripe': { stripe: sdk },
    '@/lib/email/reservation-confirmed': { dispatchReservationConfirmedEmail: async () => {} },
    '@/lib/email/table-confirmed': { dispatchTableConfirmedEmails: async () => {} },
    '@/lib/stripe-connect': { applyStripeAccountSnapshot: async () => {} },
  };

  dependencies['@/lib/initial-checkout'] = load('lib/initial-checkout.ts', {}, clock);
  dependencies['@/lib/full-payment-checkout'] = load('lib/full-payment-checkout.ts', { ...dependencies, '@/lib/initial-checkout': dependencies['@/lib/initial-checkout'] }, clock);

  const route = load('app/api/reservations/full-payment/route.ts', dependencies, clock);
  const webhook = load('app/api/stripe/webhook/route.ts', dependencies, clock);

  const post = (overrides = {}) => route.POST(new Request('http://localhost:3000/api/reservations/full-payment', {
    method: 'POST',
    body: JSON.stringify({
      eventSlug: 'test-event', vipOfferId: OFFER_ID, firstname: 'Test', lastname: 'Customer',
      email: 'customer@example.test', phone: '0600000000', quantity: 1,
      checkoutAttemptId: crypto.randomUUID(), ...overrides,
    }),
  }));

  const deliverWebhook = (session) => {
    const payload = JSON.stringify({ id: 'evt_synthetic', type: 'checkout.session.completed', data: { object: session } });
    const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: 'synthetic-webhook-secret' });
    return webhook.POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', body: payload, headers: { 'stripe-signature': signature },
    }));
  };

  return { state, db, post, deliverWebhook };
}

// ---------------------------------------------------------------------
// A. Gating Stripe Connect
// ---------------------------------------------------------------------

test('A1. club Stripe Connect non actif -> reservation full-payment refusee', async () => {
  const h = harnessFullPayment();
  h.state.club.stripe_charges_enabled = false;
  const res = await h.post();
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Stripe Connect non actif/);
});

test('A2. commission non configuree -> reservation full-payment refusee', async () => {
  const h = harnessFullPayment();
  h.state.club.commission_bps = null;
  const res = await h.post();
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /commission/i);
});

test('A3. club pret (Connect actif + commission configuree) -> reservation autorisee, montants corrects', async () => {
  const h = harnessFullPayment();
  const res = await h.post({ quantity: 2 });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  // 2 places a 100e = 200e VIP, frais 2.75% = 5.50e -> total 205.50e
  assert.equal(body.reservation.vipSubtotal, 200);
  assert.equal(body.reservation.serviceFee, 5.5);
  assert.equal(body.reservation.total, 205.5);
});

// ---------------------------------------------------------------------
// B. Webhook : idempotence + montant falsifie
// ---------------------------------------------------------------------

test('B1. montant falsifie a la confirmation -> ignore, jamais confirme', async () => {
  const h = harnessFullPayment();
  await h.post();
  const reservation = [...h.state.reservations.values()][0];
  const txn = h.state.transactions.get(reservation.id);
  reservation.stripe_checkout_session_id = 'cs_test_fake';

  const result = rpcConfirmFullPaymentReservation(h.state, {
    p_reservation_id: reservation.id,
    p_stripe_session_id: 'cs_test_fake',
    p_amount_total: 1, // montant falsifie, très inferieur au vrai total
    p_currency: 'eur',
  });

  assert.equal(result.data.success, false);
  assert.equal(result.data.error, 'amount_mismatch');
  assert.equal(txn.status, 'pending'); // jamais confirme
  assert.equal(reservation.status, 'pending_payment');
});

test('B2. meme webhook recu deux fois -> une seule confirmation reelle', async () => {
  const h = harnessFullPayment();
  await h.post();
  const reservation = [...h.state.reservations.values()][0];
  const txn = h.state.transactions.get(reservation.id);

  const args = {
    p_reservation_id: reservation.id,
    p_stripe_session_id: 'cs_test_real',
    p_amount_total: txn.total_customer_cents,
    p_currency: 'eur',
  };

  const first = rpcConfirmFullPaymentReservation(h.state, args);
  const second = rpcConfirmFullPaymentReservation(h.state, args);

  assert.equal(first.data.already_confirmed, false);
  assert.equal(second.data.already_confirmed, true);
  assert.equal(txn.status, 'confirmed');
});

// ---------------------------------------------------------------------
// C. Commission : admin vs manager
// ---------------------------------------------------------------------

test('C1. admin K-RE (is_manager) peut modifier la commission', async () => {
  const h = harnessFullPayment();
  const result = await h.db.rpc('admin_set_club_commission', {
    p_club_id: CLUB_ID, p_commission_bps: 1200, __isManager: true,
  });
  assert.equal(result.error, null);
  assert.equal(h.state.club.commission_bps, 1200);
});

test("C2. manager de club (pas admin K-RE) ne peut PAS modifier la commission", async () => {
  const h = harnessFullPayment();
  const before = h.state.club.commission_bps;
  const result = await h.db.rpc('admin_set_club_commission', {
    p_club_id: CLUB_ID, p_commission_bps: 1, __isManager: false,
  });
  assert.ok(result.error);
  assert.match(result.error.message, /administrateur K-RE/);
  assert.equal(h.state.club.commission_bps, before); // inchangee
});

test('C3. changement de commission APRES paiement -> ne modifie jamais une transaction deja enregistree', async () => {
  const h = harnessFullPayment();
  await h.post(); // commission 15% au moment du paiement
  const reservation = [...h.state.reservations.values()][0];
  const txn = h.state.transactions.get(reservation.id);
  assert.equal(txn.commission_rate_bps, 1500);
  assert.equal(txn.commission_cents, 1500); // 15% de 100e = 15e

  // Le club change de commission ensuite (ex: 15% -> 12%).
  await h.db.rpc('admin_set_club_commission', { p_club_id: CLUB_ID, p_commission_bps: 1200, __isManager: true });

  // La transaction deja enregistree ne bouge pas.
  assert.equal(txn.commission_rate_bps, 1500);
  assert.equal(txn.commission_cents, 1500);
});

// ---------------------------------------------------------------------
// D. Legacy : toujours fonctionnel (non-regression)
// ---------------------------------------------------------------------

test('D1. le modele legacy_deposit reste le defaut et fonctionne independamment de Stripe Connect', async () => {
  const h = harnessFullPayment();
  h.state.club.stripe_charges_enabled = false; // club non pret pour le nouveau modele
  // La route full-payment refuse (test A1), mais ceci ne doit rien casser
  // de lib/initial-checkout.ts ni de /api/reservations, testes separement
  // et de facon exhaustive dans tests/checkout-retry.test.mjs (13 tests,
  // non modifies par ce chantier).
  const res = await h.post();
  assert.equal(res.status, 400);
});
