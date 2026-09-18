"use client";

import {
  FormEvent,
  useState,
} from "react";

import Link from "next/link";

import {
  createClient,
} from "@/lib/supabase/client";
import KreLogo from "@/components/KreLogo";

export default function ForgotPasswordPage() {
  const supabase =
    createClient();

  const [email, setEmail] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState(false);

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setSuccess(false);

    const redirectTo =
      `${window.location.origin}/auth/reset-password`;

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo,
        }
      );

    if (error) {
      console.error(
        "Erreur reset password :",
        error
      );

      setError(
        "Impossible d'envoyer l'email de récupération."
      );

      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  return (
    <main className="kre-customer min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">

        <div className="mb-8">

          <Link
            href="/"
            aria-label="K-RÉ — Accueil"
            className="mb-6 inline-block"
          >
            <KreLogo variant="auth" />
          </Link>

          <h1 className="text-4xl font-bold mb-3">
            Mot de passe oublié
          </h1>

          <p className="text-zinc-400">
            Entre ton adresse email.
            Nous t&apos;enverrons un lien pour
            choisir un nouveau mot de passe.
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 space-y-5"
        >

          <div>

            <label
              htmlFor="email"
              className="block text-sm text-zinc-400 mb-2"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }
              placeholder="ton@email.com"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition"
            />

          </div>

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3">

              <p className="text-sm text-red-400">
                {error}
              </p>

            </div>
          )}

          {success && (
            <div className="rounded-xl border border-green-900 bg-green-950/30 px-4 py-3">

              <p className="text-sm text-green-400">
                Email envoyé. Vérifie ta boîte mail
                et clique sur le lien de récupération.
              </p>

            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="kre-primary-cta w-full rounded-2xl py-4 font-semibold transition"
          >
            {loading
              ? "Envoi..."
              : "Envoyer le lien"}
          </button>

        </form>

        <div className="mt-6 text-center">

          <Link
            href="/login"
            className="text-sm text-zinc-500 hover:text-white transition"
          >
            ← Retour à la connexion
          </Link>

        </div>

      </div>
    </main>
  );
}
