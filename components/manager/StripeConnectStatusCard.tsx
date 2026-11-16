"use client";

import { useState } from "react";

type Status = "not_started" | "pending" | "complete";
type Action = "express" | "oauth";

export default function StripeConnectStatusCard({
  clubId,
  clubName,
  status,
  chargesEnabled,
  oauthEnabled = false,
  connectionType = null,
  oauthRevoked = false,
}: {
  clubId: string;
  clubName: string;
  status: Status;
  chargesEnabled: boolean;
  oauthEnabled?: boolean;
  connectionType?: "express" | "oauth" | null;
  oauthRevoked?: boolean;
}) {
  const [loading, setLoading] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate(action: Action) {
    if (loading) return;

    setLoading(action);
    setError(null);

    try {
      const endpoint =
        action === "oauth"
          ? "stripe-oauth"
          : "stripe-onboarding";

      const res = await fetch(
        `/api/admin/clubs/${clubId}/${endpoint}`,
        { method: "POST" }
      );

      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.url) {
        const messages: Record<string, string> = {
          already_active:
            "Un compte Stripe est déjà configuré pour ce club.",
          financial_history:
            "Ce club possède un historique financier. Contactez K-RÉ pour modifier votre compte.",
          account_not_replaceable:
            "Votre compte actuel ne peut pas être remplacé automatiquement. Contactez K-RÉ.",
        };

        throw new Error(
          messages[body?.reason] ??
          body?.error ??
          "Impossible de démarrer la connexion Stripe."
        );
      }

      window.location.assign(body.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue. Veuillez réessayer."
      );

      setLoading(null);
    }
  }

  const pending = status === "pending";

  if (connectionType === "oauth" && (oauthRevoked || !chargesEnabled)) {
    return (
      <section className="rounded-2xl border border-amber-500/20 bg-zinc-950 p-5 sm:p-6">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">{clubName}</p>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            {oauthRevoked ? "Compte déconnecté" : "Vérification requise"}
          </span>
        </div>

        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-xl text-amber-400">
          !
        </div>

        <h3 className="mt-4 text-xl font-semibold tracking-tight text-cream">
          {oauthRevoked
            ? "Reconnectez votre compte Stripe"
            : "Votre compte Stripe nécessite une vérification"}
        </h3>

        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {oauthRevoked
            ? "Votre autorisation Stripe a été révoquée. Reconnectez votre compte initial pour réactiver vos paiements."
            : "Vérifiez les informations et les éventuelles restrictions de votre compte directement sur Stripe."}
        </p>

        <div className="my-5 space-y-2 text-sm text-zinc-300">
          {[
            "Vos réservations sont conservées",
            "Votre historique financier est conservé",
            "Vos revenus restent comptabilisés",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <span className="text-emerald-400">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {oauthRevoked ? (
          oauthEnabled ? (
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => handleActivate("oauth")}
              className="kre-primary-cta w-full rounded-full px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {loading === "oauth"
                ? "Redirection..."
                : "Reconnecter mon compte Stripe ↗"}
            </button>
          ) : (
            <p className="rounded-xl border border-white/10 p-3 text-sm text-zinc-400">
              La reconnexion est temporairement indisponible.
              Contactez K-RÉ.
            </p>
          )
        ) : (
          <a
            href="https://dashboard.stripe.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="kre-primary-cta block w-full rounded-full px-4 py-3 text-center text-sm font-semibold"
          >
            Accéder à Stripe ↗
          </a>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <p className="mt-5 text-center text-xs text-zinc-500">
          Connexion sécurisée · Stripe
        </p>

      </section>
    );
  }

  const badge = chargesEnabled
    ? {
        label: "Paiements activés",
        className: "bg-emerald-500/10 text-emerald-400",
      }
    : pending
      ? {
          label: "Activation en cours",
          className: "bg-amber-500/10 text-amber-400",
        }
      : {
          label: "Paiements non activés",
          className: "bg-white/[0.07] text-zinc-400",
        };

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-6">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">{clubName}</p>

        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {chargesEnabled ? (
        <div className="mt-5 flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xl text-emerald-400">
            ✓
          </span>

          <div>
            <h3 className="font-semibold text-cream">
              Votre compte Stripe est connecté
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Les paiements sont activés pour votre établissement.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-5 mt-5">
            <h3 className="text-xl font-semibold tracking-tight text-cream">
              {pending
                ? "Finalisez votre configuration"
                : "Activez vos paiements"}
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Connectez Stripe pour recevoir les revenus
              générés par vos événements sur K-RÉ.
            </p>
          </div>

          <div className={`grid gap-3 ${oauthEnabled ? "sm:grid-cols-2" : ""}`}>

            {oauthEnabled && (
              <div className="flex flex-col rounded-xl border border-[#c6a76d]/40 bg-[#c6a76d]/[0.05] p-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#c6a76d]">
                  Compte existant
                </p>

                <h4 className="font-semibold text-cream">
                  J'ai déjà un compte Stripe
                </h4>

                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Connectez votre compte Stripe existant
                  sans recommencer votre inscription.
                </p>

                <p className="mb-5 mt-2 flex-1 text-xs leading-relaxed text-zinc-500">
                  Connectez-vous avec vos identifiants Stripe, puis
                  sélectionnez votre compte. Un compte créé via une autre
                  plateforme ne peut pas être partagé : Stripe vous
                  proposera alors un compte dédié à K-RÉ.
                </p>

                <button
                  type="button"
                  disabled={loading !== null}
                  onClick={() => handleActivate("oauth")}
                  className="kre-primary-cta w-full rounded-full px-4 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {loading === "oauth"
                    ? "Redirection..."
                    : "Connecter mon compte Stripe ↗"}
                </button>
              </div>
            )}

            <div className="flex flex-col rounded-xl border border-white/10 p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
                {pending ? "Configuration en cours" : "Nouveau compte"}
              </p>

              <h4 className="font-semibold text-cream">
                {pending
                  ? "Reprendre mon inscription"
                  : "Je n'ai pas encore de compte Stripe"}
              </h4>

              <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                {pending
                  ? "Terminez la configuration de votre compte Stripe."
                  : "Créez votre compte et configurez vos informations de versement."}
              </p>

              <button
                type="button"
                disabled={loading !== null}
                onClick={() => handleActivate("express")}
                className={
                  !oauthEnabled
                    ? "kre-primary-cta w-full rounded-full px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    : "w-full rounded-full border border-[#c6a76d]/60 px-4 py-3 text-sm font-semibold text-[#c6a76d] transition hover:bg-[#c6a76d]/10 disabled:opacity-50"
                }
              >
                {loading === "express"
                  ? "Redirection..."
                  : pending
                    ? "Reprendre mon inscription ↗"
                    : "Créer mon compte Stripe ↗"}
              </button>
            </div>


          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400"
            >
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="text-xs text-zinc-500">
              Connexion sécurisée par
            </span>
            <span className="text-lg font-bold tracking-tight text-[#958dff]">
              stripe
            </span>
          </div>
        </>
      )}
    </section>
  );
}
