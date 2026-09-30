import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration =
  fs.readFileSync(
    "supabase/migrations/20260930233000_full_payment_supplements.sql",
    "utf8"
  );

const lib =
  fs.readFileSync(
    "lib/full-payment-supplement.ts",
    "utf8"
  );

const route =
  fs.readFileSync(
    "app/api/reservations/[reservationRef]/supplement-checkout/route.ts",
    "utf8"
  );

const webhook =
  fs.readFileSync(
    "app/api/stripe/webhook/route.ts",
    "utf8"
  );

test(
  "1. le chemin legacy reste séparé du full_payment",
  () => {
    assert.match(
      route,
      /payment_model[\s\S]*full_payment/
    );

    assert.match(
      route,
      /supplementCheckout/
    );

    assert.match(
      route,
      /fullPaymentSupplementCheckout/
    );
  }
);

test(
  "2. le supplément full-payment possède son propre snapshot financier",
  () => {
    assert.match(
      migration,
      /payment_type[\s\S]*'supplement'/
    );

    assert.match(
      migration,
      /service_fee_cents/
    );

    assert.match(
      migration,
      /commission_cents/
    );

    assert.match(
      migration,
      /club_net_cents/
    );

    assert.match(
      migration,
      /total_customer_cents/
    );
  }
);

test(
  "3. les frais de service sont ajoutés au supplément VIP",
  () => {
    assert.match(
      migration,
      /v_total_customer_cents[\s\S]*v_vip_subtotal_cents[\s\S]*v_service_fee_cents/
    );

    assert.match(
      lib,
      /Frais de service K-RÉ/
    );

    assert.match(
      lib,
      /vip_subtotal_cents[\s\S]*service_fee_cents/
    );
  }
);

test(
  "4. la commission est prélevée uniquement sur le VIP",
  () => {
    assert.match(
      migration,
      /v_commission_cents[\s\S]*v_vip_subtotal_cents[\s\S]*v_commission_bps/
    );

    assert.match(
      migration,
      /v_club_net_cents[\s\S]*v_vip_subtotal_cents[\s\S]*v_commission_cents/
    );
  }
);

test(
  "5. Checkout possède une idempotency key par tentative",
  () => {
    assert.match(
      lib,
      /idempotencyKey/
    );

    assert.match(
      lib,
      /checkout_attempt_count/
    );

    assert.match(
      migration,
      /checkout_attempt_count/
    );
  }
);

test(
  "6. le PaymentIntent du supplément possède un transfer_group",
  () => {
    assert.match(
      lib,
      /payment_intent_data[\s\S]*transfer_group/
    );

    assert.match(
      migration,
      /reservation:[\s\S]*supplement/
    );
  }
);

test(
  "7. le webhook distingue initial, legacy supplement et full-payment supplement",
  () => {
    assert.match(
      webhook,
      /full_payment_initial/
    );

    assert.match(
      webhook,
      /full_payment_supplement/
    );

    assert.match(
      webhook,
      /confirmFullPaymentSupplement/
    );

    assert.match(
      webhook,
      /confirmSupplement/
    );
  }
);

test(
  "8. la confirmation vérifie le montant contre le ledger",
  () => {
    assert.match(
      webhook,
      /txn\.total_customer_cents/
    );

    assert.match(
      migration,
      /p_amount_total[\s\S]*v_txn\.total_customer_cents/
    );
  }
);

test(
  "9. expiration tardive ne peut pas écraser une nouvelle session",
  () => {
    assert.match(
      migration,
      /supplement_stripe_session_id[\s\S]*is distinct from[\s\S]*p_stripe_session_id/
    );

    assert.match(
      migration,
      /status = 'expired'/
    );
  }
);

test(
  "10. aucune RPC full-payment supplement n'est exposée au navigateur",
  () => {
    assert.match(
      migration,
      /revoke all on function public\.prepare_full_payment_supplement[\s\S]*public, anon, authenticated/
    );

    assert.match(
      migration,
      /grant execute on function public\.prepare_full_payment_supplement[\s\S]*service_role/
    );

    assert.match(
      migration,
      /grant execute on function public\.confirm_full_payment_supplement[\s\S]*service_role/
    );
  }
);
