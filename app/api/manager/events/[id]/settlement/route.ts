import {
  NextResponse,
} from "next/server";

import {
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  transferApprovedEvent,
} from "@/lib/stripe-transfers";


type Action =
  | "approve"
  | "transfer"
  | "hold";


export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } =
      await params;


    const access =
      await getAdminAccess();


    if (!access) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }


    /*
     * /manager/ correspond ici à
     * l'administration plateforme K-RÉ.
     *
     * Le règlement financier reste
     * strictement réservé à
     * profiles.role = manager.
     */

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select("id,role")
        .eq(
          "id",
          access.userId
        )
        .maybeSingle();


    if (
      profileError ||
      !profile ||
      profile.role !== "manager"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Accès K-RÉ requis.",
        },
        {
          status: 403,
        }
      );
    }


    const body =
      await request
        .json()
        .catch(() => ({}));


    const action =
      body?.action as
        | Action
        | undefined;


    if (
      action !== "approve" &&
      action !== "transfer" &&
      action !== "hold"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Action invalide.",
        },
        {
          status: 400,
        }
      );
    }


    /*
     * HOLD
     */

    if (action === "hold") {
      const {
        data,
        error,
      } =
        await supabaseAdmin.rpc(
          "admin_hold_event_settlement",
          {
            p_event_id:
              id,

            p_admin_user_id:
              access.userId,

            p_reason:
              typeof body.reason ===
              "string"
                ? body.reason
                    .trim()
                    .slice(
                      0,
                      1000
                    )
                : null,
          }
        );


      if (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error.message,
          },
          {
            status:
              error.code ===
              "42501"
                ? 403
                : 409,
          }
        );
      }


      return NextResponse.json({
        success: true,
        action: "hold",
        settlement: data,
      });
    }


    /*
     * APPROVE
     *
     * IMPORTANT :
     * cette action ne contacte jamais Stripe.
     *
     * Elle rend uniquement les transactions
     * éligibles après les contrôles DB.
     */

    if (action === "approve") {
      const {
        data,
        error,
      } =
        await supabaseAdmin.rpc(
          "admin_approve_event_settlement",
          {
            p_event_id:
              id,

            p_admin_user_id:
              access.userId,
          }
        );


      if (error) {
        return NextResponse.json(
          {
            success: false,
            error:
              error.message,
          },
          {
            status:
              error.code ===
              "42501"
                ? 403
                : 409,
          }
        );
      }


      return NextResponse.json({
        success: true,
        action: "approve",
        approval: data,
      });
    }


    /*
     * TRANSFER
     *
     * Deuxième action explicite.
     *
     * Le RPC claim_payment_transfer
     * revalide encore tous les garde-fous
     * juste avant chaque mouvement Stripe.
     */

    const transferResult =
      await transferApprovedEvent(
        id
      );


    return NextResponse.json({
      success: true,
      action: "transfer",

      transfers:
        transferResult.results,

      settlement:
        transferResult.settlement,
    });

  } catch (error) {
    console.error(
      "K-RÉ settlement error:",
      error
    );


    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Erreur de règlement.",
      },
      {
        status: 500,
      }
    );
  }
}
