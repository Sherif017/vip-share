"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  clubId: string;
};

export default function InviteClubAdminForm({
  clubId,
}: Props) {
  const router = useRouter();

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        "/api/manager/club-admins",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            clubId,
            firstname,
            lastname,
            email,
            role: "admin",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ??
            "Impossible d'ajouter cet administrateur."
        );
      }

      setMessage(
        result?.invited
          ? "Invitation envoyée avec succès."
          : "Utilisateur existant ajouté au club avec succès."
      );

      setFirstname("");
      setLastname("");
      setEmail("");

      router.refresh();
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

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="firstname"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            Prénom
          </label>

          <input
            id="firstname"
            type="text"
            value={firstname}
            onChange={(event) =>
              setFirstname(event.target.value)
            }
            required
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-black"
            placeholder="Alex"
          />
        </div>

        <div>
          <label
            htmlFor="lastname"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            Nom
          </label>

          <input
            id="lastname"
            type="text"
            value={lastname}
            onChange={(event) =>
              setLastname(event.target.value)
            }
            required
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-black"
            placeholder="Dupont"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-gray-800"
        >
          Adresse email
        </label>

        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          required
          autoComplete="email"
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-black"
          placeholder="alex@email.com"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-800">
          Rôle
        </label>

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="font-medium text-gray-900">
            Administrateur du club
          </p>

          <p className="mt-1 text-sm text-gray-500">
            Peut gérer les soirées, tables,
            réservations et scanner du club.
          </p>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-black px-5 py-3 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? "Envoi en cours..."
          : "Envoyer l'invitation"}
      </button>
    </form>
  );
}