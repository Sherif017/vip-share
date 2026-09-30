import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  runInNewContext,
} from "node:vm";
import ts from "typescript";

const EVENT_ID =
  "11111111-1111-4111-8111-111111111111";

const CLUB_ID =
  "22222222-2222-4222-8222-222222222222";

const RESERVATION_ID =
  "33333333-3333-4333-8333-333333333333";

const TXN_ID =
  "44444444-4444-4444-8444-444444444444";

function makeTxn(overrides = {}) {
  return {
    id: TXN_ID,
    reservation_id: RESERVATION_ID,
    event_id: EVENT_ID,
    club_id: CLUB_ID,

    club_net_cents: 17000,
    currency: "eur",

    stripe_account_id:
      "acct_club_test",

    stripe_payment_intent_id:
      "pi_kre_test",

    stripe_charge_id: null,
    stripe_transfer_id: null,

    transfer_group:
      `kre_reservation_${RESERVATION_ID}`,

    transfer_status: "ready",

    ...overrides,
  };
}

function loadModule({
  stripe,
  db,
}) {
  const source =
    readFileSync(
      "lib/stripe-transfers.ts",
      "utf8"
    );

  const transpiled =
    ts.transpileModule(
      source,
      {
        compilerOptions: {
          module:
            ts.ModuleKind.CommonJS,

          target:
            ts.ScriptTarget.ES2022,

          esModuleInterop: true,
        },
      }
    ).outputText;

  const loadedModule = {
    exports: {},
  };

  runInNewContext(
    transpiled,
    {
      module: loadedModule,
      exports:
        loadedModule.exports,

      require(name) {
        if (
          name === "server-only"
        ) {
          return {};
        }

        if (
          name === "@/lib/stripe"
        ) {
          return {
            stripe,
          };
        }

        if (
          name ===
          "@/lib/supabase-admin"
        ) {
          return {
            supabaseAdmin: db,
          };
        }

        throw new Error(
          `Unexpected dependency ${name}`
        );
      },

      console,
      Response,
      URL,
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
        "lib/stripe-transfers.ts",
    }
  );

  return loadedModule.exports;
}

function makeHarness({
  txn = makeTxn(),
  existingTransfers = [],
  createError = null,
  claimOverride = null,
} = {}) {
  const calls = {
    retrieveIntent: [],
    listTransfers: [],
    createTransfer: [],
    updateTransaction: [],
    rpc: [],
  };

  let currentTxn = {
    ...txn,
  };

  const db = {
    from(table) {
      assert.equal(
        table,
        "payment_transactions"
      );

      const query = {
        select() {
          return query;
        },

        eq() {
          return query;
        },

        in() {
          return query;
        },

        order() {
          const eligible =
            ["ready", "failed", "processing"]
              .includes(
                currentTxn
                  .transfer_status
              )
              ? [
                  {
                    ...currentTxn,
                  },
                ]
              : [];

          return Promise.resolve({
            data: eligible,
            error: null,
          });
        },

        update(payload) {
          calls
            .updateTransaction
            .push(payload);

          const updateQuery = {
            eq() {
              return updateQuery;
            },

            is() {
              currentTxn = {
                ...currentTxn,
                ...payload,
              };

              return Promise.resolve({
                data: null,
                error: null,
              });
            },
          };

          return updateQuery;
        },
      };

      return query;
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
        "claim_payment_transfer"
      ) {
        if (claimOverride) {
          return {
            data:
              claimOverride,
            error: null,
          };
        }

        currentTxn = {
          ...currentTxn,
          transfer_status:
            "processing",
        };

        return {
          data: {
            ...currentTxn,
          },
          error: null,
        };
      }

      if (
        name ===
        "complete_payment_transfer"
      ) {
        currentTxn = {
          ...currentTxn,
          stripe_transfer_id:
            args
              .p_stripe_transfer_id,

          stripe_charge_id:
            args
              .p_stripe_charge_id,

          transfer_status:
            "transferred",
        };

        return {
          data: {
            ...currentTxn,
          },
          error: null,
        };
      }

      if (
        name ===
        "fail_payment_transfer"
      ) {
        currentTxn = {
          ...currentTxn,
          transfer_status:
            "failed",
          transfer_last_error:
            args.p_error,
        };

        return {
          data: {
            ...currentTxn,
          },
          error: null,
        };
      }

      if (
        name ===
        "finalize_event_settlement_if_complete"
      ) {
        return {
          data: {
            success: true,
            settled:
              currentTxn
                .transfer_status ===
              "transferred",
          },
          error: null,
        };
      }

      throw new Error(
        `Unexpected RPC ${name}`
      );
    },
  };

  const stripe = {
    accounts: {
      retrieve: async () => ({
        id: "acct_test_club",
        capabilities: {
          transfers: "active",
        },
      }),
    },

    paymentIntents: {
      async retrieve(id) {
        calls
          .retrieveIntent
          .push(id);

        return {
          id,
          latest_charge:
            "ch_kre_test",
        };
      },
    },

    transfers: {
      async list(params) {
        calls
          .listTransfers
          .push(params);

        return {
          data:
            existingTransfers,
        };
      },

      async create(
        params,
        options
      ) {
        calls
          .createTransfer
          .push({
            params,
            options,
          });

        if (createError) {
          throw createError;
        }

        return {
          id:
            "tr_kre_test",

          amount:
            params.amount,

          currency:
            params.currency,

          destination:
            params.destination,

          transfer_group:
            params.transfer_group,

          metadata:
            params.metadata,
        };
      },
    },
  };

  return {
    calls,
    db,
    stripe,

    getTxn() {
      return {
        ...currentTxn,
      };
    },
  };
}

test(
  "1. transfert club = snapshot club_net, destination Connect et source Charge",
  async () => {
    const harness =
      makeHarness();

    const transferModule =
      loadModule(harness);

    const result =
      await transferModule
        .transferApprovedEvent(
          EVENT_ID
        );

    assert.equal(
      result.results.length,
      1
    );

    assert.equal(
      result.results[0]
        .success,
      true
    );

    assert.equal(
      harness.calls
        .createTransfer.length,
      1
    );

    const created =
      harness.calls
        .createTransfer[0];

    assert.equal(
      created.params.amount,
      17000
    );

    assert.equal(
      created.params.currency,
      "eur"
    );

    assert.equal(
      created.params.destination,
      "acct_club_test"
    );

    assert.equal(
      created.params
        .source_transaction,
      "ch_kre_test"
    );

    assert.equal(
      created.params
        .transfer_group,
      `kre_reservation_${RESERVATION_ID}`
    );

    assert.equal(
      created.params.metadata
        .payment_transaction_id,
      TXN_ID
    );

    assert.equal(
      created.options
        .idempotencyKey,
      `kre-transfer:${TXN_ID}`
    );

    assert.equal(
      harness.getTxn()
        .transfer_status,
      "transferred"
    );
  }
);

test(
  "2. réponse Stripe perdue : transfert existant récupéré, aucun doublon créé",
  async () => {
    const existing = {
      id:
        "tr_already_created",

      amount: 17000,
      currency: "eur",

      metadata: {
        payment_transaction_id:
          TXN_ID,
      },
    };

    const harness =
      makeHarness({
        txn:
          makeTxn({
            stripe_charge_id:
              "ch_existing",
            transfer_status:
              "failed",
          }),

        existingTransfers: [
          existing,
        ],
      });

    const transferModule =
      loadModule(harness);

    const result =
      await transferModule
        .transferApprovedEvent(
          EVENT_ID
        );

    assert.equal(
      result.results[0]
        .success,
      true
    );

    assert.equal(
      harness.calls
        .createTransfer.length,
      0
    );

    assert.equal(
      harness.getTxn()
        .stripe_transfer_id,
      "tr_already_created"
    );

    assert.equal(
      harness.getTxn()
        .transfer_status,
      "transferred"
    );
  }
);

test(
  "3. erreur Stripe : transaction repasse failed et reste retryable",
  async () => {
    const harness =
      makeHarness({
        createError:
          new Error(
            "temporary stripe error"
          ),
      });

    const transferModule =
      loadModule(harness);

    const result =
      await transferModule
        .transferApprovedEvent(
          EVENT_ID
        );

    assert.equal(
      result.results[0]
        .success,
      false
    );

    assert.equal(
      harness.getTxn()
        .transfer_status,
      "failed"
    );

    assert.match(
      harness.getTxn()
        .transfer_last_error,
      /temporary stripe error/
    );

    assert.equal(
      harness.calls.rpc
        .filter(
          (call) =>
            call.name ===
            "fail_payment_transfer"
        ).length,
      1
    );
  }
);

test(
  "4. transaction déjà transférée après race : aucun nouvel appel Stripe",
  async () => {
    const harness =
      makeHarness({
        claimOverride:
          makeTxn({
            stripe_charge_id:
              "ch_existing",

            stripe_transfer_id:
              "tr_existing",

            transfer_status:
              "transferred",
          }),
      });

    const transferModule =
      loadModule(harness);

    const result =
      await transferModule
        .transferApprovedEvent(
          EVENT_ID
        );

    assert.equal(
      result.results[0]
        .success,
      true
    );

    assert.equal(
      result.results[0]
        .transferId,
      "tr_existing"
    );

    assert.equal(
      harness.calls
        .createTransfer.length,
      0
    );

    assert.equal(
      harness.calls
        .listTransfers.length,
      0
    );
  }
);

test(
  "5. Charge déjà snapshotée : aucun retrieve PaymentIntent inutile",
  async () => {
    const harness =
      makeHarness({
        txn:
          makeTxn({
            stripe_charge_id:
              "ch_snapshot",
          }),
      });

    const transferModule =
      loadModule(harness);

    await transferModule
      .transferApprovedEvent(
        EVENT_ID
      );

    assert.equal(
      harness.calls
        .retrieveIntent.length,
      0
    );

    assert.equal(
      harness.calls
        .createTransfer[0]
        .params
        .source_transaction,
      "ch_snapshot"
    );
  }
);

test(
  "6. recherche recovery filtrée par transfer_group",
  async () => {
    const harness =
      makeHarness({
        txn:
          makeTxn({
            stripe_charge_id:
              "ch_snapshot",
          }),
      });

    const transferModule =
      loadModule(harness);

    await transferModule
      .transferApprovedEvent(
        EVENT_ID
      );

    assert.equal(
      harness.calls
        .listTransfers[0]
        .transfer_group,
      `kre_reservation_${RESERVATION_ID}`
    );

    assert.equal(
      harness.calls
        .listTransfers[0]
        .limit,
      100
    );
  }
);

test(
  "7. finalisation du settlement appelée après le traitement",
  async () => {
    const harness =
      makeHarness();

    const transferModule =
      loadModule(harness);

    await transferModule
      .transferApprovedEvent(
        EVENT_ID
      );

    const finalize =
      harness.calls.rpc.find(
        (call) =>
          call.name ===
          "finalize_event_settlement_if_complete"
      );

    assert.ok(finalize);

    assert.equal(
      finalize.args
        .p_event_id,
      EVENT_ID
    );
  }
);


test(
  "8. processing abandonné reste visible par le moteur pour récupération",
  async () => {
    const harness =
      makeHarness({
        txn:
          makeTxn({
            stripe_charge_id:
              "ch_stale_processing",

            transfer_status:
              "processing",
          }),
      });

    const transferModule =
      loadModule(harness);

    const result =
      await transferModule
        .transferApprovedEvent(
          EVENT_ID
        );

    assert.equal(
      result.results.length,
      1
    );

    assert.equal(
      result.results[0]
        .success,
      true
    );

    assert.equal(
      harness.calls
        .createTransfer.length,
      1
    );

    assert.equal(
      harness.getTxn()
        .transfer_status,
      "transferred"
    );
  }
);
