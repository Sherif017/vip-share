"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    const { error } =
      await supabase.auth.signUp({
        email,
        password,

        options: {
          data: {
            firstname,
            lastname,
          },
        },
      });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(
      "Compte créé. Vérifie ton email si Supabase demande une confirmation."
    );

    setLoading(false);

    setTimeout(() => {
      router.push("/login");
    }, 1500);
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
          VIP Share
        </p>

        <h1 className="text-4xl font-bold mb-3">
          Créer un compte
        </h1>

        <p className="text-zinc-400 mb-8">
          Retrouve toutes tes réservations VIP
          au même endroit.
        </p>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400">
                Prénom
              </label>

              <input
                required
                value={firstname}
                onChange={(e) =>
                  setFirstname(e.target.value)
                }
                className="mt-2 w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400">
                Nom
              </label>

              <input
                required
                value={lastname}
                onChange={(e) =>
                  setLastname(e.target.value)
                }
                className="mt-2 w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Email
            </label>

            <input
              required
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className="mt-2 w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400">
              Mot de passe
            </label>

            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className="mt-2 w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">
              {error}
            </p>
          )}

          {success && (
            <p className="text-green-400 text-sm">
              {success}
            </p>
          )}

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-white text-black py-4 font-semibold disabled:opacity-50"
          >
            {loading
              ? "Création..."
              : "Créer mon compte"}
          </button>
        </form>

        <p className="text-sm text-zinc-500 text-center mt-6">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-white"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}