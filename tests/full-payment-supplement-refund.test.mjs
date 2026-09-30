import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";


const migration =
  fs.readFileSync(
    "supabase/migrations/20260930234000_full_payment_supplement_refunds.sql",
    "utf8"
  );


const engine =
  fs.readFileSync(
    "lib/full-payment-refund.ts",
    "utf8"
  );


const route =
  fs.readFileSync(
    "app/api/manager/reservations/[id]/refund/route.ts",
    "utf8"
  );


test(
  "1. prepare initial + supplement avant Stripe",
  () => {
    assert.match(
      migration,
      /prepare_full_payment_refunds/
    );

    assert.match(
      migration,
      /payment_type in \('initial', 'supplement'\)/
    );

    assert.match(
      migration,
      /full_payment_initial/
    );

    assert.match(
      migration,
      /v_refund_type := 'supplement'/
    );
  }
);


test(
  "2. un supplement pending bloque le refund",
  () => {
    assert.match(
      migration,
      /payment_type = 'supplement'[\s\S]*status = 'pending'/
    );

    assert.match(
      migration,
      /paiement de supplément est encore en cours/
    );
  }
);


test(
  "3. le RPC historique prépare aussi tous les refunds",
  () => {
    assert.match(
      migration,
      /create or replace function public\.prepare_full_payment_refund\(/
    );

    assert.match(
      migration,
      /public\.prepare_full_payment_refunds\(/
    );
  }
);


test(
  "4. complete refund accepte initial et supplement",
  () => {
    assert.match(
      migration,
      /v\.payment_type not in \([\s\S]*'full_payment_initial'[\s\S]*'supplement'/
    );

    assert.match(
      migration,
      /v\.payment_type = 'supplement'[\s\S]*t\.payment_type <> 'supplement'/
    );

    assert.match(
      migration,
      /remaining = 0/
    );
  }
);


test(
  "5. moteur Stripe mappe refund vers ledger",
  () => {
    assert.match(
      engine,
      /FullPaymentRefundType[\s\S]*"full_payment_initial"[\s\S]*"supplement"/
    );

    assert.match(
      engine,
      /LedgerPaymentType[\s\S]*"initial"[\s\S]*"supplement"/
    );

    assert.match(
      engine,
      /expectedLedgerPaymentType/
    );

    assert.match(
      engine,
      /expectedStripeMetadataType/
    );
  }
);


test(
  "6. metadata Stripe refund est dynamique",
  () => {
    assert.match(
      engine,
      /payment_type:[\s\S]*refund\.payment_type/
    );

    assert.match(
      engine,
      /kre-full-payment-refund:\$\{refund\.id\}/
    );

    assert.match(
      engine,
      /kre-transfer-reversal:\$\{txn\.id\}/
    );
  }
);


test(
  "7. reversal reste indépendant par transaction",
  () => {
    assert.match(
      engine,
      /payment_transaction_id:[\s\S]*txn\.id/
    );

    assert.match(
      engine,
      /amount:[\s\S]*txn\.club_net_cents/
    );

    assert.match(
      engine,
      /record_full_payment_transfer_reversal/
    );
  }
);


test(
  "8. route prépare tous les refunds avant la boucle Stripe",
  () => {
    const prepareIndex =
      route.indexOf(
        '"prepare_full_payment_refunds"'
      );

    const loopIndex =
      route.indexOf(
        "for ("
      );

    const stripeIndex =
      route.indexOf(
        "refundFullPayment("
      );


    assert.ok(
      prepareIndex >= 0
    );

    assert.ok(
      loopIndex >
        prepareIndex
    );

    assert.ok(
      stripeIndex >
        prepareIndex
    );
  }
);


test(
  "9. route supporte retry partiel",
  () => {
    assert.match(
      route,
      /preparedRefund\.status ===[\s\S]*"refunded"/
    );

    assert.match(
      route,
      /continue;/
    );

    assert.match(
      route,
      /completed:[\s\S]*results/
    );
  }
);


test(
  "10. route expose initial et supplement",
  () => {
    assert.match(
      route,
      /"full_payment_initial"[\s\S]*"supplement"/
    );

    assert.match(
      route,
      /refundCount:[\s\S]*results\.length/
    );
  }
);


test(
  "11. recovery accepte un ancien refund sans payment_transaction_id",
  () => {
    assert.match(
      engine,
      /!candidate\.metadata[\s\S]*\?\.payment_transaction_id/
    );

    assert.match(
      engine,
      /candidate\.metadata[\s\S]*\?\.payment_transaction_id ===[\s\S]*txn\.id/
    );

    assert.match(
      engine,
      /candidate\.metadata[\s\S]*\?\.vip_refund_id ===[\s\S]*refund\.id/
    );
  }
);
