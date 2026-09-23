import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const clone = value => JSON.parse(JSON.stringify(value));

function load(path, dependencies, clock, logs) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(source, {
    module: loadedModule, exports: loadedModule.exports,
    require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'server-only') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
    URL, console: { error(...args) { logs.push(args); }, info() {} },
    Date: class extends Date { static now() { return clock.now; } },
    process: { env: {} },
  }, { filename: path });
  return loadedModule.exports;
}

// Faithful in-memory model of claim_reservation_email, extended with the
// entity_id dimension from supabase/migrations/202609230002_*.sql: rows
// are keyed by (reservation_id, email_type, entity_id), so two distinct
// refunds (or merge proposals) on the SAME reservation get independent,
// independently-retryable tracking rows — exactly the bug the P1
// migration fixes.
function makeEmailsTable(state, clock) {
  const STALE_AFTER_MS = 5 * 60 * 1000;
  const keyOf = (r, t, e) => `${r}|${t}|${e || ''}`;

  return {
    async rpc(reservationId, emailType, idempotencyKey, entityId = '') {
      const key = keyOf(reservationId, emailType, entityId);
      if (!state.emailRows.has(key)) {
        state.emailRows.set(key, {
          id: key, reservation_id: reservationId, email_type: emailType, entity_id: entityId,
          idempotency_key: idempotencyKey, status: 'pending', attempts: 0, last_error: null, updated_at: clock.now,
        });
      }
      const row = state.emailRows.get(key);
      const claimable = row.status === 'pending' || row.status === 'failed' ||
        (row.status === 'processing' && (clock.now - row.updated_at) > STALE_AFTER_MS);
      if (claimable) {
        row.status = 'processing'; row.attempts += 1; row.updated_at = clock.now;
        return { claimed: true, row_id: row.id, attempts: row.attempts, status: row.status, idempotency_key: row.idempotency_key };
      }
      return { claimed: false, row_id: row.id, attempts: row.attempts, status: row.status, idempotency_key: row.idempotency_key };
    },
    update(rowId, patch) {
      for (const row of state.emailRows.values()) {
        if (row.id === rowId) Object.assign(row, patch);
      }
    },
  };
}

function makeDb(state, clock) {
  const emails = makeEmailsTable(state, clock);

  function tableQuery(rows, { single = false } = {}) {
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push(r => r[key] === value); return query; },
      order() { return query; },
      limit() { return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const matches = rows.filter(r => filters.every(f => f(r)));
          if (single) return { data: matches[0] ? clone(matches[0]) : null, error: null };
          return { data: matches.map(clone), error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }

  return {
    from(table) {
      if (table === 'vip_offers') return tableQuery(state.offers);
      if (table === 'reservations') return tableQuery(state.reservations);
      if (table === 'vip_merge_proposals') return tableQuery(state.proposals);
      if (table === 'reservation_emails') {
        let patch;
        let rowId;
        const query = {
          update(value) { patch = clone(value); return query; },
          eq(key, value) { if (key === 'id') rowId = value; return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              if (rowId && patch) emails.update(rowId, patch);
              return { error: null };
            }).then(resolve, reject);
          },
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name, args) {
      if (name === 'claim_reservation_email') {
        const result = await emails.rpc(args.p_reservation_id, args.p_email_type, args.p_idempotency_key, args.p_entity_id);
        return { data: [result], error: null };
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
        if (state.resendShouldFail) return { data: null, error: { message: 'Resend indisponible' } };
        return { data: { id: `msg_${state.resendCalls.length}` }, error: null };
      },
    },
  };
}

function emailStatus(state, reservationId, emailType, entityId = '') {
  const row = state.emailRows.get(`${reservationId}|${emailType}|${entityId || ''}`);
  return row ? row.status : undefined;
}

const EVENT = { name: 'Shadow Club Night', event_date: '2026-09-19', start_time: '23:30', clubs: { name: 'Shadow Club', city: 'Paris' } };

function baseReservation(id, offerId, overrides = {}) {
  return {
    id, vip_offer_id: offerId, status: 'confirmed',
    firstname: 'Camille', email: `${id}@example.test`,
    quantity: 1, reservation_code: `VIP-${id}`,
    total_price: 100, deposit_paid: 30, remaining_amount: 70,
    supplement_amount: null, supplement_status: null,
    vip_offers: { table_number: 'K-RÉ 1', decision_price_per_person: null },
    events: EVENT,
    ...overrides,
  };
}

function harness() {
  const clock = { now: Date.now() };
  const logs = [];
  const state = {
    offers: [], reservations: [], proposals: [],
    emailRows: new Map(), resendCalls: [], resendShouldFail: false,
  };
  const db = makeDb(state, clock);
  const resendClient = makeResend(state);

  const dependencies = {
    '@/lib/supabase-admin': { supabaseAdmin: db },
    '@/lib/email/resend': { resend: resendClient, EMAIL_FROM: 'K-RÉ <reservations@k-re.org>', EMAIL_REPLY_TO: 'support@k-re.org' },
  };
  dependencies['@/lib/email/shared'] = load('lib/email/shared.ts', dependencies, clock, logs);
  dependencies['@/lib/email/dispatch'] = load('lib/email/dispatch.ts', dependencies, clock, logs);
  dependencies['@/lib/email/table-confirmed'] = load('lib/email/table-confirmed.ts', dependencies, clock, logs);

  const merge = load('lib/email/merge.ts', dependencies, clock, logs);
  const supplement = load('lib/email/supplement.ts', dependencies, clock, logs);
  const refund = load('lib/email/refund.ts', dependencies, clock, logs);
  const tableConfirmed = dependencies['@/lib/email/table-confirmed'];

  return { state, clock, logs, db, tableConfirmed, merge, supplement, refund };
}

// ---------------------------------------------------------------------
// A. table_confirmed
// ---------------------------------------------------------------------

test('A1. table confirmée -> un email par réservation confirmée sur la table', async () => {
  const h = harness();
  h.state.offers.push({ id: 'offer-1', status: 'confirmed' });
  h.state.reservations.push(baseReservation('r1', 'offer-1'), baseReservation('r2', 'offer-1'));
  await h.tableConfirmed.dispatchTableConfirmedEmails('offer-1');
  assert.equal(h.state.resendCalls.length, 2);
  assert.equal(emailStatus(h.state, 'r1', 'table_confirmed'), 'sent');
  assert.equal(emailStatus(h.state, 'r2', 'table_confirmed'), 'sent');
});

test('A2. table pas encore confirmée -> aucun email', async () => {
  const h = harness();
  h.state.offers.push({ id: 'offer-1', status: 'forming' });
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await h.tableConfirmed.dispatchTableConfirmedEmails('offer-1');
  assert.equal(h.state.resendCalls.length, 0);
});

test('A3. rappel sur table déjà notifiée -> aucun doublon (idempotent, safe à rappeler)', async () => {
  const h = harness();
  h.state.offers.push({ id: 'offer-1', status: 'confirmed' });
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await h.tableConfirmed.dispatchTableConfirmedEmails('offer-1');
  await h.tableConfirmed.dispatchTableConfirmedEmails('offer-1'); // ex : webhook + accept-as-is + merge, même table.
  assert.equal(h.state.resendCalls.length, 1);
});

test('A4. table_confirmed et reservation_confirmed sont deux lignes distinctes -> jamais de doublon du P0', async () => {
  const h = harness();
  h.state.offers.push({ id: 'offer-1', status: 'confirmed' });
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  // reservation_confirmed simulé comme déjà envoyé par le P0 (autre email_type).
  h.state.emailRows.set('r1|reservation_confirmed|', { id: 'x', status: 'sent' });
  await h.tableConfirmed.dispatchTableConfirmedEmails('offer-1');
  assert.equal(emailStatus(h.state, 'r1', 'table_confirmed'), 'sent');
  assert.equal(emailStatus(h.state, 'r1', 'reservation_confirmed'), 'sent'); // inchangé, ligne séparée.
  assert.equal(h.state.resendCalls.length, 1); // un seul envoi réel (table_confirmed) déclenché ici.
});

// ---------------------------------------------------------------------
// B/C. merge
// ---------------------------------------------------------------------

test('B1. proposition de fusion -> email uniquement aux participants source', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-source'), baseReservation('r2', 'offer-target'));
  h.state.proposals.push({ id: 'proposal-1', source_offer_id: 'offer-source', target_offer_id: 'offer-target', status: 'pending', source_reservation_ids: ['r1'] });
  await h.merge.dispatchMergeProposedEmails('offer-source');
  assert.equal(h.state.resendCalls.length, 1);
  assert.equal(h.state.resendCalls[0].payload.to, 'r1@example.test');
  assert.equal(emailStatus(h.state, 'r1', 'merge_proposed', 'proposal-1'), 'sent');
});

test('B2. bonne idempotency key merge-proposed/<proposal_id>/<reservation_id>', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-source'));
  h.state.proposals.push({ id: 'proposal-1', source_offer_id: 'offer-source', target_offer_id: 'offer-target', status: 'pending', source_reservation_ids: ['r1'] });
  await h.merge.dispatchMergeProposedEmails('offer-source');
  assert.equal(h.state.resendCalls[0].idempotencyKey, 'merge-proposed/proposal-1/r1');
});

test('C1. fusion finalisée (completed) -> email de confirmation aux participants source', async () => {
  const h = harness();
  h.state.offers.push({ id: 'offer-target', status: 'confirmed' });
  h.state.reservations.push(baseReservation('r1', 'offer-target'));
  h.state.proposals.push({ id: 'proposal-1', source_offer_id: 'offer-source', target_offer_id: 'offer-target', status: 'completed', source_reservation_ids: ['r1'] });
  await h.merge.dispatchMergeFinalizedEmails('offer-source');
  assert.equal(emailStatus(h.state, 'r1', 'merge_completed', 'proposal-1'), 'sent');
});

test('C2. fusion refusée/expirée -> aucun email de confirmation', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-source'));
  for (const status of ['refused', 'expired', 'invalidated']) {
    h.state.proposals = [{ id: 'proposal-x', source_offer_id: 'offer-source', target_offer_id: 'offer-target', status, source_reservation_ids: ['r1'] }];
    await h.merge.dispatchMergeFinalizedEmails('offer-source');
  }
  assert.equal(h.state.resendCalls.length, 0);
});

// ---------------------------------------------------------------------
// D. supplement_required
// ---------------------------------------------------------------------

test('D1. supplément requis -> email avec le bon montant, seulement aux concernés', async () => {
  const h = harness();
  h.state.reservations.push(
    baseReservation('r1', 'offer-1', { supplement_status: 'pending', supplement_amount: 15.5 }),
    baseReservation('r2', 'offer-1', { supplement_status: null }), // supplément déjà couvert (0 €), pas concerné.
  );
  await h.supplement.dispatchSupplementRequiredEmails('offer-1', '2026-09-24T10:00:00.000Z');
  assert.equal(h.state.resendCalls.length, 1);
  assert.match(h.state.resendCalls[0].payload.html, /15\.50/);
  assert.equal(emailStatus(h.state, 'r2', 'supplement_required'), undefined);
});

test('D2. deux rounds de supplément (round key différent) -> deux emails distincts', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1', { supplement_status: 'pending', supplement_amount: 10 }));
  await h.supplement.dispatchSupplementRequiredEmails('offer-1', 'round-A');
  h.state.reservations[0].supplement_amount = 20; // nouveau round, nouveau snapshot.
  await h.supplement.dispatchSupplementRequiredEmails('offer-1', 'round-B');
  assert.equal(h.state.resendCalls.length, 2);
  assert.equal(emailStatus(h.state, 'r1', 'supplement_required', 'round-A'), 'sent');
  assert.equal(emailStatus(h.state, 'r1', 'supplement_required', 'round-B'), 'sent');
});

// ---------------------------------------------------------------------
// E/F. refund
// ---------------------------------------------------------------------

test('E1. remboursement demandé -> email "en cours"', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await h.refund.dispatchRefundRequestedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  assert.equal(emailStatus(h.state, 'r1', 'refund_requested', 'refund-1'), 'sent');
  assert.match(h.state.resendCalls[0].payload.html, /en cours/i);
});

test('F1. remboursement terminé -> email distinct de "demandé" (refund requested != completed)', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await h.refund.dispatchRefundRequestedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  await h.refund.dispatchRefundCompletedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  assert.equal(h.state.resendCalls.length, 2);
  assert.equal(emailStatus(h.state, 'r1', 'refund_requested', 'refund-1'), 'sent');
  assert.equal(emailStatus(h.state, 'r1', 'refund_completed', 'refund-1'), 'sent');
  assert.match(h.state.resendCalls[0].payload.subject, /en cours/i);
  assert.match(h.state.resendCalls[1].payload.subject, /terminé/i);
});

test('F2. deux remboursements distincts (deposit + supplément) sur LA MÊME réservation -> deux paires E/F indépendantes', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await h.refund.dispatchRefundRequestedEmail({ id: 'refund-deposit', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  await h.refund.dispatchRefundRequestedEmail({ id: 'refund-supplement', reservation_id: 'r1', payment_type: 'supplement', amount: 1500 });
  assert.equal(h.state.resendCalls.length, 2); // Le bug que la migration entity_id corrige : sans elle, le second serait bloqué.
  assert.equal(emailStatus(h.state, 'r1', 'refund_requested', 'refund-deposit'), 'sent');
  assert.equal(emailStatus(h.state, 'r1', 'refund_requested', 'refund-supplement'), 'sent');
});

test('E2. bonne idempotency key refund-requested/<refund_id> puis refund-completed/<refund_id>', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await h.refund.dispatchRefundRequestedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  await h.refund.dispatchRefundCompletedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  assert.equal(h.state.resendCalls[0].idempotencyKey, 'refund-requested/refund-1');
  assert.equal(h.state.resendCalls[1].idempotencyKey, 'refund-completed/refund-1');
});

// ---------------------------------------------------------------------
// Concurrence, retry, panne Resend — cross-cutting sur le mécanisme partagé
// ---------------------------------------------------------------------

test('G1. deux appels concurrents (ex: cron + décision client simultanés) -> un seul envoi', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  await Promise.all([
    h.refund.dispatchRefundRequestedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 }),
    h.refund.dispatchRefundRequestedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 }),
  ]);
  assert.equal(h.state.resendCalls.length, 1);
});

test('G2. Resend indisponible -> failed, retryable, jamais d\'exception (l\'opération métier ne peut pas être annulée par un throw)', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  h.state.resendShouldFail = true;
  await assert.doesNotReject(() =>
    h.refund.dispatchRefundCompletedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 })
  );
  assert.equal(emailStatus(h.state, 'r1', 'refund_completed', 'refund-1'), 'failed');
});

test('G3. retry après failed -> email finalement envoyé', async () => {
  const h = harness();
  h.state.reservations.push(baseReservation('r1', 'offer-1'));
  h.state.resendShouldFail = true;
  await h.refund.dispatchRefundCompletedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  h.state.resendShouldFail = false;
  await h.refund.dispatchRefundCompletedEmail({ id: 'refund-1', reservation_id: 'r1', payment_type: 'initial_deposit', amount: 3000 });
  assert.equal(emailStatus(h.state, 'r1', 'refund_completed', 'refund-1'), 'sent');
  assert.equal(h.state.resendCalls.length, 2);
});
