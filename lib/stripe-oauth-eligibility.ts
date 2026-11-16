import "server-only";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function checkStripeOAuthEligibility(clubId: string) {
  const { data: club, error } = await supabaseAdmin
    .from("clubs")
    .select(`
      id,
      stripe_account_id,
      stripe_charges_enabled,
      stripe_payouts_enabled,
      stripe_details_submitted,
      stripe_onboarding_status,
      stripe_connection_type,
      stripe_oauth_revoked_at
    `)
    .eq("id", clubId)
    .maybeSingle();

  if (error) throw error;

  if (!club) {
    return {
      allowed: false,
      reason: "club_not_found",
      accountId: null,
    };
  }

  const accountId = club.stripe_account_id as string | null;

  if (club.stripe_connection_type === "oauth") {
    if (accountId && club.stripe_oauth_revoked_at) {
      return {
        allowed: true,
        reason: null,
        accountId,
        reconnect: true,
      };
    }

    return {
      allowed: false,
      reason: "already_active",
      accountId,
      reconnect: false,
    };
  }

  if (
    club.stripe_charges_enabled ||
    club.stripe_payouts_enabled ||
    club.stripe_details_submitted ||
    club.stripe_onboarding_status === "complete"
  ) {
    return {
      allowed: false,
      reason: "already_active",
      accountId,
    };
  }

  const { count, error: transactionError } =
    await supabaseAdmin
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId);

  if (transactionError) throw transactionError;

  if (count !== 0) {
    return {
      allowed: false,
      reason: "financial_history",
      accountId,
    };
  }

  if (accountId) {
    const account = await stripe.accounts.retrieve(accountId);

    if (
      account.controller?.stripe_dashboard?.type !== "express" ||
      account.charges_enabled ||
      account.payouts_enabled ||
      account.details_submitted
    ) {
      return {
        allowed: false,
        reason: "account_not_replaceable",
        accountId,
      };
    }
  }

  return {
    allowed: true,
    reason: null,
    accountId,
  };
}
