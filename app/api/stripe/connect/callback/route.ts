import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminAccess, canManageClub } from "@/lib/admin-access";
import {
  isStripeOAuthEnabled,
  hashOAuthState,
  exchangeStripeOAuthCode,
} from "@/lib/stripe-oauth";

import { checkStripeOAuthEligibility } from "@/lib/stripe-oauth-eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finish(status: string) {
  const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI;

  if (!redirectUri) {
    return NextResponse.json(
      { error: "Configuration OAuth indisponible." },
      { status: 503 }
    );
  }

  const url = new URL("/admin", redirectUri);
  url.searchParams.set("stripe_oauth", status);

  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");

  return response;
}

export async function GET(request: Request) {
  try {
    if (!isStripeOAuthEnabled()) {
      return finish("disabled");
    }

    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    const code = params.get("code");

    if (!state || !/^[a-f0-9]{64}$/.test(state)) {
      return finish("invalid_state");
    }

    const access = await getAdminAccess();

    if (!access) {
      return finish("unauthorized");
    }

    const { data: authorization, error: stateError } =
      await supabaseAdmin
        .rpc("consume_stripe_oauth_state", {
          p_state_hash: hashOAuthState(state),
          p_user_id: access.userId,
        })
        .maybeSingle();

    if (stateError) throw stateError;

    if (!authorization) {
      return finish("invalid_state");
    }

    if (
      typeof authorization !== "object" ||
      authorization === null ||
      !("club_id" in authorization) ||
      typeof authorization.club_id !== "string"
    ) {
      return finish("invalid_state");
    }

    if (
      !("id" in authorization) ||
      typeof authorization.id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        authorization.id
      )
    ) {
      return finish("invalid_state");
    }

    const stateId = authorization.id;
    const clubId = authorization.club_id;

    if (!canManageClub(access, clubId)) {
      return finish("unauthorized");
    }

    if (params.has("error") || !code) {
      return finish("cancelled");
    }

    if (
      !("expected_account_id" in authorization) ||
      (
        authorization.expected_account_id !== null &&
        typeof authorization.expected_account_id !== "string"
      )
    ) {
      return finish("invalid_state");
    }

    const expectedAccountId = authorization.expected_account_id;

    const eligibility = await checkStripeOAuthEligibility(clubId);

    if (!eligibility.allowed) {
      return finish("not_eligible");
    }

    if (eligibility.accountId !== expectedAccountId) {
      return finish("account_changed");
    }

    const result = await exchangeStripeOAuthCode(code);

    if (
      "reconnect" in eligibility &&
      eligibility.reconnect &&
      result.stripeAccountId !== expectedAccountId
    ) {
      return finish("wrong_account");
    }

    const key = process.env.STRIPE_SECRET_KEY ?? "";
    const liveMode = /^(sk|rk)_live_/.test(key);
    const testMode = /^(sk|rk)_test_/.test(key);

    if (
      (!liveMode && !testMode) ||
      result.livemode !== liveMode ||
      result.scope !== "read_write"
    ) {
      return finish("incompatible");
    }

    const account = await stripe.accounts.retrieve(
      result.stripeAccountId
    );

    const platformAccount = await stripe.accounts.retrieve(null);

    if (
      account.id === platformAccount.id ||
      account.country !== "FR" ||
      account.controller?.stripe_dashboard?.type !== "full" ||
      account.capabilities?.transfers !== "active" ||
      !account.charges_enabled ||
      !account.payouts_enabled ||
      !account.details_submitted
    ) {
      return finish("incompatible");
    }

    // Nouvelle verification juste avant l'association.
    const finalEligibility = await checkStripeOAuthEligibility(clubId);

    if (
      !finalEligibility.allowed ||
      finalEligibility.accountId !== expectedAccountId
    ) {
      return finish("account_changed");
    }

    const { error: linkError } = await supabaseAdmin.rpc(
      "link_club_stripe_oauth_account",
      {
        p_club_id: clubId,
        p_user_id: access.userId,
        p_expected_account_id: expectedAccountId,
        p_stripe_account_id: account.id,
        p_state_id: stateId,
      }
    );

    if (linkError) {
      if (linkError.code === "23505") {
        return finish("account_in_use");
      }

      if (linkError.code === "42501") {
        return finish("unauthorized");
      }

      if (linkError.code === "55000") {
        return finish("account_changed");
      }

      throw linkError;
    }

    return finish("success");

  } catch {
    console.error("Stripe OAuth: echec du callback.");
    return finish("failed");
  }
}
