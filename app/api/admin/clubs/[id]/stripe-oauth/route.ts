import { NextResponse } from "next/server";

import { getAdminAccess, canManageClub } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isStripeOAuthEnabled,
  createOAuthState,
  hashOAuthState,
  createStripeOAuthUrl,
} from "@/lib/stripe-oauth";

import { checkStripeOAuthEligibility } from "@/lib/stripe-oauth-eligibility";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isStripeOAuthEnabled()) {
      return NextResponse.json(
        { error: "La connexion Stripe est temporairement indisponible." },
        { status: 503 }
      );
    }

    const { id: clubId } = await params;
    const access = await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        { error: "Non authentifie." },
        { status: 401 }
      );
    }

    if (!canManageClub(access, clubId)) {
      return NextResponse.json(
        { error: "Acces refuse." },
        { status: 403 }
      );
    }

    const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI;
    const origin = request.headers.get("origin");

    if (!redirectUri || origin !== new URL(redirectUri).origin) {
      return NextResponse.json(
        { error: "Origine de la requete invalide." },
        { status: 403 }
      );
    }

    const eligibility = await checkStripeOAuthEligibility(clubId);

    if (!eligibility.allowed) {
      return NextResponse.json(
        {
          error: "Ce club ne peut pas modifier son compte Stripe actuellement.",
          reason: eligibility.reason,
        },
        { status: 409 }
      );
    }

    const state = createOAuthState();
    const url = createStripeOAuthUrl(state);

    const { error: stateError } = await supabaseAdmin
      .from("stripe_oauth_states")
      .insert({
        state_hash: hashOAuthState(state),
        club_id: clubId,
        user_id: access.userId,
        expected_account_id: eligibility.accountId,
      });

    if (stateError) throw stateError;

    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    console.error("Stripe OAuth: echec du demarrage.");

    return NextResponse.json(
      { error: "Impossible de demarrer la connexion Stripe." },
      { status: 500 }
    );
  }
}
