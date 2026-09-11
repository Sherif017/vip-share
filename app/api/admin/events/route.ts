import {
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request
) {
  try {
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

    const {
      data: profile,
    } = await supabaseAdmin
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

    const {
      clubMode,
      clubId,

      clubName,
      clubCity,
      clubAddress,

      name,
      slug,
      eventDate,
      startTime,
      music,

      capacity,
      confirmationThreshold,

      pricePerPerson,
      depositPerPerson,
    } = body;

    if (
      !name ||
      !slug ||
      !eventDate ||
      !startTime
    ) {
      return NextResponse.json(
        {
          error:
            "Les informations de la soirée sont incomplètes.",
        },
        {
          status: 400,
        }
      );
    }

    const parsedCapacity =
      Number(capacity);

    const parsedThreshold =
      Number(
        confirmationThreshold
      );

    const parsedPrice =
      Number(
        pricePerPerson
      );

    const parsedDeposit =
      Number(
        depositPerPerson
      );

    if (
      !Number.isInteger(
        parsedCapacity
      ) ||
      parsedCapacity < 1
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
        parsedThreshold
      ) ||
      parsedThreshold < 1 ||
      parsedThreshold >
        parsedCapacity
    ) {
      return NextResponse.json(
        {
          error:
            "Le seuil doit être compris entre 1 et la capacité.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(
        parsedPrice
      ) ||
      parsedPrice <= 0
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
        parsedDeposit
      ) ||
      parsedDeposit < 0 ||
      parsedDeposit >
        parsedPrice
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

    let finalClubId =
      clubId;

    /*
    |--------------------------------------------------------------------------
    | Nouveau club
    |--------------------------------------------------------------------------
    */

    if (
      clubMode === "new"
    ) {
      if (
        !clubName ||
        !clubCity
      ) {
        return NextResponse.json(
          {
            error:
              "Nom et ville du club obligatoires.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: newClub,
        error:
          clubInsertError,
      } =
        await supabaseAdmin
          .from("clubs")
          .insert({
            name:
              clubName.trim(),

            city:
              clubCity.trim(),

            address:
              clubAddress?.trim() ||
              null,
          })
          .select("id")
          .single();

      if (
        clubInsertError ||
        !newClub
      ) {
        console.error(
          "Erreur création club :",
          clubInsertError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de créer le club.",
          },
          {
            status: 500,
          }
        );
      }

      finalClubId =
        newClub.id;
    }

    /*
    |--------------------------------------------------------------------------
    | Vérifier le club
    |--------------------------------------------------------------------------
    */

    if (!finalClubId) {
      return NextResponse.json(
        {
          error:
            "Club invalide.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Vérifier que le slug n'existe pas
    |--------------------------------------------------------------------------
    */

    const {
      data:
        existingEvent,
    } =
      await supabaseAdmin
        .from("events")
        .select("id")
        .eq(
          "slug",
          slug.trim()
        )
        .maybeSingle();

    if (existingEvent) {
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

    /*
    |--------------------------------------------------------------------------
    | Créer événement
    |--------------------------------------------------------------------------
    */

    const {
      data: event,
      error:
        eventInsertError,
    } =
      await supabaseAdmin
        .from("events")
        .insert({
          club_id:
            finalClubId,

          slug:
            slug
              .trim()
              .toLowerCase(),

          name:
            name.trim(),

          event_date:
            eventDate,

          start_time:
            startTime,

          music:
            music?.trim() ||
            null,

          status:
            "published",
        })
        .select(
          "id, slug"
        )
        .single();

    if (
      eventInsertError ||
      !event
    ) {
      console.error(
        "Erreur création event :",
        eventInsertError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de créer la soirée.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Créer offre VIP
    |--------------------------------------------------------------------------
    */

    const {
      error:
        offerInsertError,
    } =
      await supabaseAdmin
        .from(
          "vip_offers"
        )
        .insert({
          event_id:
            event.id,

          capacity:
            parsedCapacity,

          confirmation_threshold:
            parsedThreshold,

          price_per_person:
            parsedPrice,

          deposit_per_person:
            parsedDeposit,

          remaining_per_person:
            parsedPrice -
            parsedDeposit,

          spots_reserved: 0,

          status:
            "forming",
        });

    if (
      offerInsertError
    ) {
      console.error(
        "Erreur création offre VIP :",
        offerInsertError
      );

      /*
       * On évite de laisser
       * un événement sans offre.
       */
      await supabaseAdmin
        .from("events")
        .delete()
        .eq(
          "id",
          event.id
        );

      return NextResponse.json(
        {
          error:
            "Impossible de créer l'offre VIP.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        eventId:
          event.id,
        slug:
          event.slug,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/admin/events :",
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