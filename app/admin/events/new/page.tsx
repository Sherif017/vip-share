import {
  redirect,
} from "next/navigation";

import {
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import NewEventForm from "./NewEventForm";

export default async function NewEventPage() {
  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.canManageAnyClub) {
    redirect("/events");
  }

  let query =
    supabaseAdmin
      .from("clubs")
      .select(
        "id, name, city"
      )
      .order(
        "name",
        {
          ascending: true,
        }
      );

  if (!access.isManager) {
    query = query.in(
      "id",
      access.managedClubIds
    );
  }

  const {
    data: clubs,
    error,
  } = await query;

  if (error) {
    console.error(
      "Erreur récupération clubs :",
      error
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            K-RÉ · Admin
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Créer une soirée
          </h1>

          <p className="mt-3 max-w-2xl text-zinc-400">
            Configure la soirée,
            importe ses visuels,
            définis le Deposit et
            ajoute les différentes
            tables disponibles.
          </p>

          {!access.isManager && (
            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm text-zinc-400">
                La soirée sera créée dans
                l&apos;un des clubs associés
                à ton compte.
              </p>
            </div>
          )}
        </div>

        <NewEventForm
          clubs={clubs ?? []}
          isManager={
            access.isManager
          }
        />
      </div>
    </main>
  );
}
