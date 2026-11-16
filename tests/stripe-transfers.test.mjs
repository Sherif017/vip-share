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
    transfer_first_requested_at: null,
    transfer_attempt_count: 0,

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
  completeError = null,
  clubOverrides = {},
  accountOverrides = {},
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
      if (table === "clubs") {
        const clubQuery = {
          select() {
            return clubQuery;
          },
          eq() {
            return clubQuery;
          },
          async single() {
            return {
              data: {
                stripe_account_id: txn.stripe_account_id,
                stripe_connection_type: null,
                stripe_oauth_revoked_at: null,
                stripe_charges_enabled: true,
                stripe_payouts_enabled: true,
                ...clubOverrides,
              },
              error: null,
            };
          },
        };

        return clubQuery;
      }

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
          transfer_first_requested_at:
            currentTxn.transfer_first_requested_at ??
            new Date().toISOString(),
          transfer_attempt_count:
            currentTxn.transfer_attempt_count + 1,
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
        if (completeError) {
          return {
            data: null,
            error: completeError,
          };
        }

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
        ...accountOverrides,
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
      async *list(params) {
        calls.listTransfers.push(params);

        for (const transfer of existingTransfers) {
          yield transfer;
        }
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
      destination: "acct_club_test",
      source_transaction: "ch_existing",
      reversed: false,
      amount_reversed: 0,

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
  "3. erreur Stripe incertaine : transaction conserve processing",
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
      "processing"
    );

    assert.match(
      result.results[0].error,
      /temporary stripe error/
    );

    assert.equal(
      harness.calls.createTransfer.length,
      1
    );

    assert.equal(
      harness.calls.rpc
        .filter(
          (call) =>
            call.name ===
            "fail_payment_transfer"
        ).length,
      0
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

            transfer_first_requested_at:
              new Date(
                Date.now() - 60 * 60 * 1000
              ).toISOString(),

            transfer_attempt_count: 1,

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


// ============================================================
// TESTS AVANCES DE SECURITE FINANCIERE ET STRIPE OAUTH
// ============================================================

function recentAttempt(hours = 1) {
  return new Date(
    Date.now() - hours * 60 * 60 * 1000
  ).toISOString();
}

function makeExistingTransfer(overrides = {}) {
  return {
    id: "tr_existing_security",
    amount: 17000,
    currency: "eur",
    destination: "acct_club_test",
    source_transaction: "ch_existing",
    reversed: false,
    amount_reversed: 0,
    metadata: {
      payment_transaction_id: TXN_ID,
    },
    ...overrides,
  };
}

async function runSecurityScenario(options = {}) {
  const harness = makeHarness(options);
  const transferModule = loadModule(harness);
  const result =
    await transferModule.transferApprovedEvent(EVENT_ID);

  assert.equal(result.results.length, 1);

  return {
    harness,
    result: result.results[0],
  };
}

function assertBlocked(harness, result, status, message) {
  assert.equal(result.success, false);
  assert.equal(harness.calls.createTransfer.length, 0);
  assert.equal(harness.getTxn().transfer_status, status);
  assert.match(result.error, message);
}

test("9. Echec de finalisation Supabase : maintien processing", async () => {
  const { harness, result } = await runSecurityScenario({
    completeError: new Error("database unavailable"),
  });

  assert.equal(result.success, false);
  assert.equal(harness.calls.createTransfer.length, 1);
  assert.equal(harness.getTxn().transfer_status, "processing");
  assert.match(result.error, /database unavailable/);

  assert.equal(
    harness.calls.rpc.filter(
      call => call.name === "fail_payment_transfer"
    ).length,
    0
  );
});

test("10. Tentative ancienne de 25 heures : aucun nouveau transfert", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      transfer_status: "processing",
      transfer_attempt_count: 1,
      transfer_first_requested_at: recentAttempt(25),
    }),
  });

  assertBlocked(
    harness, result, "processing",
    /Fenetre de reprise Stripe/
  );
});

test("11. Ancien transfert retrouve : recuperation sans doublon", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      stripe_charge_id: "ch_existing",
      transfer_status: "processing",
      transfer_attempt_count: 3,
      transfer_first_requested_at: recentAttempt(72),
    }),
    existingTransfers: [makeExistingTransfer()],
  });

  assert.equal(result.success, true);
  assert.equal(result.recovered, true);
  assert.equal(harness.calls.createTransfer.length, 0);
  assert.equal(harness.getTxn().transfer_status, "transferred");
});

test("12. Date historique inconnue : blocage preventif", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      transfer_status: "failed",
      transfer_attempt_count: 2,
      transfer_first_requested_at: "1970-01-01T00:00:00Z",
    }),
  });

  assertBlocked(
    harness, result, "processing",
    /Fenetre de reprise Stripe/
  );
});

test("13. Plusieurs transferts retrouves : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      stripe_charge_id: "ch_existing",
    }),
    existingTransfers: [
      makeExistingTransfer(),
      makeExistingTransfer({ id: "tr_duplicate" }),
    ],
  });

  assertBlocked(
    harness, result, "processing",
    /Plusieurs transferts Stripe/
  );
});

test("14. Montant Stripe incoherent : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      stripe_charge_id: "ch_existing",
    }),
    existingTransfers: [
      makeExistingTransfer({ amount: 18000 }),
    ],
  });

  assertBlocked(
    harness, result, "processing",
    /Transfert Stripe existant incoherent/
  );
});

test("15. Destination Stripe incorrecte : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      stripe_charge_id: "ch_existing",
    }),
    existingTransfers: [
      makeExistingTransfer({
        destination: "acct_wrong_club",
      }),
    ],
  });

  assertBlocked(
    harness, result, "processing",
    /Transfert Stripe existant incoherent/
  );
});

test("16. Transfert partiellement annule : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      stripe_charge_id: "ch_existing",
    }),
    existingTransfers: [
      makeExistingTransfer({
        amount_reversed: 1000,
      }),
    ],
  });

  assertBlocked(
    harness, result, "processing",
    /Transfert Stripe existant incoherent/
  );
});

test("17. Compte OAuth revoque : aucun nouveau transfert", async () => {
  const { harness, result } = await runSecurityScenario({
    clubOverrides: {
      stripe_connection_type: "oauth",
      stripe_oauth_revoked_at: new Date().toISOString(),
    },
  });

  assertBlocked(
    harness, result, "failed",
    /revoquee/
  );
});

test("18. Compte OAuth non operationnel : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    clubOverrides: {
      stripe_connection_type: "oauth",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
    },
  });

  assertBlocked(
    harness, result, "failed",
    /pas operationnel/
  );
});

test("19. Compte Stripe du club modifie : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    clubOverrides: {
      stripe_account_id: "acct_another_club",
    },
  });

  assertBlocked(
    harness, result, "failed",
    /ne correspond plus/
  );
});

test("20. Capability transfers inactive : blocage", async () => {
  const { harness, result } = await runSecurityScenario({
    accountOverrides: {
      capabilities: {
        transfers: "inactive",
      },
    },
  });

  assertBlocked(
    harness, result, "failed",
    /transfers du club/
  );
});

test("21. Recuperation d'un transfert apres revocation OAuth", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      stripe_charge_id: "ch_existing",
      transfer_status: "processing",
      transfer_attempt_count: 1,
      transfer_first_requested_at: recentAttempt(2),
    }),
    clubOverrides: {
      stripe_connection_type: "oauth",
      stripe_oauth_revoked_at: new Date().toISOString(),
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
    },
    existingTransfers: [makeExistingTransfer()],
  });

  assert.equal(result.success, true);
  assert.equal(result.recovered, true);
  assert.equal(harness.calls.createTransfer.length, 0);
  assert.equal(harness.getTxn().transfer_status, "transferred");
});

test("22. Reprise incertaine apres revocation : maintien processing", async () => {
  const { harness, result } = await runSecurityScenario({
    txn: makeTxn({
      transfer_status: "processing",
      transfer_attempt_count: 1,
      transfer_first_requested_at: recentAttempt(2),
    }),
    clubOverrides: {
      stripe_connection_type: "oauth",
      stripe_oauth_revoked_at: new Date().toISOString(),
    },
  });

  assertBlocked(
    harness, result, "processing",
    /revoquee/
  );
});
