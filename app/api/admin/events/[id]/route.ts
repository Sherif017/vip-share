import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(
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

    const supabase =
      await createClient();

    const {
      data: { user },
    } =
      await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }

    const { data: profile } =
      await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

    if (!profile?.is_admin) {
      return NextResponse.json(
        {
          error:
            "Accès administrateur requis.",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      await request.json();

    const name =
      String(
        body.name ?? ""
      ).trim();

    const slug =
      String(
        body.slug ?? ""
      )
        .trim()
        .toLowerCase();

    const eventDate =
      String(
        body.eventDate ?? ""
      );

    const startTime =
      String(
        body.startTime ?? ""
      );

    const music =
      String(
        body.music ?? ""
      ).trim();

    const capacity =
      Number(
        body.capacity
      );

    const confirmationThreshold =
      Number(
        body.confirmationThreshold
      );

    const pricePerPerson =
      Number(
        body.pricePerPerson
      );

    const depositPerPerson =
      Number(
        body.depositPerPerson
      );

    if (
      !name ||
      !slug ||
      !eventDate ||
      !startTime
    ) {
      return NextResponse.json(
        {
          error:
            "Informations incomplètes.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(
        capacity
      ) ||
      capacity < 1
    ) {
      return NextResponse.json(
        {
          error:
            "Capacité invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(
        confirmationThreshold
      ) ||
      confirmationThreshold <
        1 ||
      confirmationThreshold >
        capacity
    ) {
      return NextResponse.json(
        {
          error:
            "Seuil de confirmation invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(
        pricePerPerson
      ) ||
      pricePerPerson <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Prix invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(
        depositPerPerson
      ) ||
      depositPerPerson < 0 ||
      depositPerPerson >
        pricePerPerson
    ) {
      return NextResponse.json(
        {
          error:
            "Acompte invalide.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: offer,
    } = await supabaseAdmin
      .from("vip_offers")
      .select(
        "id, spots_reserved"
      )
      .eq(
        "event_id",
        id
      )
      .maybeSingle();

    if (!offer) {
      return NextResponse.json(
        {
          error:
            "Offre VIP introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      capacity <
      Number(
        offer.spots_reserved
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Impossible de réduire la capacité sous ${offer.spots_reserved} places.`,
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: slugEvent,
    } = await supabaseAdmin
      .from("events")
      .select("id")
      .eq(
        "slug",
        slug
      )
      .neq(
        "id",
        id
      )
      .maybeSingle();

    if (slugEvent) {
      return NextResponse.json(
        {
          error:
            "Ce slug est déjà utilisé.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      error: eventError,
    } = await supabaseAdmin
      .from("events")
      .update({
        name,
        slug,
        event_date:
          eventDate,
        start_time:
          startTime,
        music:
          music || null,
      })
      .eq("id", id);

    if (eventError) {
      console.error(
        "Erreur update event :",
        eventError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de modifier la soirée.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      error: offerError,
    } = await supabaseAdmin
      .from("vip_offers")
      .update({
        capacity,

        confirmation_threshold:
          confirmationThreshold,

        price_per_person:
          pricePerPerson,

        deposit_per_person:
          depositPerPerson,

        remaining_per_person:
          pricePerPerson -
          depositPerPerson,
      })
      .eq(
        "id",
        offer.id
      );

    if (offerError) {
      console.error(
        "Erreur update offer :",
        offerError
      );

      return NextResponse.json(
        {
          error:
            "La soirée a été modifiée mais l'offre VIP n'a pas pu être mise à jour.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "PATCH /api/admin/events/[id] :",
      error
    );

    return NextResponse.json(
      {
        error:
          "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}