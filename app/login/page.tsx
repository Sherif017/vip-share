"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import KreLogo from "@/components/KreLogo";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      console.error(
        "Erreur connexion :",
        error
      );

      setError(
        "Email ou mot de passe incorrect."
      );

      setLoading(false);
      return;
    }

    router.replace("/events");
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
            Connexion
          </h1>

          <p className="text-zinc-400">
            Connecte-toi pour accéder aux soirées
            et à tes réservations VIP.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 space-y-5"
        >
          {/* Email */}

          <div>
            <label
              htmlFor="email"
              className="block text-sm text-zinc-400 mb-2"
            >
              Email
            </label>

            <input
              id="email"
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="ton@email.com"
              className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500 transition"
            />
          </div>

          {/* Mot de passe */}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm text-zinc-400"
              >
                Mot de passe
              </label>

              <Link
                href="/forgot-password"
                className="text-xs text-zinc-500 transition hover:text-white"
              >
                Mot de passe oublié ?
              </Link>
            </div>

            <input
              id="password"
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
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

          {/* Connexion */}

          <button
            type="submit"
            disabled={loading}
            className="kre-primary-cta w-full rounded-2xl py-4 font-semibold transition"
          >
            {loading
              ? "Connexion en cours..."
              : "Se connecter"}
          </button>
        </form>

        <p className="text-sm text-zinc-500 text-center mt-6">
          Pas encore de compte ?{" "}
          <Link
            href="/register"
            className="text-white hover:text-zinc-300 transition"
          >
            Créer un compte
          </Link>
        </p>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-white transition"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>

      </div>
    </main>
  );
}
