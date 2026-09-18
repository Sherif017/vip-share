import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

import InviteClubAdminForm from "@/components/manager/InviteClubAdminForm";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type ClubMembership = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

type Profile = {
  id: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
};

export default async function ManagerClubPage({
  params,
}: PageProps) {
  const { id: clubId } = await params;

  const access = await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.isManager) {
    redirect("/admin");
  }

  const { data: club } = await supabaseAdmin
    .from("clubs")
    .select("id, name, city, address, image_url")
    .eq("id", clubId)
    .maybeSingle();

  if (!club) {
    notFound();
  }

  const { data: membershipsData } =
    await supabaseAdmin
      .from("club_memberships")
      .select(
        "id, user_id, role, status, created_at"
      )
      .eq("club_id", clubId)
      .order("created_at", {
        ascending: true,
      });

  const memberships =
    (membershipsData ?? []) as ClubMembership[];

  const userIds = memberships.map(
    (membership) => membership.user_id
  );

  let profiles: Profile[] = [];

  if (userIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, firstname, lastname, role"
      )
      .in("id", userIds);

    profiles = (data ?? []) as Profile[];
  }

  const profileById = new Map(
    profiles.map((profile) => [
      profile.id,
      profile,
    ])
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href="/manager"
          className="mb-8 inline-flex text-sm font-medium text-gray-600 hover:text-black"
        >
          ← Retour aux clubs
        </Link>

        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-7">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Club
          </p>

          <h1 className="text-3xl font-bold text-gray-950">
            {club.name}
          </h1>

          <p className="mt-2 text-gray-600">
            {club.city}
            {club.address
              ? ` · ${club.address}`
              : ""}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-7">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-950">
                Administrateurs
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Comptes ayant accès à ce club.
              </p>
            </div>

            {memberships.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p className="text-sm text-gray-500">
                  Aucun administrateur pour le moment.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {memberships.map(
                  (membership) => {
                    const profile =
                      profileById.get(
                        membership.user_id
                      );

                    const fullName = [
                      profile?.firstname,
                      profile?.lastname,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <div
                        key={membership.id}
                        className="flex flex-col justify-between gap-4 rounded-xl border border-gray-200 p-5 sm:flex-row sm:items-center"
                      >
                        <div>
                          <p className="font-semibold text-gray-950">
                            {fullName ||
                              "Administrateur"}
                          </p>

                          <p className="mt-1 text-sm text-gray-500">
                            {membership.role ===
                            "scanner"
                              ? "Scanner"
                              : "Administrateur"}
                          </p>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                            membership.status ===
                            "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {membership.status ===
                          "active"
                            ? "Actif"
                            : "Inactif"}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-7">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-950">
                Ajouter un administrateur
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Un email d&apos;invitation lui sera
                envoyé.
              </p>
            </div>

            <InviteClubAdminForm
              clubId={clubId}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
