import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Club = {
  id: string;
  name: string;
  city: string;
  address: string | null;
  created_at: string | null;
};

type Membership = {
  club_id: string;
  status: string;
};

export default async function ManagerPage() {
  const access = await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.isManager) {
    redirect("/admin");
  }

  const { data: clubsData, error: clubsError } = await supabaseAdmin
    .from("clubs")
    .select("id, name, city, address, created_at")
    .order("name", { ascending: true });

  if (clubsError) {
    console.error(clubsError);

    return (
      <main className="mx-auto max-w-7xl px-4 py-10">
        <p className="text-red-600">
          Impossible de charger les clubs.
        </p>
      </main>
    );
  }

  const clubs = (clubsData ?? []) as Club[];

  const { data: membershipsData } = await supabaseAdmin
    .from("club_memberships")
    .select("club_id, status")
    .eq("role", "admin");

  const memberships = (membershipsData ?? []) as Membership[];

  const activeAdminCountByClub = new Map<string, number>();

  for (const membership of memberships) {
    if (membership.status !== "active") continue;

    activeAdminCountByClub.set(
      membership.club_id,
      (activeAdminCountByClub.get(membership.club_id) ?? 0) + 1
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            VIP Share
          </p>

          <h1 className="text-3xl font-bold text-gray-950">
            Espace Manager
          </h1>

          <p className="mt-2 text-gray-600">
            Gérez les clubs et leurs comptes administrateurs.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">
              Clubs
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {clubs.length} club{clubs.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {clubs.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">
              Aucun club n&apos;est encore enregistré.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {clubs.map((club) => {
              const admins =
                activeAdminCountByClub.get(club.id) ?? 0;

              return (
                <Link
                  key={club.id}
                  href={`/manager/clubs/${club.id}`}
                  className="group rounded-2xl border border-gray-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-950">
                        {club.name}
                      </h3>

                      <p className="mt-1 text-sm text-gray-500">
                        {club.city}
                      </p>
                    </div>

                    <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                      {admins} admin{admins > 1 ? "s" : ""}
                    </div>
                  </div>

                  {club.address && (
                    <p className="mb-5 text-sm text-gray-600">
                      {club.address}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-sm font-medium text-gray-700">
                      Gérer le club
                    </span>

                    <span className="transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
