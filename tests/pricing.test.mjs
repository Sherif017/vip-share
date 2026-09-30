import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// lib/pricing.ts a "import server-only" en tête, qui n'a pas d'export et
// sert uniquement à empêcher un import côté client — on le neutralise ici
// exactement comme le reste de la suite de tests neutralise ses propres
// dépendances non pertinentes en environnement Node pur.
function loadPricing() {
  const source = ts.transpileModule(readFileSync('lib/pricing.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(source, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: (name) => {
      if (name === 'server-only') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: 'lib/pricing.ts' });
  return loadedModule.exports;
}

const pricing = loadPricing();

test('1. frais de service K-RÉ : 200,00 € à 2,75 % -> 5,50 €', () => {
  const fee = pricing.computeServiceFeeCents(20000, 275, 30);
  assert.equal(fee, 550);
});

test('2. minimum de frais de service : 5,00 € à 2,75 % (0,1375 €) -> 0,30 € minimum', () => {
  const fee = pricing.computeServiceFeeCents(500, 275, 30);
  assert.equal(fee, 30);
});

test('3. commission club : 200,00 € à 15 % -> 30,00 € K-RÉ / 170,00 € club', () => {
  const { commissionCents, clubNetCents } = pricing.computeCommissionSplit(20000, 1500);
  assert.equal(commissionCents, 3000);
  assert.equal(clubNetCents, 17000);
});

test('4. répartition complète : 2 places à 100 € (club 15 %) -> total client 205,50 €', () => {
  const breakdown = pricing.computeFullPaymentBreakdown({
    pricePerPersonCents: 10000,
    quantity: 2,
    serviceFeeBps: 275,
    serviceFeeMinimumCents: 30,
    commissionBps: 1500,
  });
  assert.equal(breakdown.vipSubtotalCents, 20000);
  assert.equal(breakdown.serviceFeeCents, 550);
  assert.equal(breakdown.totalCustomerCents, 20550);
  assert.equal(breakdown.commissionCents, 3000);
  assert.equal(breakdown.clubNetCents, 17000);
});

test('5. jamais de frais de service négatif ou nul par rapport au minimum, même à 0 €', () => {
  const fee = pricing.computeServiceFeeCents(0, 275, 30);
  assert.equal(fee, 30);
});

test('6. commission + net club reconstituent toujours exactement le sous-total VIP (pas de perte d\'arrondi silencieuse)', () => {
  // Cas volontairement non rond pour vérifier l'arrondi entier en centimes.
  const { commissionCents, clubNetCents } = pricing.computeCommissionSplit(9999, 1234);
  assert.equal(commissionCents + clubNetCents, 9999);
});

test('7. formatCentsAsEuros affiche toujours 2 décimales', () => {
  assert.equal(pricing.formatCentsAsEuros(550), '5.50 €');
  assert.equal(pricing.formatCentsAsEuros(20000), '200.00 €');
});
