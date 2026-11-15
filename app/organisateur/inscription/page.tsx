"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import KreLogo from "@/components/KreLogo";
import { createBrowserClient } from "@supabase/ssr";

export default function OrganizerRegistrationPage() {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    )
  );

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    organizationName: "",
    city: "",
    email: "",
    password: "",
  });

  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setConnected(true);
        setForm((previous) => ({
          ...previous,
          email: data.user?.email ?? "",
          firstname: data.user?.user_metadata?.firstname ?? "",
          lastname: data.user?.user_metadata?.lastname ?? "",
          organizationName:
            data.user?.user_metadata?.organizationName ?? "",
          city: data.user?.user_metadata?.city ?? "",
        }));
      }
      setChecking(false);
    });
  }, [supabase]);

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function createOrganization() {
    const response = await fetch(
      "/api/organisateur/inscription",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname: form.firstname,
          lastname: form.lastname,
          organizationName: form.organizationName,
          city: form.city,
        }),
      }
    );

    const result = await response.json();

    if (response.status === 409) {
      window.location.assign("/admin");
      return;
    }

    if (!response.ok) {
      throw new Error(result.error);
    }

    window.location.assign("/admin");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (connected) {
        await createOrganization();
        return;
      }

      const { data, error: signupError } =
        await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo:
              window.location.origin +
              "/organisateur/inscription",
            data: {
              registrationType: "organizer",
              firstname: form.firstname,
              lastname: form.lastname,
              organizationName: form.organizationName,
              city: form.city,
            },
          },
        });

      if (signupError) {
        throw signupError;
      }

      if (data.session) {
        setConnected(true);
        await createOrganization();
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-[#d4af37]";

  return (
    <main className="min-h-screen bg-[#09090b] px-5 py-12 text-white">
      <div className="mx-auto max-w-lg">
        <Link
          href="/"
          className="text-sm text-zinc-400"
        >
          ← Retour à l'accueil
        </Link>

        <div className="mb-8 mt-8 text-center">
          <Link href="/" className="inline-block">
            <KreLogo variant="auth" />
          </Link>

          <h1 className="mt-6 text-3xl font-bold">
            Devenez organisateur
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Créez vos événements, gérez vos tables VIP
            et développez votre activité.
          </p>
        </div>

        {checking ? (
          <p className="text-center text-zinc-400">
            Chargement...
          </p>
        ) : sent ? (
          <div className="rounded-2xl border border-zinc-800 p-6 text-center">
            <h2 className="text-xl font-semibold text-[#d4af37]">
              Vérifiez votre boîte mail
            </h2>
            <p className="mt-4 text-zinc-400">
              Confirmez votre adresse email pour
              finaliser votre inscription.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="grid grid-cols-2 gap-4">
              {([
                ["firstname", "Prénom"],
                ["lastname", "Nom"],
                ["organizationName", "Nom de votre structure"],
                ["city", "Ville"],
              ] as const).map(([field, label]) => (
                <label key={field} className="space-y-2">
                  <span className="text-sm text-zinc-300">
                    {label}
                  </span>
                  <input
                    className={inputClass}
                    value={form[field]}
                    onChange={(event) =>
                      update(field, event.target.value)
                    }
                    required
                    maxLength={120}
                  />
                </label>
              ))}
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">
                Adresse email
              </span>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(event) =>
                  update("email", event.target.value)
                }
                disabled={connected}
                required
              />
            </label>

            {!connected && (
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">
                  Mot de passe
                </span>
                <input
                  type="password"
                  className={inputClass}
                  value={form.password}
                  onChange={(event) =>
                    update("password", event.target.value)
                  }
                  minLength={8}
                  required
                />
              </label>
            )}

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#d4af37] px-5 py-4 font-bold text-black disabled:opacity-50"
            >
              {loading
                ? "Création en cours..."
                : connected
                  ? "Finaliser mon inscription"
                  : "Créer mon compte organisateur"}
            </button>

            {!connected && (
              <p className="text-center text-sm text-zinc-400">
                Déjà un compte ?{" "}
                <Link
                  href="/login?next=/organisateur/inscription"
                  className="text-[#d4af37]"
                >
                  Se connecter
                </Link>
              </p>
            )}

            <p className="text-center text-xs text-zinc-500">
              Inscription gratuite
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
