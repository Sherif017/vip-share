import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  runInNewContext,
} from "node:vm";
import {
  test,
} from "node:test";
import ts from "typescript";

const RESERVATION_ID =
  "11111111-1111-4111-8111-111111111111";

const TXN_ID =
  "22222222-2222-4222-8222-222222222222";

const REFUND_ID =
  "33333333-3333-4333-8333-333333333333";

const USER_ID =
  "44444444-4444-4444-8444-444444444444";

const OFFER_ID =
  "55555555-5555-4555-8555-555555555555";

function loadEngine() {
  const source =
    ts.transpileModule(
      readFileSync(
        "lib/full-payment-refund.ts",
        "utf8"
      ),
      {
        compilerOptions: {
          module:
            ts.ModuleKind.CommonJS,

          target:
            ts.ScriptTarget.ES2022,

          esModuleInterop:
            true,
        },
      }
    ).outputText;

  const loaded = {
    exports: {},
  };

  runInNewContext(
    source,
    {
      module: loaded,
      exports:
        loaded.exports,

      require(name) {
        if (
          name ===
          "server-only"
        ) {
          return {};
        }

        throw new Error(
          `Unexpected dependency ${name}`
        );
      },

      console,
      Promise,
      Error,
      Boolean,
      String,
      Number,
      Array,
      Object,
    },
    {
      filename:
        "lib/full-payment-refund.ts",
    }
  );

  return loaded.exports;
}

function harness({
  transferred = false,
  existingReversal = null,
  existingRefund = null,
  reversalError = null,
} = {}) {
  const calls = {
    reversalsList: [],
    reversalCreate: [],
    refundsList: [],
    refundCreate: [],
    rpc: [],
  };

  const reservation = {
    id: RESERVATION_ID,
    user_id: USER_ID,
    vip_offer_id: OFFER_ID,
    payment_model:
      "full_payment",
    stripe_checkout_session_id:
      "cs_full",
  };

  const txn = {
    id: TXN_ID,
    reservation_id:
      RESERVATION_ID,
    payment_type: "initial",
    total_customer_cents:
      20550,
    club_net_cents:
      17000,
    currency: "eur",
    status: "confirmed",
    stripe_payment_intent_id:
      "pi_full",
    stripe_charge_id:
      "ch_full",
    stripe_transfer_id:
      transferred
        ? "tr_full"
        : null,
    stripe_transfer_reversal_id:
      null,
    transfer_status:
      transferred
        ? "transferred"
        : "not_ready",
  };

  const refund = {
    id: REFUND_ID,
    reservation_id:
      RESERVATION_ID,
    payment_type:
      "full_payment_initial",
    stripe_session_id:
      "cs_full",
    payment_transaction_id:
      TXN_ID,
    stripe_transfer_reversal_id:
      null,
    status: "refunding",
    amount: 20550,
    currency: "eur",
  };

  function queryResult(data) {
    const q = {
      select() {
        return q;
      },

      eq() {
        return q;
      },

      single() {
        return Promise.resolve({
          data,
          error: null,
        });
      },
    };

    return q;
  }

  const db = {
    from(table) {
      if (
        table ===
        "reservations"
      ) {
        return queryResult(
          reservation
        );
      }

      if (
        table ===
        "payment_transactions"
      ) {
        return queryResult(
          txn
        );
      }

      throw new Error(
        `Unexpected table ${table}`
      );
    },

    async rpc(
      name,
      args
    ) {
      calls.rpc.push({
        name,
        args,
      });

      if (
        name ===
        "record_full_payment_transfer_reversal"
      ) {
        txn
          .stripe_transfer_reversal_id =
          args.p_reversal_id;

        txn.transfer_status =
          "reversed";

        return {
          data: txn,
          error: null,
        };
      }

      if (
        name ===
        "complete_full_payment_refund"
      ) {
        txn.status =
          "refunded";

        refund.status =
          "refunded";

        refund
          .stripe_transfer_reversal_id =
          args
            .p_transfer_reversal_id;

        return {
          data: {
            ...refund,
          },
          error: null,
        };
      }

      throw new Error(
        `Unexpected RPC ${name}`
      );
    },
  };

  const session = {
    id: "cs_full",
    status: "complete",
    payment_status: "paid",
    currency: "eur",
    amount_total: 20550,

    metadata: {
      payment_type:
        "full_payment_initial",
      reservation_id:
        RESERVATION_ID,
      user_id:
        USER_ID,
      vip_offer_id:
        OFFER_ID,
    },

    payment_intent: {
      id: "pi_full",
      currency: "eur",
      amount_received:
        20550,
      status: "succeeded",
    },
  };

  const stripe = {
    checkout: {
      sessions: {
        async retrieve() {
          return session;
        },
      },
    },

    transfers: {
      async listReversals(
        transferId,
        params
      ) {
        calls
          .reversalsList
          .push({
            transferId,
            params,
          });

        return {
          data:
            existingReversal
              ? [
                  existingReversal,
                ]
              : [],
        };
      },

      async createReversal(
        transferId,
        params,
        options
      ) {
        calls
          .reversalCreate
          .push({
            transferId,
            params,
            options,
          });

        if (reversalError) {
          throw reversalError;
        }

        return {
          id: "trr_new",
          amount:
            params.amount,
          currency: "eur",
          metadata:
            params.metadata,
        };
      },
    },

    refunds: {
      async list(params) {
        calls
          .refundsList
          .push(params);

        return {
          data:
            existingRefund
              ? [
                  existingRefund,
                ]
              : [],
        };
      },

      async create(
        params,
        options
      ) {
        calls
          .refundCreate
          .push({
            params,
            options,
          });

        return {
          id: "re_new",
          amount:
            params.amount,
          currency: "eur",
          status:
            "succeeded",
          metadata:
            params.metadata,
        };
      },
    },
  };

  return {
    db,
    stripe,
    refund,
    txn,
    calls,
  };
}

test(
  "1. avant transfert club : remboursement client complet sans reversal",
  async () => {
    const h =
      harness();

    const engine =
      loadEngine();

    const result =
      await engine
        .refundFullPayment(
          h.db,
          h.stripe,
          h.refund,
          USER_ID
        );

    assert.equal(
      h.calls
        .reversalCreate.length,
      0
    );

    assert.equal(
      h.calls
        .refundCreate.length,
      1
    );

    assert.equal(
      h.calls
        .refundCreate[0]
        .params.amount,
      20550
    );

    assert.equal(
      result.reversalId,
      null
    );
  }
);

test(
  "2. après transfert club : reverse exactement le club_net puis rembourse tout le client",
  async () => {
    const h =
      harness({
        transferred: true,
      });

    const engine =
      loadEngine();

    await engine
      .refundFullPayment(
        h.db,
        h.stripe,
        h.refund,
        USER_ID
      );

    assert.equal(
      h.calls
        .reversalCreate.length,
      1
    );

    assert.equal(
      h.calls
        .reversalCreate[0]
        .params.amount,
      17000
    );

    assert.equal(
      h.calls
        .reversalCreate[0]
        .options
        .idempotencyKey,
      `kre-transfer-reversal:${TXN_ID}`
    );

    assert.equal(
      h.calls
        .refundCreate[0]
        .params.amount,
      20550
    );

    assert.equal(
      h.txn.transfer_status,
      "reversed"
    );
  }
);

test(
  "3. réponse reversal perdue : récupération sans second reversal",
  async () => {
    const h =
      harness({
        transferred: true,

        existingReversal: {
          id:
            "trr_existing",

          amount:
            17000,

          metadata: {
            payment_transaction_id:
              TXN_ID,
          },
        },
      });

    const engine =
      loadEngine();

    const result =
      await engine
        .refundFullPayment(
          h.db,
          h.stripe,
          h.refund,
          USER_ID
        );

    assert.equal(
      h.calls
        .reversalCreate.length,
      0
    );

    assert.equal(
      result.reversalId,
      "trr_existing"
    );
  }
);

test(
  "4. reversal impossible : aucun remboursement client Stripe n'est lancé dans cette tentative",
  async () => {
    const h =
      harness({
        transferred: true,

        reversalError:
          new Error(
            "connected balance insufficient"
          ),
      });

    const engine =
      loadEngine();

    await assert.rejects(
      () =>
        engine
          .refundFullPayment(
            h.db,
            h.stripe,
            h.refund,
            USER_ID
          ),
      /connected balance insufficient/
    );

    assert.equal(
      h.calls
        .refundCreate.length,
      0
    );
  }
);

test(
  "5. réponse refund perdue : récupération sans second remboursement",
  async () => {
    const h =
      harness({
        existingRefund: {
          id:
            "re_existing",

          amount:
            20550,

          currency:
            "eur",

          status:
            "succeeded",

          metadata: {
            vip_refund_id:
              REFUND_ID,
          },
        },
      });

    const engine =
      loadEngine();

    const result =
      await engine
        .refundFullPayment(
          h.db,
          h.stripe,
          h.refund,
          USER_ID
        );

    assert.equal(
      h.calls
        .refundCreate.length,
      0
    );

    assert.equal(
      result
        .stripeRefundId,
      "re_existing"
    );
  }
);

test(
  "6. refund créé avec idempotency key stable et metadata K-RÉ",
  async () => {
    const h =
      harness();

    const engine =
      loadEngine();

    await engine
      .refundFullPayment(
        h.db,
        h.stripe,
        h.refund,
        USER_ID
      );

    const created =
      h.calls
        .refundCreate[0];

    assert.equal(
      created.options
        .idempotencyKey,
      `kre-full-payment-refund:${REFUND_ID}`
    );

    assert.equal(
      created.params
        .metadata
        .payment_transaction_id,
      TXN_ID
    );

    assert.equal(
      created.params
        .metadata
        .payment_type,
      "full_payment_initial"
    );
  }
);
