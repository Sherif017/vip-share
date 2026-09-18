import { NextRequest, NextResponse } from "next/server";

import { getAdminAccess } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RequestBody = {
  clubId?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: "admin" | "scanner";
};

export async function POST(request: NextRequest) {
  try {
    // ========================================================
    // 1. UTILISATEUR CONNECTÉ
    // ========================================================

    const access = await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        {
          error: "Non authentifié.",
        },
        {
          status: 401,
        }
      );
    }

    // ========================================================
    // 2. MANAGER UNIQUEMENT
    // ========================================================

    if (!access.isManager) {
      return NextResponse.json(
        {
          error: "Accès réservé au Manager VIP Share.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 3. BODY
    // ========================================================

    const body = (await request.json()) as RequestBody;

    const clubId = body.clubId?.trim();
    const firstname = body.firstname?.trim();
    const lastname = body.lastname?.trim();
    const email = body.email?.trim().toLowerCase();

    const role: "admin" | "scanner" =
      body.role === "scanner" ? "scanner" : "admin";

    if (!clubId || !firstname || !lastname || !email) {
      return NextResponse.json(
        {
          error: "Tous les champs sont obligatoires.",
        },
        {
          status: 400,
        }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        {
          error: "Adresse email invalide.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 4. VÉRIFIER QUE LE CLUB EXISTE
    // ========================================================

    const { data: club, error: clubError } = await supabaseAdmin
      .from("clubs")
      .select("id, name")
      .eq("id", clubId)
      .maybeSingle();

    if (clubError) {
      console.error("Erreur récupération club :", clubError);

      return NextResponse.json(
        {
          error: "Impossible de vérifier le club.",
        },
        {
          status: 500,
        }
      );
    }

    if (!club) {
      return NextResponse.json(
        {
          error: "Club introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // 5. CHERCHER SI L'UTILISATEUR EXISTE DÉJÀ DANS AUTH
    // ========================================================

    let page = 1;
    const perPage = 1000;

    let existingUser:
      | {
          id: string;
          email?: string;
        }
      | undefined;

    while (!existingUser) {
      const { data, error } =
        await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

      if (error) {
        console.error(
          "Erreur recherche utilisateur Auth :",
          error
        );

        return NextResponse.json(
          {
            error:
              "Impossible de vérifier les utilisateurs existants.",
          },
          {
            status: 500,
          }
        );
      }

      existingUser = data.users.find(
        (authUser) =>
          authUser.email?.trim().toLowerCase() === email
      );

      if (data.users.length < perPage) {
        break;
      }

      page += 1;
    }

    // ========================================================
    // 6. CAS 1 :
    // UTILISATEUR DÉJÀ EXISTANT
    // ========================================================

    if (existingUser) {
      const existingUserId = existingUser.id;

      // ------------------------------------------------------
      // Vérifier membership existant
      // ------------------------------------------------------

      const {
        data: existingMembership,
        error: existingMembershipError,
      } = await supabaseAdmin
        .from("club_memberships")
        .select("id, role, status")
        .eq("user_id", existingUserId)
        .eq("club_id", clubId)
        .maybeSingle();

      if (existingMembershipError) {
        console.error(
          "Erreur vérification membership :",
          existingMembershipError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de vérifier le rattachement au club.",
          },
          {
            status: 500,
          }
        );
      }

      if (existingMembership?.status === "active") {
        return NextResponse.json(
          {
            error:
              "Cet utilisateur est déjà rattaché à ce club.",
          },
          {
            status: 409,
          }
        );
      }

      // ------------------------------------------------------
      // Récupérer le profil existant
      //
      // IMPORTANT :
      // on ne doit jamais transformer un manager
      // en customer.
      // ------------------------------------------------------

      const {
        data: existingProfile,
        error: existingProfileError,
      } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", existingUserId)
        .maybeSingle();

      if (existingProfileError) {
        console.error(
          "Erreur récupération profil existant :",
          existingProfileError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de récupérer le profil de l'utilisateur.",
          },
          {
            status: 500,
          }
        );
      }

      const profileRole =
        existingProfile?.role === "manager"
          ? "manager"
          : "customer";

      // ------------------------------------------------------
      // Créer / mettre à jour le profil
      // ------------------------------------------------------

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: existingUserId,
            firstname,
            lastname,
            role: profileRole,
          },
          {
            onConflict: "id",
          }
        );

      if (profileError) {
        console.error(
          "Erreur mise à jour profil :",
          profileError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de mettre à jour le profil.",
          },
          {
            status: 500,
          }
        );
      }

      // ------------------------------------------------------
      // Créer / réactiver le membership
      // ------------------------------------------------------

      const { error: membershipError } = await supabaseAdmin
        .from("club_memberships")
        .upsert(
          {
            user_id: existingUserId,
            club_id: clubId,
            role,
            status: "active",
            created_by: access.userId,
          },
          {
            onConflict: "user_id,club_id",
          }
        );

      if (membershipError) {
        console.error(
          "Erreur création membership :",
          membershipError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de rattacher cet utilisateur au club.",
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        success: true,
        invited: false,
        userId: existingUserId,
        clubId,
        role,
      });
    }

    // ========================================================
    // 7. CAS 2 :
    // NOUVEL UTILISATEUR
    // ========================================================

    const origin = request.nextUrl.origin;

    const {
      data: invitationData,
      error: invitationError,
    } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          firstname,
          lastname,
        },
        redirectTo: `${origin}/auth/reset-password`,
      }
    );

    if (invitationError || !invitationData.user) {
      console.error(
        "Erreur invitation Supabase :",
        invitationError
      );

      return NextResponse.json(
        {
          error:
            invitationError?.message ??
            "Impossible d'envoyer l'invitation.",
        },
        {
          status: 500,
        }
      );
    }

    const invitedUser = invitationData.user;

    // ========================================================
    // 8. CRÉER LE PROFIL
    // ========================================================

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: invitedUser.id,
          firstname,
          lastname,
          role: "customer",
        },
        {
          onConflict: "id",
        }
      );

    if (profileError) {
      console.error(
        "Erreur création profil invité :",
        profileError
      );

      // Nettoyage Auth pour éviter un compte incomplet
      await supabaseAdmin.auth.admin.deleteUser(
        invitedUser.id
      );

      return NextResponse.json(
        {
          error:
            "Invitation créée mais le profil n'a pas pu être enregistré.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // 9. CRÉER LE MEMBERSHIP
    // ========================================================

    const { error: membershipError } = await supabaseAdmin
      .from("club_memberships")
      .insert({
        user_id: invitedUser.id,
        club_id: clubId,
        role,
        status: "active",
        created_by: access.userId,
      });

    if (membershipError) {
      console.error(
        "Erreur création membership invité :",
        membershipError
      );

      // Nettoyage du profil
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", invitedUser.id);

      // Nettoyage Auth
      await supabaseAdmin.auth.admin.deleteUser(
        invitedUser.id
      );

      return NextResponse.json(
        {
          error:
            "Impossible de rattacher l'administrateur au club.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // 10. SUCCESS
    // ========================================================

    return NextResponse.json({
      success: true,
      invited: true,
      userId: invitedUser.id,
      clubId,
      role,
    });
  } catch (error) {
    console.error(
      "POST /api/manager/club-admins :",
      error
    );

    return NextResponse.json(
      {
        error: "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}
