import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

const CLUB_ID =
  "22222222-2222-4222-8222-222222222222";

const ACCOUNT_ID = "acct_testclub";

const REDIRECT_URI =
  "https://example.test/api/stripe/connect/callback";

function loadModule(file, dependencies = {}, env = {}) {
  const source = readFileSync(file, "utf8");

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const loadedModule = { exports: {} };

  runInNewContext(
    transpiled,
    {
      module: loadedModule,
      exports: loadedModule.exports,

      require(name) {
        if (name === "server-only") return {};
        if (name === "node:crypto") return crypto;

        if (Object.hasOwn(dependencies, name)) {
          return dependencies[name];
        }

        throw new Error(`Unexpected dependency: ${name}`);
      },

      process: { env: { ...env } },
      URL,
      Request,
      Response,
      Headers,
      Error,
      console,
    },
    { filename: file }
  );

  return loadedModule.exports;
}

// ============================================================
// 1. UTILITAIRES OAUTH
// ============================================================

function makeOAuthHarness({
  env = {},
  tokenResponse = {
    stripe_user_id: ACCOUNT_ID,
    livemode: false,
    scope: "read_write",
  },
  tokenError = null,
} = {}) {
  const calls = [];

  const stripe = {
    oauth: {
      async token(payload) {
        calls.push(payload);
        if (tokenError) throw tokenError;
        return tokenResponse;
      },
    },
  };

  const oauth = loadModule(
    "lib/stripe-oauth.ts",
    {
      "@/lib/stripe": { stripe },
    },
    {
      STRIPE_CONNECT_OAUTH_ENABLED: "true",
      STRIPE_CONNECT_CLIENT_ID: "ca_fake_client",
      STRIPE_CONNECT_REDIRECT_URI: REDIRECT_URI,
      ...env,
    }
  );

  return { oauth, calls };
}

test("1. OAuth active uniquement avec true", () => {
  for (const value of ["false", "", "1", "TRUE", undefined]) {
    const { oauth } = makeOAuthHarness({
      env: { STRIPE_CONNECT_OAUTH_ENABLED: value },
    });

    assert.equal(oauth.isStripeOAuthEnabled(), false);
  }

  const { oauth } = makeOAuthHarness();
  assert.equal(oauth.isStripeOAuthEnabled(), true);
});

test("2. State OAuth aleatoire de 256 bits", () => {
  const { oauth } = makeOAuthHarness();

  const states = Array.from(
    { length: 100 },
    () => oauth.createOAuthState()
  );

  for (const state of states) {
    assert.match(state, /^[a-f0-9]{64}$/);
  }

  assert.equal(new Set(states).size, 100);
});

test("3. State stocke sous forme de hash SHA-256", () => {
  const { oauth } = makeOAuthHarness();
  const state = oauth.createOAuthState();

  const hash = oauth.hashOAuthState(state);

  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, state);

  assert.equal(
    hash,
    crypto.createHash("sha256").update(state).digest("hex")
  );

  assert.equal(oauth.hashOAuthState(state), hash);
});

test("4. URL Stripe OAuth correctement configuree", () => {
  const { oauth } = makeOAuthHarness();

  const state = oauth.createOAuthState();
  const url = new URL(oauth.createStripeOAuthUrl(state));

  assert.equal(url.origin, "https://connect.stripe.com");
  assert.equal(url.pathname, "/oauth/authorize");

  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "ca_fake_client");
  assert.equal(url.searchParams.get("scope"), "read_write");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("state"), state);
});

test("5. OAuth desactive : creation URL interdite", () => {
  const { oauth } = makeOAuthHarness({
    env: { STRIPE_CONNECT_OAUTH_ENABLED: "false" },
  });

  assert.throws(
    () => oauth.createStripeOAuthUrl("fake-state"),
    /désactivée/
  );
});

test("6. Configuration OAuth incomplete : refus", () => {
  for (const key of [
    "STRIPE_CONNECT_CLIENT_ID",
    "STRIPE_CONNECT_REDIRECT_URI",
  ]) {
    const { oauth } = makeOAuthHarness({
      env: { [key]: "" },
    });

    assert.throws(
      () => oauth.createStripeOAuthUrl("fake-state"),
      /incomplète/
    );
  }
});

test("7. Echange du code OAuth : compte correctement retourne", async () => {
  const { oauth, calls } = makeOAuthHarness();

  const result = await oauth.exchangeStripeOAuthCode("fake-code");

  assert.equal(result.stripeAccountId, ACCOUNT_ID);
  assert.equal(result.livemode, false);
  assert.equal(result.scope, "read_write");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].grant_type, "authorization_code");
  assert.equal(calls[0].code, "fake-code");
});

test("8. Reponse OAuth sans compte Stripe : refus", async () => {
  const { oauth } = makeOAuthHarness({
    tokenResponse: {},
  });

  await assert.rejects(
    () => oauth.exchangeStripeOAuthCode("fake-code"),
    /Compte Stripe introuvable/
  );
});

test("9. Echec Stripe lors de l'echange OAuth", async () => {
  const { oauth } = makeOAuthHarness({
    tokenError: new Error("invalid_grant"),
  });

  await assert.rejects(
    () => oauth.exchangeStripeOAuthCode("fake-code"),
    /invalid_grant/
  );
});

// ============================================================
// 2. ELIGIBILITE DES ETABLISSEMENTS
// ============================================================

function makeClub(overrides = {}) {
  return {
    id: CLUB_ID,
    stripe_account_id: null,
    stripe_charges_enabled: false,
    stripe_payouts_enabled: false,
    stripe_details_submitted: false,
    stripe_onboarding_status: "not_started",
    stripe_connection_type: null,
    stripe_oauth_revoked_at: null,
    ...overrides,
  };
}

function makeEligibilityHarness({
  club = makeClub(),
  count = 0,
  clubError = null,
  transactionError = null,
  accountError = null,
  account = {
    id: ACCOUNT_ID,
    controller: {
      stripe_dashboard: { type: "express" },
    },
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
  },
} = {}) {
  const calls = {
    clubs: [],
    transactions: [],
    stripe: [],
  };

  const db = {
    from(table) {
      if (table === "clubs") {
        return {
          select() {
            return this;
          },

          eq(key, value) {
            calls.clubs.push({ key, value });
            return this;
          },

          async maybeSingle() {
            return {
              data: club,
              error: clubError,
            };
          },
        };
      }

      if (table === "payment_transactions") {
        return {
          select() {
            return this;
          },

          async eq(key, value) {
            calls.transactions.push({ key, value });

            return {
              count,
              error: transactionError,
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const stripe = {
    accounts: {
      async retrieve(id) {
        calls.stripe.push(id);
        if (accountError) throw accountError;
        return account;
      },
    },
  };

  const eligibility = loadModule(
    "lib/stripe-oauth-eligibility.ts",
    {
      "@/lib/stripe": { stripe },
      "@/lib/supabase-admin": { supabaseAdmin: db },
    }
  );

  return { eligibility, calls };
}

async function checkEligibility(options = {}) {
  const harness = makeEligibilityHarness(options);

  const result =
    await harness.eligibility.checkStripeOAuthEligibility(CLUB_ID);

  return { result, calls: harness.calls };
}

test("10. Nouveau club sans historique : eligible", async () => {
  const { result, calls } = await checkEligibility();

  assert.equal(result.allowed, true);
  assert.equal(result.accountId, null);
  assert.equal(calls.stripe.length, 0);
  assert.equal(calls.transactions.length, 1);
  assert.equal(calls.transactions[0].value, CLUB_ID);
});

test("11. Club inexistant : refus", async () => {
  const { result, calls } = await checkEligibility({
    club: null,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "club_not_found");
  assert.equal(calls.stripe.length, 0);
});

test("12. Compte Stripe actif : remplacement interdit", async () => {
  for (const flags of [
    { stripe_charges_enabled: true },
    { stripe_payouts_enabled: true },
    { stripe_details_submitted: true },
    { stripe_onboarding_status: "complete" },
  ]) {
    const { result } = await checkEligibility({
      club: makeClub({
        stripe_account_id: ACCOUNT_ID,
        ...flags,
      }),
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "already_active");
  }
});

test("13. Historique financier : remplacement interdit", async () => {
  const { result, calls } = await checkEligibility({
    count: 5,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "financial_history");
  assert.equal(calls.stripe.length, 0);
});

test("14. Historique financier inconnu : refus preventif", async () => {
  const { result } = await checkEligibility({
    count: null,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "financial_history");
});

test("15. Compte Express incomplet et inutilise : eligible", async () => {
  const { result, calls } = await checkEligibility({
    club: makeClub({
      stripe_account_id: ACCOUNT_ID,
      stripe_onboarding_status: "pending",
    }),
  });

  assert.equal(result.allowed, true);
  assert.equal(result.accountId, ACCOUNT_ID);
  assert.equal(calls.stripe.length, 1);
  assert.equal(calls.stripe[0], ACCOUNT_ID);
});

test("16. Compte Express actif chez Stripe : remplacement interdit", async () => {
  for (const flags of [
    { charges_enabled: true },
    { payouts_enabled: true },
    { details_submitted: true },
  ]) {
    const { result } = await checkEligibility({
      club: makeClub({
        stripe_account_id: ACCOUNT_ID,
      }),
      account: {
        controller: {
          stripe_dashboard: { type: "express" },
        },
        ...flags,
      },
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "account_not_replaceable");
  }
});

test("17. Compte non Express existant : remplacement interdit", async () => {
  const { result } = await checkEligibility({
    club: makeClub({
      stripe_account_id: ACCOUNT_ID,
    }),
    account: {
      controller: {
        stripe_dashboard: { type: "full" },
      },
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "account_not_replaceable");
});

test("18. Compte OAuth actif : changement interdit", async () => {
  const { result } = await checkEligibility({
    club: makeClub({
      stripe_account_id: ACCOUNT_ID,
      stripe_connection_type: "oauth",
    }),
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "already_active");
});

test("19. OAuth revoque : reconnexion autorisee avec historique", async () => {
  const { result, calls } = await checkEligibility({
    club: makeClub({
      stripe_account_id: ACCOUNT_ID,
      stripe_connection_type: "oauth",
      stripe_oauth_revoked_at: new Date().toISOString(),
    }),
    count: 20,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reconnect, true);
  assert.equal(result.accountId, ACCOUNT_ID);
  assert.equal(calls.transactions.length, 0);
});

test("20. OAuth revoque sans identifiant de compte : refus", async () => {
  const { result } = await checkEligibility({
    club: makeClub({
      stripe_connection_type: "oauth",
      stripe_oauth_revoked_at: new Date().toISOString(),
    }),
  });

  assert.equal(result.allowed, false);
});

test("21. Erreur Supabase : aucune autorisation implicite", async () => {
  for (const options of [
    { clubError: new Error("database unavailable") },
    { transactionError: new Error("database unavailable") },
  ]) {
    await assert.rejects(
      () => checkEligibility(options),
      /database unavailable/
    );
  }
});

test("22. Erreur Stripe : aucun remplacement implicite", async () => {
  await assert.rejects(
    () => checkEligibility({
      club: makeClub({
        stripe_account_id: ACCOUNT_ID,
      }),
      accountError: new Error("stripe unavailable"),
    }),
    /stripe unavailable/
  );
});


// ============================================================
// TESTS DES ROUTES OAUTH
// ============================================================

const USER_ID =
  "11111111-1111-4111-8111-111111111111";

const STATE_ID =
  "33333333-3333-4333-8333-333333333333";

const VALID_STATE = "a".repeat(64);

const ORIGIN = new URL(REDIRECT_URI).origin;

const mockNextResponse = {
  json(body, options = {}) {
    return Response.json(body, options);
  },

  redirect(url, status = 307) {
    return new Response(null, {
      status,
      headers: {
        Location: String(url),
      },
    });
  },
};

function makeReadyAccount(overrides = {}) {
  return {
    id: ACCOUNT_ID,
    country: "FR",
    controller: {
      stripe_dashboard: { type: "full" },
    },
    capabilities: { transfers: "active" },
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    ...overrides,
  };
}

function makeRouteHarness({
  enabled = true,
  access = {
    userId: USER_ID,
    isManager: false,
    managedClubIds: [CLUB_ID],
  },
  eligibility = {
    allowed: true,
    reason: null,
    accountId: null,
  },
  finalEligibility = null,
  authorization = {
    id: STATE_ID,
    club_id: CLUB_ID,
    expected_account_id: null,
  },
  stateError = null,
  insertError = null,
  linkError = null,
  tokenError = null,
  tokenResponse = {
    stripe_user_id: ACCOUNT_ID,
    livemode: false,
    scope: "read_write",
  },
  account = makeReadyAccount(),
  platformId = "acct_platform",
} = {}) {
  const calls = {
    insert: [],
    consume: [],
    link: [],
    token: [],
    accounts: [],
    eligibility: [],
  };

  let stateConsumed = false;

  const env = {
    STRIPE_CONNECT_OAUTH_ENABLED:
      enabled ? "true" : "false",
    STRIPE_CONNECT_CLIENT_ID: "ca_fake_client",
    STRIPE_CONNECT_REDIRECT_URI: REDIRECT_URI,
    STRIPE_SECRET_KEY: "sk_test_fake",
  };

  const stripe = {
    oauth: {
      async token(payload) {
        calls.token.push(payload);
        if (tokenError) throw tokenError;
        return tokenResponse;
      },
    },

    accounts: {
      async retrieve(id) {
        calls.accounts.push(id);

        return id === null
          ? { id: platformId }
          : account;
      },
    },
  };

  const db = {
    from(table) {
      assert.equal(table, "stripe_oauth_states");

      return {
        async insert(payload) {
          calls.insert.push(payload);
          return { error: insertError };
        },
      };
    },

    rpc(name, args) {
      if (name === "consume_stripe_oauth_state") {
        calls.consume.push(args);

        return {
          async maybeSingle() {
            if (stateError) {
              return { data: null, error: stateError };
            }

            if (stateConsumed) {
              return { data: null, error: null };
            }

            stateConsumed = true;

            return {
              data: authorization,
              error: null,
            };
          },
        };
      }

      if (name === "link_club_stripe_oauth_account") {
        calls.link.push(args);

        return Promise.resolve({
          error: linkError,
        });
      }

      throw new Error(`Unexpected RPC: ${name}`);
    },
  };

  const oauth = loadModule(
    "lib/stripe-oauth.ts",
    { "@/lib/stripe": { stripe } },
    env
  );

  const accessModule = loadModule(
    "lib/admin-access.ts",
    {
      "@/lib/supabase/server": {},
      "@/lib/supabase-admin": { supabaseAdmin: db },
    },
    env
  );

  const dependencies = {
    "next/server": {
      NextResponse: mockNextResponse,
    },

    "@/lib/stripe": { stripe },

    "@/lib/supabase-admin": {
      supabaseAdmin: db,
    },

    "@/lib/stripe-oauth": oauth,

    "@/lib/admin-access": {
      getAdminAccess: async () => access,
      canManageClub: accessModule.canManageClub,
    },

    "@/lib/stripe-oauth-eligibility": {
      async checkStripeOAuthEligibility(clubId) {
        calls.eligibility.push(clubId);

        return calls.eligibility.length > 1
          ? finalEligibility ?? eligibility
          : eligibility;
      },
    },
  };

  const startRoute = loadModule(
    "app/api/admin/clubs/[id]/stripe-oauth/route.ts",
    dependencies,
    env
  );

  const callbackRoute = loadModule(
    "app/api/stripe/connect/callback/route.ts",
    dependencies,
    env
  );

  async function start(origin = ORIGIN) {
    return startRoute.POST(
      new Request(
        `${ORIGIN}/api/admin/clubs/${CLUB_ID}/stripe-oauth`,
        {
          method: "POST",
          headers: { Origin: origin },
        }
      ),
      {
        params: Promise.resolve({ id: CLUB_ID }),
      }
    );
  }

  async function callback(params = {
    state: VALID_STATE,
    code: "fake-code",
  }) {
    const url = new URL(REDIRECT_URI);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return callbackRoute.GET(new Request(url));
  }

  return { calls, start, callback };
}

function callbackStatus(response) {
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store"
  );

  assert.equal(
    response.headers.get("Referrer-Policy"),
    "no-referrer"
  );

  const url = new URL(response.headers.get("Location"));

  assert.equal(url.origin, ORIGIN);
  assert.equal(url.pathname, "/admin");
  assert.equal(url.searchParams.has("code"), false);
  assert.equal(url.searchParams.has("state"), false);

  return url.searchParams.get("stripe_oauth");
}

// ============================================================
// INITIALISATION OAUTH
// ============================================================

test("23. Initialisation OAuth valide : state securise", async () => {
  const h = makeRouteHarness();

  const response = await h.start();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store"
  );

  const body = await response.json();
  const url = new URL(body.url);
  const state = url.searchParams.get("state");

  assert.match(state, /^[a-f0-9]{64}$/);
  assert.equal(h.calls.insert.length, 1);

  const stored = h.calls.insert[0];

  assert.equal(stored.club_id, CLUB_ID);
  assert.equal(stored.user_id, USER_ID);
  assert.equal(stored.expected_account_id, null);

  assert.equal(
    stored.state_hash,
    crypto.createHash("sha256").update(state).digest("hex")
  );

  assert.equal("state" in stored, false);
});

test("24. Initialisation OAuth desactivee : refus", async () => {
  const h = makeRouteHarness({ enabled: false });

  assert.equal((await h.start()).status, 503);
  assert.equal(h.calls.insert.length, 0);
});

test("25. Organisateur non authentifie : refus", async () => {
  const h = makeRouteHarness({ access: null });

  assert.equal((await h.start()).status, 401);
  assert.equal(h.calls.insert.length, 0);
});

test("26. Organisateur non autorise ou scanner : refus", async () => {
  const h = makeRouteHarness({
    access: {
      userId: USER_ID,
      isManager: false,
      managedClubIds: [],
      scannerClubIds: [CLUB_ID],
    },
  });

  assert.equal((await h.start()).status, 403);
  assert.equal(h.calls.insert.length, 0);
});

test("27. Origine externe : protection CSRF", async () => {
  const h = makeRouteHarness();

  assert.equal(
    (await h.start("https://external.example")).status,
    403
  );

  assert.equal(h.calls.insert.length, 0);
});

test("28. Club non eligible : aucun state cree", async () => {
  const h = makeRouteHarness({
    eligibility: {
      allowed: false,
      reason: "financial_history",
      accountId: ACCOUNT_ID,
    },
  });

  const response = await h.start();

  assert.equal(response.status, 409);
  assert.equal(
    (await response.json()).reason,
    "financial_history"
  );

  assert.equal(h.calls.insert.length, 0);
});

test("29. Erreur stockage du state : aucune URL retournee", async () => {
  const h = makeRouteHarness({
    insertError: new Error("database unavailable"),
  });

  const response = await h.start();

  assert.equal(response.status, 500);
  assert.equal("url" in await response.json(), false);
});

// ============================================================
// CALLBACK OAUTH
// ============================================================

test("30. Callback valide : association du compte existant", async () => {
  const h = makeRouteHarness();

  assert.equal(
    callbackStatus(await h.callback()),
    "success"
  );

  assert.equal(h.calls.consume.length, 1);
  assert.equal(h.calls.token.length, 1);
  assert.equal(h.calls.link.length, 1);
  assert.equal(h.calls.eligibility.length, 2);

  const args = h.calls.link[0];

  assert.equal(args.p_club_id, CLUB_ID);
  assert.equal(args.p_user_id, USER_ID);
  assert.equal(args.p_state_id, STATE_ID);
  assert.equal(args.p_stripe_account_id, ACCOUNT_ID);
  assert.equal(args.p_expected_account_id, null);
});

test("31. State absent ou malforme : refus avant Stripe", async () => {
  const h = makeRouteHarness();

  for (const params of [
    { code: "fake-code" },
    { state: "invalid", code: "fake-code" },
  ]) {
    assert.equal(
      callbackStatus(await h.callback(params)),
      "invalid_state"
    );
  }

  assert.equal(h.calls.consume.length, 0);
  assert.equal(h.calls.token.length, 0);
});

test("32. State expire ou introuvable : refus", async () => {
  const h = makeRouteHarness({
    authorization: null,
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "invalid_state"
  );

  assert.equal(h.calls.token.length, 0);
  assert.equal(h.calls.link.length, 0);
});

test("33. State deja consomme : aucun second echange OAuth", async () => {
  const h = makeRouteHarness();

  assert.equal(
    callbackStatus(await h.callback()),
    "success"
  );

  assert.equal(
    callbackStatus(await h.callback()),
    "invalid_state"
  );

  assert.equal(h.calls.token.length, 1);
  assert.equal(h.calls.link.length, 1);
});

test("34. Permissions retirees avant callback : refus", async () => {
  const h = makeRouteHarness({
    access: {
      userId: USER_ID,
      isManager: false,
      managedClubIds: [],
    },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "unauthorized"
  );

  assert.equal(h.calls.token.length, 0);
});

test("35. Annulation Stripe : aucune association", async () => {
  const h = makeRouteHarness();

  assert.equal(
    callbackStatus(await h.callback({
      state: VALID_STATE,
      error: "access_denied",
    })),
    "cancelled"
  );

  assert.equal(h.calls.token.length, 0);
  assert.equal(h.calls.link.length, 0);
});

test("36. Compte deja associe a un autre club : refus", async () => {
  const h = makeRouteHarness({
    linkError: { code: "23505" },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "account_in_use"
  );
});

test("37. Compte modifie pendant OAuth : refus", async () => {
  const h = makeRouteHarness({
    finalEligibility: {
      allowed: true,
      accountId: "acct_anotherclub",
    },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "account_changed"
  );

  assert.equal(h.calls.link.length, 0);
});

test("38. Mode Stripe incompatible : refus", async () => {
  const h = makeRouteHarness({
    tokenResponse: {
      stripe_user_id: ACCOUNT_ID,
      livemode: true,
      scope: "read_write",
    },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "incompatible"
  );

  assert.equal(h.calls.accounts.length, 0);
  assert.equal(h.calls.link.length, 0);
});

test("39. Autorisation Stripe read_only : refus", async () => {
  const h = makeRouteHarness({
    tokenResponse: {
      stripe_user_id: ACCOUNT_ID,
      livemode: false,
      scope: "read_only",
    },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "incompatible"
  );

  assert.equal(h.calls.link.length, 0);
});

test("40. Compte Stripe incompatible ou non operationnel", async () => {
  for (const overrides of [
    { country: "US" },
    { charges_enabled: false },
    { payouts_enabled: false },
    { details_submitted: false },
    { capabilities: { transfers: "inactive" } },
    { controller: {
      stripe_dashboard: { type: "express" },
    } },
  ]) {
    const h = makeRouteHarness({
      account: makeReadyAccount(overrides),
    });

    assert.equal(
      callbackStatus(await h.callback()),
      "incompatible"
    );

    assert.equal(h.calls.link.length, 0);
  }
});

test("41. Compte Stripe de K-RE lui-meme : refus", async () => {
  const h = makeRouteHarness({
    platformId: ACCOUNT_ID,
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "incompatible"
  );

  assert.equal(h.calls.link.length, 0);
});

test("42. Reconnexion du meme compte OAuth : autorisee", async () => {
  const h = makeRouteHarness({
    eligibility: {
      allowed: true,
      accountId: ACCOUNT_ID,
      reconnect: true,
    },
    authorization: {
      id: STATE_ID,
      club_id: CLUB_ID,
      expected_account_id: ACCOUNT_ID,
    },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "success"
  );

  assert.equal(
    h.calls.link[0].p_expected_account_id,
    ACCOUNT_ID
  );
});

test("43. Reconnexion avec un autre compte Stripe : refus", async () => {
  const h = makeRouteHarness({
    eligibility: {
      allowed: true,
      accountId: "acct_previous",
      reconnect: true,
    },
    authorization: {
      id: STATE_ID,
      club_id: CLUB_ID,
      expected_account_id: "acct_previous",
    },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "wrong_account"
  );

  assert.equal(h.calls.link.length, 0);
});

test("44. Erreur pendant echange OAuth : aucune association", async () => {
  const h = makeRouteHarness({
    tokenError: new Error("invalid_grant"),
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "failed"
  );

  assert.equal(h.calls.link.length, 0);
});

test("45. Conflit SQL concurrent : callback refuse", async () => {
  const h = makeRouteHarness({
    linkError: { code: "55000" },
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "account_changed"
  );
});

test("46. Fonctionnalite desactivee pendant OAuth", async () => {
  const h = makeRouteHarness({
    enabled: false,
  });

  assert.equal(
    callbackStatus(await h.callback()),
    "disabled"
  );

  assert.equal(h.calls.consume.length, 0);
  assert.equal(h.calls.token.length, 0);
});


// ============================================================
// TESTS DES WEBHOOKS CONNECT
// ============================================================

function makeConnectEvent(overrides = {}) {
  return {
    id: "evt_fakeconnect",
    type: "account.application.deauthorized",
    account: ACCOUNT_ID,
    livemode: false,
    created: 1794840000,
    data: {
      object: {},
    },
    ...overrides,
  };
}

function makeWebhookHarness({
  event = makeConnectEvent(),
  secret = "whsec_fake_connect",
  key = "sk_test_fake",
  signatureError = null,
  rpcError = null,
  clubError = null,
  retrieveError = null,
  snapshotError = null,
  club = {
    id: CLUB_ID,
    stripe_oauth_revoked_at: null,
    stripe_connection_type: "oauth",
  },
} = {}) {
  const calls = {
    signatures: [],
    rpc: [],
    clubs: [],
    accounts: [],
    snapshots: [],
  };

  const processedEvents = new Set();

  const stripe = {
    webhooks: {
      constructEvent(body, signature, webhookSecret) {
        calls.signatures.push({
          body,
          signature,
          secret: webhookSecret,
        });

        if (signatureError) throw signatureError;

        return event;
      },
    },

    accounts: {
      async retrieve(id) {
        calls.accounts.push(id);

        if (retrieveError) throw retrieveError;

        return makeReadyAccount({ id });
      },
    },
  };

  const db = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });

      assert.equal(
        name,
        "record_stripe_oauth_revocation"
      );

      if (rpcError) {
        return { data: null, error: rpcError };
      }

      const duplicate = processedEvents.has(
        args.p_stripe_event_id
      );

      processedEvents.add(args.p_stripe_event_id);

      return {
        data: {
          duplicate,
          updated: duplicate ? 0 : 1,
        },
        error: null,
      };
    },

    from(table) {
      assert.equal(table, "clubs");

      return {
        select() {
          return this;
        },

        eq(column, value) {
          calls.clubs.push({ column, value });
          return this;
        },

        async maybeSingle() {
          return {
            data: club,
            error: clubError,
          };
        },
      };
    },
  };

  const route = loadModule(
    "app/api/stripe/connect/webhook/route.ts",
    {
      "next/server": {
        NextResponse: mockNextResponse,
      },

      "stripe": {},

      "@/lib/stripe": { stripe },

      "@/lib/supabase-admin": {
        supabaseAdmin: db,
      },

      "@/lib/stripe-connect": {
        async applyStripeAccountSnapshot(account) {
          calls.snapshots.push(account);

          if (snapshotError) throw snapshotError;

          return { id: CLUB_ID };
        },
      },
    },
    {
      STRIPE_CONNECT_WEBHOOK_SECRET: secret,
      STRIPE_SECRET_KEY: key,
    }
  );

  async function send(signature = "fake-signature") {
    const headers = {
      "Content-Type": "application/json",
    };

    if (signature !== null) {
      headers["stripe-signature"] = signature;
    }

    return route.POST(
      new Request(
        `${ORIGIN}/api/stripe/connect/webhook`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(event),
        }
      )
    );
  }

  return { calls, send, processedEvents };
}

test("47. Webhook Connect non configure : refus", async () => {
  const h = makeWebhookHarness({ secret: "" });

  assert.equal((await h.send()).status, 503);
  assert.equal(h.calls.signatures.length, 0);
  assert.equal(h.calls.rpc.length, 0);
});

test("48. Webhook sans signature : refus", async () => {
  const h = makeWebhookHarness();

  assert.equal((await h.send(null)).status, 400);
  assert.equal(h.calls.signatures.length, 0);
  assert.equal(h.calls.rpc.length, 0);
});

test("49. Signature Stripe invalide : refus", async () => {
  const h = makeWebhookHarness({
    signatureError: new Error("invalid signature"),
  });

  assert.equal((await h.send()).status, 400);
  assert.equal(h.calls.rpc.length, 0);
  assert.equal(h.calls.snapshots.length, 0);
});

test("50. Secret specifique Connect utilise", async () => {
  const h = makeWebhookHarness();

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.signatures.length, 1);

  assert.equal(
    h.calls.signatures[0].secret,
    "whsec_fake_connect"
  );

  assert.equal(
    h.calls.signatures[0].signature,
    "fake-signature"
  );
});

test("51. Evenement live sur environnement test : ignore", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({ livemode: true }),
  });

  const response = await h.send();

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
  assert.equal(h.calls.rpc.length, 0);
});

test("52. Evenement test sur environnement live : ignore", async () => {
  const h = makeWebhookHarness({
    key: "sk_live_fake",
  });

  const response = await h.send();

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
  assert.equal(h.calls.rpc.length, 0);
});

test("53. Revocation OAuth transmise a la RPC atomique", async () => {
  const event = makeConnectEvent();
  const h = makeWebhookHarness({ event });

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.rpc.length, 1);

  const call = h.calls.rpc[0];

  assert.equal(
    call.name,
    "record_stripe_oauth_revocation"
  );

  assert.equal(call.args.p_stripe_event_id, event.id);

  assert.equal(
    call.args.p_stripe_account_id,
    ACCOUNT_ID
  );

  assert.equal(
    call.args.p_revoked_at,
    new Date(event.created * 1000).toISOString()
  );

  assert.equal(h.calls.accounts.length, 0);
});

test("54. Webhook repete : meme identifiant transmis", async () => {
  const h = makeWebhookHarness();

  assert.equal((await h.send()).status, 200);
  assert.equal((await h.send()).status, 200);

  assert.equal(h.calls.rpc.length, 2);
  assert.equal(h.processedEvents.size, 1);

  assert.equal(
    h.calls.rpc[0].args.p_stripe_event_id,
    h.calls.rpc[1].args.p_stripe_event_id
  );
});

test("55. Revocation sans compte valide : erreur", async () => {
  for (const account of [null, "", "invalid"]) {
    const h = makeWebhookHarness({
      event: makeConnectEvent({ account }),
    });

    assert.equal((await h.send()).status, 500);
    assert.equal(h.calls.rpc.length, 0);
  }
});

test("56. RPC de revocation indisponible : erreur retryable", async () => {
  const h = makeWebhookHarness({
    rpcError: new Error("database unavailable"),
  });

  assert.equal((await h.send()).status, 500);
  assert.equal(h.calls.rpc.length, 1);
});

test("57. account.updated : synchronisation du compte reel", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "account.updated",
    }),
  });

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.accounts.length, 1);
  assert.equal(h.calls.accounts[0], ACCOUNT_ID);

  assert.equal(h.calls.snapshots.length, 1);
  assert.equal(h.calls.snapshots[0].id, ACCOUNT_ID);
  assert.equal(h.calls.rpc.length, 0);
});

test("58. capability.updated : synchronisation du compte reel", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "capability.updated",
    }),
  });

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.accounts.length, 1);
  assert.equal(h.calls.snapshots.length, 1);
});

test("59. Ancien account.updated sur compte revoque : ignore", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "account.updated",
    }),

    club: {
      id: CLUB_ID,
      stripe_connection_type: "oauth",
      stripe_oauth_revoked_at:
        new Date().toISOString(),
    },
  });

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.accounts.length, 0);
  assert.equal(h.calls.snapshots.length, 0);
});

test("60. Compte sans club associe : ignore", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "account.updated",
    }),
    club: null,
  });

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.accounts.length, 0);
  assert.equal(h.calls.snapshots.length, 0);
});

test("61. Erreur de lecture Supabase : webhook retryable", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "account.updated",
    }),
    clubError: new Error("database unavailable"),
  });

  assert.equal((await h.send()).status, 500);
  assert.equal(h.calls.snapshots.length, 0);
});

test("62. Erreur de lecture Stripe : webhook retryable", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "account.updated",
    }),
    retrieveError: new Error("stripe unavailable"),
  });

  assert.equal((await h.send()).status, 500);
  assert.equal(h.calls.snapshots.length, 0);
});

test("63. Erreur de synchronisation : webhook retryable", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "account.updated",
    }),
    snapshotError: new Error("update failed"),
  });

  assert.equal((await h.send()).status, 500);
  assert.equal(h.calls.snapshots.length, 1);
});

test("64. Evenement sans rapport avec Connect : ignore", async () => {
  const h = makeWebhookHarness({
    event: makeConnectEvent({
      type: "payment_intent.succeeded",
    }),
  });

  assert.equal((await h.send()).status, 200);
  assert.equal(h.calls.rpc.length, 0);
  assert.equal(h.calls.accounts.length, 0);
  assert.equal(h.calls.snapshots.length, 0);
});


// ============================================================
// TESTS DE SYNCHRONISATION STRIPE
// ============================================================

function makeSyncHarness({
  club = {
    id: CLUB_ID,
    name: "Test Club",
    stripe_connection_type: null,
    stripe_oauth_revoked_at: null,
    stripe_oauth_connected_at: null,
  },
  account = makeReadyAccount(),
  clubError = null,
  updateError = null,
  retrieveError = null,
  concurrentChanges = {},
} = {}) {
  const calls = {
    retrieve: [],
    updates: [],
    filters: [],
  };

  let currentClub = club
    ? {
        stripe_account_id: ACCOUNT_ID,
        ...club,
      }
    : null;

  const stripe = {
    accounts: {
      async retrieve(id) {
        calls.retrieve.push(id);

        if (retrieveError) throw retrieveError;

        return account;
      },
    },
  };

  const db = {
    from(table) {
      assert.equal(table, "clubs");

      let payload = null;
      const filters = [];

      const query = {
        select() {
          return query;
        },

        eq(column, value) {
          filters.push({ column, value });
          return query;
        },

        is(column, value) {
          filters.push({ column, value });
          return query;
        },

        update(data) {
          payload = data;
          calls.updates.push(data);
          return query;
        },

        async maybeSingle() {
          if (!payload) {
            return {
              data: currentClub
                ? { ...currentClub }
                : null,
              error: clubError,
            };
          }

          calls.filters.push(...filters);

          if (updateError) {
            return {
              data: null,
              error: updateError,
            };
          }

          currentClub = {
            ...currentClub,
            ...concurrentChanges,
          };

          const matches = filters.every(
            ({ column, value }) =>
              currentClub[column] === value
          );

          if (!matches) {
            return { data: null, error: null };
          }

          currentClub = {
            ...currentClub,
            ...payload,
          };

          return {
            data: {
              id: currentClub.id,
              name: currentClub.name,
            },
            error: null,
          };
        },
      };

      return query;
    },
  };

  const connect = loadModule(
    "lib/stripe-connect.ts",
    {
      "@/lib/stripe": { stripe },
      "@/lib/supabase-admin": {
        supabaseAdmin: db,
      },
    }
  );

  return {
    connect,
    calls,
    getClub: () => currentClub,
  };
}

function makeOAuthClub(overrides = {}) {
  return {
    id: CLUB_ID,
    name: "Test Club",
    stripe_connection_type: "oauth",
    stripe_oauth_revoked_at: null,
    stripe_oauth_connected_at:
      "2026-11-16T12:00:00Z",
    ...overrides,
  };
}

test("65. Express historique : synchronisation preservee", async () => {
  const h = makeSyncHarness();

  await h.connect.applyStripeAccountSnapshot({
    id: ACCOUNT_ID,
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
  });

  assert.equal(h.calls.retrieve.length, 0);
  assert.equal(h.calls.updates.length, 1);

  const club = h.getClub();

  assert.equal(club.stripe_charges_enabled, true);
  assert.equal(club.stripe_payouts_enabled, true);
  assert.equal(club.stripe_onboarding_status, "complete");
});

test("66. Express incomplet : statut pending", async () => {
  const h = makeSyncHarness();

  await h.connect.applyStripeAccountSnapshot({
    id: ACCOUNT_ID,
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
  });

  assert.equal(
    h.getClub().stripe_onboarding_status,
    "pending"
  );

  assert.equal(h.getClub().stripe_charges_enabled, false);
});

test("67. OAuth actif : verification directe chez Stripe", async () => {
  const h = makeSyncHarness({
    club: makeOAuthClub(),
  });

  await h.connect.applyStripeAccountSnapshot({
    id: ACCOUNT_ID,
    charges_enabled: false,
    payouts_enabled: false,
  });

  assert.equal(h.calls.retrieve.length, 1);
  assert.equal(h.calls.retrieve[0], ACCOUNT_ID);
  assert.equal(h.getClub().stripe_charges_enabled, true);
  assert.equal(h.getClub().stripe_payouts_enabled, true);
});

test("68. OAuth non operationnel : paiements desactives", async () => {
  for (const overrides of [
    { charges_enabled: false },
    { payouts_enabled: false },
    { details_submitted: false },
    { capabilities: { transfers: "inactive" } },
    {
      controller: {
        stripe_dashboard: { type: "express" },
      },
    },
  ]) {
    const h = makeSyncHarness({
      club: makeOAuthClub(),
      account: makeReadyAccount(overrides),
    });

    await h.connect.applyStripeAccountSnapshot({
      id: ACCOUNT_ID,
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
    });

    const club = h.getClub();

    assert.equal(club.stripe_charges_enabled, false);
    assert.equal(club.stripe_payouts_enabled, false);
    assert.equal(club.stripe_onboarding_status, "pending");
  }
});

test("69. OAuth revoque : aucune reactivation par snapshot", async () => {
  const h = makeSyncHarness({
    club: makeOAuthClub({
      stripe_oauth_revoked_at:
        "2026-11-16T13:00:00Z",
    }),
  });

  const result =
    await h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    );

  assert.equal(result, null);
  assert.equal(h.calls.retrieve.length, 0);
  assert.equal(h.calls.updates.length, 0);
});

test("70. Compte sans club : aucune modification", async () => {
  const h = makeSyncHarness({ club: null });

  const result =
    await h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    );

  assert.equal(result, null);
  assert.equal(h.calls.updates.length, 0);
});

test("71. Revocation concurrente : mise a jour refusee", async () => {
  const h = makeSyncHarness({
    club: makeOAuthClub(),
    concurrentChanges: {
      stripe_oauth_revoked_at:
        "2026-11-16T13:00:00Z",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
    },
  });

  const result =
    await h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    );

  assert.equal(result, null);
  assert.equal(h.getClub().stripe_charges_enabled, false);
  assert.equal(h.getClub().stripe_payouts_enabled, false);
});

test("72. Reconnexion concurrente : ancien snapshot refuse", async () => {
  const h = makeSyncHarness({
    club: makeOAuthClub(),
    concurrentChanges: {
      stripe_oauth_connected_at:
        "2026-11-16T14:00:00Z",
    },
  });

  const result =
    await h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    );

  assert.equal(result, null);
});

test("73. Changement concurrent de compte : snapshot refuse", async () => {
  const h = makeSyncHarness({
    club: makeOAuthClub(),
    concurrentChanges: {
      stripe_account_id: "acct_anotherclub",
    },
  });

  const result =
    await h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    );

  assert.equal(result, null);

  assert.equal(
    h.getClub().stripe_account_id,
    "acct_anotherclub"
  );
});

test("74. Changement de type de connexion : snapshot refuse", async () => {
  const h = makeSyncHarness({
    concurrentChanges: {
      stripe_connection_type: "oauth",
    },
  });

  const result =
    await h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    );

  assert.equal(result, null);
});

test("75. Erreur Stripe : aucune mise a jour optimiste", async () => {
  const h = makeSyncHarness({
    club: makeOAuthClub(),
    retrieveError: new Error("stripe unavailable"),
  });

  await assert.rejects(
    () => h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    ),
    /stripe unavailable/
  );

  assert.equal(h.calls.updates.length, 0);
});

test("76. Erreur lecture Supabase : aucune modification", async () => {
  const h = makeSyncHarness({
    clubError: new Error("database unavailable"),
  });

  await assert.rejects(
    () => h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    ),
    /database unavailable/
  );

  assert.equal(h.calls.updates.length, 0);
});

test("77. Erreur ecriture Supabase : erreur propagee", async () => {
  const h = makeSyncHarness({
    updateError: new Error("update failed"),
  });

  await assert.rejects(
    () => h.connect.applyStripeAccountSnapshot(
      makeReadyAccount()
    ),
    /update failed/
  );
});

test("78. Retour onboarding Express : lecture Stripe", async () => {
  const h = makeSyncHarness();

  await h.connect.syncClubStripeAccountStatus(
    ACCOUNT_ID
  );

  assert.equal(h.calls.retrieve.length, 1);
  assert.equal(h.calls.retrieve[0], ACCOUNT_ID);
  assert.equal(h.calls.updates.length, 1);
  assert.equal(h.getClub().stripe_charges_enabled, true);
});
