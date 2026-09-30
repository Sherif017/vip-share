import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";


const migration =
  fs.readFileSync(
    "supabase/migrations/20260930235000_settlement_safety.sql",
    "utf8"
  );


const refund =
  fs.readFileSync(
    "lib/full-payment-refund.ts",
    "utf8"
  );


const transfers =
  fs.readFileSync(
    "lib/stripe-transfers.ts",
    "utf8"
  );


const route =
  fs.readFileSync(
    "app/api/manager/events/[id]/settlement/route.ts",
    "utf8"
  );


test(
  "1. settlement exige J+1 calendrier Europe/Paris",
  () => {
    assert.match(
      migration,
      /Europe\/Paris/
    );

    assert.match(
      migration,
      /::date <= v_event\.event_date/
    );
  }
);


test(
  "2. paiements pending bloquent le settlement",
  () => {
    assert.match(
      migration,
      /pt\.status = 'pending'/
    );
  }
);


test(
  "3. refunds pending/refunding bloquent le settlement",
  () => {
    assert.match(
      migration,
      /'refund_pending'/
    );

    assert.match(
      migration,
      /'refunding'/
    );
  }
);


test(
  "4. mutualisation et supplement unresolved bloquent",
  () => {
    for (
      const state
      of [
        "forming",
        "admin_review",
        "merge_pending",
        "decision_pending",
        "supplement_payment_pending",
        "refund_pending",
      ]
    ) {
      assert.ok(
        migration.includes(
          `'${state}'`
        ),
        state
      );
    }
  }
);


test(
  "5. merge proposal pending bloque",
  () => {
    assert.match(
      migration,
      /vip_merge_proposals/
    );

    assert.match(
      migration,
      /mp\.status = 'pending'/
    );
  }
);


test(
  "6. claim revalide les blockers",
  () => {
    const occurrences =
      migration.match(
        /event_settlement_blockers\(/g
      ) ?? [];

    assert.ok(
      occurrences.length >= 3
    );
  }
);


test(
  "7. refund et transfer partagent un row lock",
  () => {
    assert.match(
      migration,
      /guard_refund_against_processing_transfer/
    );

    assert.match(
      migration,
      /for update/
    );

    assert.match(
      migration,
      /v_transfer_status =\s*'processing'/
    );
  }
);


test(
  "8. supplement refund attend full_payment_supplement",
  () => {
    assert.match(
      refund,
      /"full_payment_supplement"/
    );

    assert.doesNotMatch(
      refund,
      /function expectedStripeMetadataType[\s\S]*?: "supplement";/
    );
  }
);


test(
  "9. capability Stripe transfers verifiee live",
  () => {
    assert.match(
      transfers,
      /stripe\.accounts\.retrieve/
    );

    assert.match(
      transfers,
      /capabilities[\s\S]*?\.transfers !== "active"/
    );
  }
);


test(
  "10. approbation et transfert sont deux actions distinctes",
  () => {
    assert.match(
      route,
      /\| "approve"/
    );

    assert.match(
      route,
      /\| "transfer"/
    );

    assert.doesNotMatch(
      route,
      /approve_and_transfer/
    );
  }
);


test(
  "11. approve ne lance pas le moteur Stripe",
  () => {
    const approveStart =
      route.indexOf(
        'if (action === "approve")'
      );

    const transferStart =
      route.indexOf(
        "const transferResult"
      );

    assert.ok(
      approveStart >= 0
    );

    assert.ok(
      transferStart >
        approveStart
    );

    const approveSection =
      route.slice(
        approveStart,
        transferStart
      );

    assert.doesNotMatch(
      approveSection,
      /transferApprovedEvent/
    );
  }
);


test(
  "12. transactions avec snapshot Stripe incomplet bloquent",
  () => {
    assert.match(
      migration,
      /stripe_payment_intent_id/
    );

    assert.match(
      migration,
      /stripe_account_id/
    );
  }
);
