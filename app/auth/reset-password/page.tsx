"use client";

import {
  FormEvent,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/client";
import KreLogo from "@/components/KreLogo";

export default function ResetPasswordPage() {
  const router =
    useRouter();

  const supabase =
    createClient();

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");

    /*
    |--------------------------------------------------------------------------
    | Vérification mot de passe
    |--------------------------------------------------------------------------
    */

    if (password.length < 8) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères."
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        "Les deux mots de passe ne correspondent pas."
      );

      return;
    }

    setLoading(true);

    /*
    |--------------------------------------------------------------------------
    | Modification Supabase
    |--------------------------------------------------------------------------
    */

    const { error } =
      await supabase.auth.updateUser({
        password,
      });

    if (error) {
      console.error(
        "Erreur modification mot de passe :",
        error
      );

      setError(
        "Impossible de modifier le mot de passe. Le lien est peut-être invalide ou expiré."
      );

      setLoading(false);

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Déconnexion de la session de récupération
    |--------------------------------------------------------------------------
    */

    await supabase.auth.signOut();

    /*
    |--------------------------------------------------------------------------
    | Retour login
    |--------------------------------------------------------------------------
    */

    router.replace(
      "/login?password_reset=success"
    );

    router.refresh();
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
            Nouveau mot de passe
          </h1>

          <p className="text-zinc-400">
            Choisis ton nouveau mot de passe
            pour ton compte K-RÉ.
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 space-y-5"
        >

          {/* Nouveau mot de passe */}

          <div>

            <label
              htmlFor="password"
              className="block text-sm text-zinc-400 mb-2"
            >
              Nouveau mot de passe
            </label>

            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              placeholder="••••••••"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition"
            />

          </div>

          {/* Confirmation */}

          <div>

            <label
              htmlFor="confirmPassword"
              className="block text-sm text-zinc-400 mb-2"
            >
              Confirmer le mot de passe
            </label>

            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(
                  e.target.value
                )
              }
              placeholder="••••••••"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition"
            />

          </div>

          {/* Erreur */}

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3">

              <p className="text-sm text-red-400">
                {error}
              </p>

            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="kre-primary-cta w-full rounded-2xl py-4 font-semibold transition"
          >
            {loading
              ? "Modification..."
              : "Modifier mon mot de passe"}
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
