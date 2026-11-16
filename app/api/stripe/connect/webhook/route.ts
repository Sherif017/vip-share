import { NextResponse } from "next/server";
import Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyStripeAccountSnapshot } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (!secret) {
    return NextResponse.json(
      { error: "Webhook Connect non configure." },
      { status: 503 }
    );
  }

  if (!signature) {
    return NextResponse.json(
      { error: "Signature absente." },
      { status: 400 }
    );
  }

  const body = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      secret
    );
  } catch {
    return NextResponse.json(
      { error: "Signature invalide." },
      { status: 400 }
    );
  }

  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const liveMode = /^(sk|rk)_live_/.test(key);
  const testMode = /^(sk|rk)_test_/.test(key);

  if ((!liveMode && !testMode) || event.livemode !== liveMode) {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    switch (event.type) {
      case "account.application.deauthorized": {
        const accountId = event.account;

        if (!accountId || !/^acct_[A-Za-z0-9]+$/.test(accountId)) {
          throw new Error("Identifiant du compte absent.");
        }

        const revokedAt = new Date(
          event.created * 1000
        ).toISOString();

        const { data: revocation, error } =
          await supabaseAdmin.rpc(
            "record_stripe_oauth_revocation",
            {
              p_stripe_event_id: event.id,
              p_stripe_account_id: accountId,
              p_revoked_at: revokedAt,
            }
          );

        if (error) throw error;

        console.info("Stripe Connect: revocation traitee", {
          accountId,
          eventId: event.id,
          result: revocation,
        });

        break;
      }

      case "account.updated":
      case "capability.updated": {
        const accountId = event.account;

        if (!accountId) break;

        const { data: club, error } = await supabaseAdmin
          .from("clubs")
          .select("id, stripe_oauth_revoked_at, stripe_connection_type")
          .eq("stripe_account_id", accountId)
          .maybeSingle();

        if (error) throw error;

        if (!club || club.stripe_oauth_revoked_at) break;

        const account = await stripe.accounts.retrieve(accountId);

        await applyStripeAccountSnapshot(account);

        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe Connect: traitement impossible", {
      eventId: event.id,
      type: event.type,
      message:
        error instanceof Error
          ? error.message
          : "Erreur inconnue",
    });

    return NextResponse.json(
      { error: "Traitement impossible." },
      { status: 500 }
    );
  }
}
