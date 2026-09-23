"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type LogoutButtonProps = {
  variant?: "pill" | "menu";
  className?: string;
};

export default function LogoutButton({
  variant = "pill",
  className = "",
}: LogoutButtonProps) {
  const router = useRouter();

  const [loading, setLoading] =
    useState(false);

  async function handleLogout() {
    setLoading(true);

    const supabase = createClient();

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        "Erreur déconnexion :",
        error
      );

      setLoading(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  const baseClassName =
    variant === "menu"
      ? "w-full text-left text-base text-muted transition hover:text-champagne disabled:cursor-not-allowed disabled:opacity-50"
      : "rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={`${baseClassName} ${className}`.trim()}
    >
      {loading
        ? "Déconnexion..."
        : "Déconnexion"}
    </button>
  );
}