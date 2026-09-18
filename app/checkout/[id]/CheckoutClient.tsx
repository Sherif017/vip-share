"use client";

import Link from "next/link";

import {
  FormEvent,
  useRef,
  useState,
} from "react";

type CheckoutClientProps = {
  slug: string;

  vipOfferId: string;

  tableNumber: string;

  clubName: string;

  eventName: string;

  quantity: number;

  totalPrice: number;

  totalDeposit: number;

  totalRemaining: number;
};

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "fr-FR",
    {
      minimumFractionDigits:
        Number.isInteger(value)
          ? 0
          : 2,

      maximumFractionDigits: 2,
    }
  ).format(value);
}

export default function CheckoutClient({
  slug,

  vipOfferId,

  tableNumber,

  clubName,

  eventName,

  quantity,

  totalPrice,

  totalDeposit,

  totalRemaining,
}: CheckoutClientProps) {
  const [
    firstname,
    setFirstname,
  ] = useState("");

  const submitLock = useRef(false);
  const checkoutAttemptId = useRef(crypto.randomUUID());

  const [
    lastname,
    setLastname,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    phone,
    setPhone,
  ] = useState("");

  const [
    acceptedTerms,
    setAcceptedTerms,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (submitLock.current) return;
    submitLock.current = true;

    setError("");

    if (!acceptedTerms) {
      setError(
        "Tu dois accepter les conditions de réservation."
      );

      return;
    }

    try {
      setLoading(true);

      const response =
        await fetch(
          "/api/reservations",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                eventSlug:
                  slug,

                vipOfferId,

                firstname,

                lastname,

                email,

                phone,

                quantity,

                checkoutAttemptId:
                  checkoutAttemptId.current,
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

      if (
        !result.checkoutUrl
      ) {
        throw new Error(
          "URL de paiement introuvable."
        );
      }

      window.location.href =
        result.checkoutUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
      submitLock.current = false;
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-5xl px-6 py-14">
        <Link
          href={`/booking/${slug}?table=${encodeURIComponent(
            vipOfferId
          )}`}
          className="mb-10 inline-block text-sm text-zinc-400 hover:text-white"
        >
          ← Retour
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-zinc-500">
              Checkout
            </p>

            <h1 className="mb-3 text-4xl font-bold md:text-5xl">
              Finalise ta
              réservation
            </h1>

            <p className="mb-10 text-zinc-400">
              Entre tes
              informations pour
              réserver tes places
              sur la table n°
              {tableNumber}.
            </p>

            <form
              onSubmit={
                handleSubmit
              }
              className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Prénom"
                  value={
                    firstname
                  }
                  onChange={
                    setFirstname
                  }
                  type="text"
                />

                <Field
                  label="Nom"
                  value={
                    lastname
                  }
                  onChange={
                    setLastname
                  }
                  type="text"
                />

                <Field
                  label="Email"
                  value={
                    email
                  }
                  onChange={
                    setEmail
                  }
                  type="email"
                />

                <Field
                  label="Téléphone"
                  value={
                    phone
                  }
                  onChange={
                    setPhone
                  }
                  type="tel"
                />
              </div>

              <label className="mt-7 flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  checked={
                    acceptedTerms
                  }
                  onChange={(
                    e
                  ) =>
                    setAcceptedTerms(
                      e.target
                        .checked
                    )
                  }
                  className="mt-1"
                />

                <span className="text-sm text-zinc-400">
                  J&apos;accepte
                  les{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    onClick={(
                      e
                    ) =>
                      e.stopPropagation()
                    }
                    className="text-white underline underline-offset-4 hover:text-zinc-300"
                  >
                    conditions de
                    réservation
                  </Link>{" "}
                  et la politique
                  d&apos;annulation.
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
                disabled={
                  loading
                }
                className="mt-8 w-full rounded-2xl bg-white py-4 font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Redirection vers Stripe..."
                  : `Payer le Deposit — ${formatMoney(
                      totalDeposit
                    )}€`}
              </button>
            </form>
          </div>

          <aside>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7 lg:sticky lg:top-8">
              <p className="text-sm text-zinc-500">
                Ta réservation
              </p>

              <h2 className="mt-1 text-2xl font-semibold">
                {clubName}
              </h2>

              <p className="mt-1 text-zinc-400">
                {eventName}
              </p>

              <p className="mt-3 text-sm font-medium">
                Table n°
                {tableNumber}
              </p>

              <div className="mt-7 space-y-5">
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
                    {formatMoney(
                      totalPrice
                    )}
                    €
                  </span>
                </div>

                <div className="flex justify-between border-t border-zinc-800 pt-5">
                  <span className="text-zinc-400">
                    Deposit
                  </span>

                  <span className="text-xl font-bold">
                    {formatMoney(
                      totalDeposit
                    )}
                    €
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">
                    À payer sur
                    place
                  </span>

                  <span>
                    {formatMoney(
                      totalRemaining
                    )}
                    €
                  </span>
                </div>
              </div>

              <div className="mt-7 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-sm font-medium text-zinc-300">
                  Paiement
                  sécurisé
                </p>

                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Tu seras
                  redirigé vers
                  Stripe pour
                  payer le
                  Deposit de{" "}
                  <span className="text-zinc-300">
                    {formatMoney(
                      totalDeposit
                    )}
                    €
                  </span>
                  . Le montant
                  restant de{" "}
                  <span className="text-zinc-300">
                    {formatMoney(
                      totalRemaining
                    )}
                    €
                  </span>{" "}
                  sera payé
                  directement sur
                  place.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;

  value: string;

  onChange: (
    value: string
  ) => void;

  type: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-zinc-400">
        {label}
      </label>

      <input
        required
        type={type}
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-zinc-500"
      />
    </div>
  );
}
