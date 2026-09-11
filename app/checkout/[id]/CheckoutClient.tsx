"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CheckoutClientProps = {
  slug: string;
  clubName: string;
  eventName: string;

  quantity: number;

  totalPrice: number;
  totalDeposit: number;
  totalRemaining: number;
};

export default function CheckoutClient({
  slug,
  clubName,
  eventName,
  quantity,
  totalPrice,
  totalDeposit,
  totalRemaining,
}: CheckoutClientProps) {
  const router = useRouter();

  const [firstname, setFirstname] =
    useState("");

  const [lastname, setLastname] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [acceptedTerms, setAcceptedTerms] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");

    if (!acceptedTerms) {
      setError(
        "Tu dois accepter les conditions de réservation."
      );

      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "/api/reservations",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            eventSlug: slug,
            firstname,
            lastname,
            email,
            phone,
            quantity,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Impossible de créer la réservation."
        );
      }

      if (!result.checkoutUrl) {
        throw new Error(
            "URL de paiement introuvable."
        );
      }

      window.location.href =
        result.checkoutUrl;

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          "Une erreur est survenue."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="max-w-5xl mx-auto px-6 py-14">
        <Link
          href={`/booking/${slug}`}
          className="inline-block text-sm text-zinc-400 hover:text-white mb-10"
        >
          ← Retour
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-zinc-500 mb-3">
              Checkout
            </p>

            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Finalise ta réservation
            </h1>

            <p className="text-zinc-400 mb-10">
              Entre tes informations pour
              réserver tes places.
            </p>

            <form
              onSubmit={handleSubmit}
              className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7"
            >
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Prénom
                  </label>

                  <input
                    required
                    type="text"
                    value={firstname}
                    onChange={(e) =>
                      setFirstname(
                        e.target.value
                      )
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Nom
                  </label>

                  <input
                    required
                    type="text"
                    value={lastname}
                    onChange={(e) =>
                      setLastname(
                        e.target.value
                      )
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Email
                  </label>

                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) =>
                      setEmail(
                        e.target.value
                      )
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    Téléphone
                  </label>

                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(
                        e.target.value
                      )
                    }
                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-zinc-500"
                  />
                </div>
              </div>

              <label className="flex gap-3 mt-7 cursor-pointer">
                <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) =>
                    setAcceptedTerms(e.target.checked)
                    }
                    className="mt-1"
                />

                <span className="text-sm text-zinc-400">
                    J&apos;accepte les{" "}
                    <Link
                    href="/terms"
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="text-white underline underline-offset-4 hover:text-zinc-300"
                    >
                    conditions de réservation
                    </Link>{" "}
                    et la politique d&apos;annulation.
                </span>
              </label>

              {error && (
                <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-3">
                  <p className="text-sm text-red-400">
                    {error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-8 w-full bg-white text-black rounded-2xl py-4 font-semibold hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                    ? "Redirection vers Stripe..."
                    : `Payer l'acompte — ${totalDeposit.toFixed(0)}€`}
              </button>
            </form>
          </div>

          <aside>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 lg:sticky lg:top-8">
              <p className="text-sm text-zinc-500">
                Ta réservation
              </p>

              <h2 className="text-2xl font-semibold mt-1">
                {clubName}
              </h2>

              <p className="text-zinc-400 mt-1 mb-7">
                {eventName}
              </p>

              <div className="space-y-5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Places
                  </span>

                  <span>
                    {quantity}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Prix total
                  </span>

                  <span>
                    {totalPrice.toFixed(0)}€
                  </span>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-5">
                  <span className="text-zinc-400">
                    Aujourd&apos;hui
                  </span>

                  <span className="text-xl font-bold">
                    {totalDeposit.toFixed(0)}€
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    Sur place
                  </span>

                  <span>
                    {totalRemaining.toFixed(0)}€
                  </span>
                </div>
              </div>

              <div className="mt-7 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
  <p className="text-sm font-medium text-zinc-300">
    Paiement sécurisé
  </p>

  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
    Tu seras redirigé vers Stripe pour payer
    uniquement l&apos;acompte de{" "}
    <span className="text-zinc-300">
      {totalDeposit.toFixed(0)}€
    </span>
    . Le montant restant de{" "}
    <span className="text-zinc-300">
      {totalRemaining.toFixed(0)}€
    </span>{" "}
    sera payé sur place.
  </p>
</div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}