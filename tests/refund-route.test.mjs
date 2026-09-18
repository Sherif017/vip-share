import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const reservationId = "44444444-4444-4444-8444-444444444444";
const userId = "11111111-1111-4111-8111-111111111111";
const offerId = "22222222-2222-4222-8222-222222222222";

function loadRoute(harness) {
  const source = ts.transpileModule(
    readFileSync("app/api/admin/reservations/[id]/refund/route.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const loadedModule = { exports: {} };
  const nextServer = { NextResponse: { json: (body, init) => Response.json(body, init) } };
  runInNewContext(source, {
    module: loadedModule,
    exports: loadedModule.exports,
    require(name) {
      if (name === "next/server") return nextServer;
      if (name === "@/lib/stripe") return { stripe: harness.stripe };
      if (name === "@/lib/admin-access") return { getAdminAccess: harness.getAdminAccess, canManageVipOffer: harness.canManageVipOffer };
      if (name === "@/lib/supabase-admin") return { supabaseAdmin: harness.db };
      throw new Error(`Unexpected dependency ${name}`);
    },
    Response,
    console: { error() {} },
  }, { filename: "app/api/admin/reservations/[id]/refund/route.ts" });
  return loadedModule.exports;
}

function harness({ paymentType = "initial_deposit", amount = 2500, metadata = {}, permitted = true, existingRefunds = [], rowStatus = "refund_pending" } = {}) {
  const calls = { refund: [], rpc: [], fail: 0 };
  const session = {
    status: "complete",
    payment_status: "paid",
    currency: "eur",
    amount_total: amount,
    metadata: {
      payment_type: paymentType,
      reservation_id: reservationId,
      user_id: userId,
      vip_offer_id: offerId,
      ...metadata,
    },
    payment_intent: {
      id: `pi_${paymentType}`,
      currency: "eur",
      amount_received: amount,
      status: "succeeded",
    },
  };
  const reservation = {
    id: reservationId,
    user_id: userId,
    vip_offer_id: offerId,
    deposit_paid: 25,
    supplement_amount: 600,
  };
  const row = { id: "55555555-5555-4555-8555-555555555555", payment_type: paymentType, stripe_session_id: `cs_${paymentType}`, status: rowStatus };
  const db = {
    from(table) {
      assert.equal(table, "reservations");
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle() { return Promise.resolve({ data: reservation, error: null }); },
      };
      return query;
    },
    async rpc(name) {
      calls.rpc.push(name);
      if (name === "prepare_vip_refund") return { data: [row], error: null };
      if (name === "claim_vip_refund") return { data: row, error: null };
      if (name === "complete_vip_refund") return { data: { ...row, status: "refunded", amount }, error: null };
      if (name === "fail_vip_refund") { calls.fail += 1; return { data: row, error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const stripe = {
    checkout: { sessions: { retrieve: async () => session } },
    refunds: {
      list: async () => ({ data: existingRefunds }),
      create: async (params, options) => {
      calls.refund.push({ params, options });
      return { id: "re_test", amount: params.amount, currency: "eur" };
    } },
  };
  const route = loadRoute({
    db,
    stripe,
    getAdminAccess: async () => ({ userId, isManager: true }),
    canManageVipOffer: async () => permitted,
  });
  const post = () => route.POST(
    new Request("http://localhost/api/admin/reservations/" + reservationId + "/refund", { method: "POST", body: JSON.stringify({ reason: "test" }) }),
    { params: Promise.resolve({ id: reservationId }) },
  );
  return { post, calls };
}

test("initial Deposit refunds the DB amount and stable key", async () => {
  const h = harness();
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(h.calls.refund[0].params.amount, 2500);
  assert.equal(h.calls.refund[0].options.idempotencyKey, "vip-refund:55555555-5555-4555-8555-555555555555");
  assert.equal(h.calls.fail, 0);
});

test("supplement refunds its own DB amount and PaymentIntent", async () => {
  const h = harness({ paymentType: "supplement", amount: 60000 });
  assert.equal((await h.post()).status, 200);
  assert.equal(h.calls.refund[0].params.amount, 60000);
  assert.equal(h.calls.refund[0].params.payment_intent, "pi_supplement");
});

test("wrong amount or metadata never creates a Stripe Refund", async () => {
  const wrongAmount = harness({ amount: 3000 });
  assert.equal((await wrongAmount.post()).status, 502);
  assert.equal(wrongAmount.calls.refund.length, 0);
  assert.equal(wrongAmount.calls.fail, 1);
  const wrongMetadata = harness({ metadata: { reservation_id: "other" } });
  assert.equal((await wrongMetadata.post()).status, 502);
  assert.equal(wrongMetadata.calls.refund.length, 0);
});

test("customer or scanner authorization cannot refund", async () => {
  const h = harness({ permitted: false });
  assert.equal((await h.post()).status, 403);
  assert.equal(h.calls.rpc.length, 0);
});

test("two concurrent attempts use the same Stripe idempotency key", async () => {
  const h = harness();
  const responses = await Promise.all([h.post(), h.post()]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(h.calls.refund.length, 2);
  assert.equal(h.calls.refund[0].options.idempotencyKey, h.calls.refund[1].options.idempotencyKey);
});

test("a refund found after a lost response is recovered without creating another", async () => {
  const h = harness({ existingRefunds: [{ id: "re_existing", amount: 2500, currency: "eur", status: "succeeded" }] });
  assert.equal((await h.post()).status, 200);
  assert.equal(h.calls.refund.length, 0);
});

test("second request after completed refund is idempotent and never calls Stripe", async () => {
  const h = harness({ rowStatus: "refunded" });
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(h.calls.refund.length, 0);
  assert.deepEqual(h.calls.rpc, ["prepare_vip_refund"]);
  assert.deepEqual(await response.json(), {
    success: true,
    refunds: [{
      id: "55555555-5555-4555-8555-555555555555",
      payment_type: "initial_deposit",
      stripe_session_id: "cs_initial_deposit",
      status: "refunded",
    }],
  });
});

test("an incompatible partial refund fails closed", async () => {
  const h = harness({ existingRefunds: [{ id: "re_partial", amount: 1000, currency: "eur", status: "succeeded" }] });
  assert.equal((await h.post()).status, 502);
  assert.equal(h.calls.refund.length, 0);
  assert.equal(h.calls.fail, 1);
});
