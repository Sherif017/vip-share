import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

import { getAdminAccess, canManageClub } from "@/lib/admin-access";
import { ensureClubStripeAccount, createOnboardingLink } from "@/lib/stripe-connect";

/**
 * POST /api/admin/clubs/[id]/stripe-onboarding
 *
 * Crée (si besoin) le compte Stripe Connect du club puis renvoie une URL
 * d'onboarding hébergé Stripe fraîche. Un manager club ou un admin K-RÉ
 * peut appeler cette route indifféremment pour démarrer OU reprendre un
 * onboarding incomplet (les Account Links sont à usage unique et expirent
 * en quelques minutes — on en génère systématiquement un nouveau).
 *
 * Le manager ne voit ni ne saisit jamais de clé API Stripe.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clubId } = await params;

  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!canManageClub(access, clubId)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  try {
    const stripeAccountId = await ensureClubStripeAccount(clubId);

    const account = await stripe.accounts.retrieve(stripeAccountId);

    if (account.controller?.stripe_dashboard?.type !== "express") {
      return NextResponse.json(
        {
          error: "Ce compte Stripe ne peut pas utiliser le parcours Express.",
        },
        { status: 409 }
      );
    }

    const origin = new URL(request.url).origin;

    const returnUrl = new URL("/admin", origin);
    returnUrl.searchParams.set("stripe", "return");
    returnUrl.searchParams.set("club_id", clubId);

    const refreshUrl = new URL("/admin", origin);
    refreshUrl.searchParams.set("stripe", "refresh");
    refreshUrl.searchParams.set("club_id", clubId);

    const url = await createOnboardingLink({
      stripeAccountId,
      returnUrl: returnUrl.toString(),
      refreshUrl: refreshUrl.toString(),
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("stripe-onboarding: échec", {
      clubId,
      message: error instanceof Error ? error.message : "Erreur inconnue",
    });
    return NextResponse.json(
      { error: "Impossible de démarrer l'activation des paiements pour le moment." },
      { status: 500 }
    );
  }
}
