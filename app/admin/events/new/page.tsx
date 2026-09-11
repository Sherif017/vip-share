import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

import NewEventForm from "./NewEventForm";

export default async function NewEventPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    redirect("/events");
  }

  const { data: clubs } = await supabaseAdmin
    .from("clubs")
    .select("id, name, city")
    .order("name", {
      ascending: true,
    });

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            VIP Share · Admin
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Créer une soirée
          </h1>

          <p className="mt-3 text-zinc-400">
            Ajoute un événement et configure son offre VIP.
          </p>
        </div>

        <NewEventForm clubs={clubs ?? []} />
      </div>
    </main>
  );
}