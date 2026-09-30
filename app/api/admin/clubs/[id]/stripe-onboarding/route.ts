import { NextResponse } from "next/server";

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

    const origin = new URL(request.url).origin;
    const returnUrl = `${origin}/manager/clubs/${clubId}?stripe=return`;
    const refreshUrl = `${origin}/manager/clubs/${clubId}?stripe=refresh`;

    const url = await createOnboardingLink({
      stripeAccountId,
      returnUrl,
      refreshUrl,
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
