import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { stripe } from "@/lib/stripe";

export function isStripeOAuthEnabled() {
  return process.env.STRIPE_CONNECT_OAUTH_ENABLED === "true";
}

export function createOAuthState() {
  return randomBytes(32).toString("hex");
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function createStripeOAuthUrl(state: string) {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI;

  if (!isStripeOAuthEnabled()) {
    throw new Error("La connexion Stripe OAuth est désactivée.");
  }

  if (!clientId || !redirectUri) {
    throw new Error("Configuration Stripe OAuth incomplète.");
  }

  const url = new URL("https://connect.stripe.com/oauth/authorize");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  /*
   * Parcours « J'ai déjà un compte Stripe ».
   * Avec scope=read_write, Stripe affiche par défaut le formulaire
   * d'inscription (stripe_landing=register), qui redemande secteur,
   * site web, description... meme a un titulaire de compte existant.
   * stripe_landing=login affiche la connexion puis la selection du
   * compte existant ; la creation de compte reste accessible depuis
   * cette page. always_prompt impose une selection explicite du compte.
   * Ref. SDK stripe (OAuthAuthorizeUrlParams) et
   * https://docs.stripe.com/connect/oauth-reference
   */
  url.searchParams.set("stripe_landing", "login");
  url.searchParams.set("always_prompt", "true");

  return url.toString();
}

export async function exchangeStripeOAuthCode(code: string) {
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });

  if (!response.stripe_user_id) {
    throw new Error("Compte Stripe introuvable.");
  }

  return {
    stripeAccountId: response.stripe_user_id,
    livemode: response.livemode,
    scope: response.scope,
  };
}
