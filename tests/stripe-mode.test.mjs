import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(env = {}) {
  const source = ts.transpileModule(readFileSync("lib/stripe-mode.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  runInNewContext(source, { module: m, exports: m.exports, process: { env } });
  return m.exports;
}

test("mode serveur deduit de STRIPE_SECRET_KEY", () => {
  assert.equal(load({ STRIPE_SECRET_KEY: "sk_live_x" }).getServerStripeMode(), "live");
  assert.equal(load({ STRIPE_SECRET_KEY: "rk_test_x" }).getServerStripeMode(), "test");
  for (const k of [undefined, "", " sk_live_x", '"sk_live_x"', "pk_live_x"]) {
    assert.equal(load(k === undefined ? {} : { STRIPE_SECRET_KEY: k }).getServerStripeMode(), null, String(k));
  }
});

test("mode d'une session Checkout deduit de son prefixe", () => {
  const m = load();
  assert.equal(m.getCheckoutSessionMode("cs_live_a1"), "live");
  assert.equal(m.getCheckoutSessionMode("cs_test_a1"), "test");
  assert.equal(m.getCheckoutSessionMode(null), null);
  assert.equal(m.getCheckoutSessionMode("pi_test_a1"), null);
});

test("findForeignModeSessions ne signale que les incompatibilites explicites", () => {
  const live = load({ STRIPE_SECRET_KEY: "sk_live_x" });
  assert.deepEqual([...live.findForeignModeSessions(["cs_test_a", "cs_live_b", null, undefined])], ["cs_test_a"]);
  assert.deepEqual([...live.findForeignModeSessions(["cs_live_b", null])], []);
  const test_ = load({ STRIPE_SECRET_KEY: "sk_test_x" });
  assert.deepEqual([...test_.findForeignModeSessions(["cs_live_b"])], ["cs_live_b"]);
  // Cle inconnue : pas de blocage ici (les appels Stripe echoueront d'eux-memes).
  assert.deepEqual([...load({}).findForeignModeSessions(["cs_test_a"])], []);
});

test("les controles de mode precedent tout traitement metier", () => {
  const before = (file, guard, first) => {
    const src = readFileSync(file, "utf8");
    const g = src.indexOf(guard);
    const f = src.indexOf(first);
    assert.ok(g > 0 && f > 0 && g < f, `${file}: ${guard} doit preceder ${first}`);
  };
  before("app/api/admin/reservations/[id]/refund/route.ts", "findForeignModeSessions([", '"prepare_vip_refund"');
  before("app/api/manager/reservations/[id]/refund/route.ts", "findForeignModeSessions([", '"prepare_full_payment_refunds"');
  before("app/api/stripe/webhook/route.ts", "event.livemode !== serverLiveMode", "switch (event.type)");
  before("app/api/stripe/webhook/route.ts", "constructEvent(", "event.livemode !== serverLiveMode");
});
