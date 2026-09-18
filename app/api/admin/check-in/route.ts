import { NextResponse } from "next/server";

import {
  canScanClub,
  getAdminAccess,
} from "@/lib/admin-access";

import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    // ========================================================
    // 1. UTILISATEUR + DROITS
    // ========================================================

    const access = await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        {
          error: "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }

    if (!access.canScanAnyClub) {
      return NextResponse.json(
        {
          error: "Accès scanner non autorisé.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 2. CODE RÉSERVATION
    // ========================================================

    const body = await request.json();

    const code =
      typeof body.code === "string"
        ? body.code.trim()
        : "";

    if (!code) {
      return NextResponse.json(
        {
          error: "Code de réservation manquant.",
        },
        {
          status: 400,
        }
      );
    }

    // ========================================================
    // 3. RÉCUPÉRER LA RÉSERVATION AVANT LE SCAN
    //
    // IMPORTANT :
    // on vérifie le club AVANT d'appeler check_in_reservation.
    //
    // Sinon un scanner d'un autre club pourrait consommer
    // une entrée avant que l'API ne refuse la requête.
    // ========================================================

    const {
      data: reservation,
      error: reservationError,
    } = await supabaseAdmin
      .from("reservations")
      .select(`
        id,
        event_id,
        vip_offer_id,
        reservation_code,
        status
      `)
      .eq("reservation_code", code)
      .maybeSingle();

    if (reservationError) {
      console.error(
        "Erreur récupération réservation avant check-in :",
        reservationError
      );

      return NextResponse.json(
        {
          error: "Impossible de vérifier cette réservation.",
        },
        {
          status: 500,
        }
      );
    }

    if (!reservation) {
      return NextResponse.json(
        {
          error: "Réservation introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // 4. RÉCUPÉRER LA SOIRÉE / CLUB
    // ========================================================

    const {
      data: event,
      error: eventError,
    } = await supabaseAdmin
      .from("events")
      .select(`
        id,
        club_id,
        name,
        clubs (
          id,
          name,
          city
        )
      `)
      .eq("id", reservation.event_id)
      .maybeSingle();

    if (eventError) {
      console.error(
        "Erreur récupération événement check-in :",
        eventError
      );

      return NextResponse.json(
        {
          error: "Impossible de vérifier le club de cette réservation.",
        },
        {
          status: 500,
        }
      );
    }

    if (!event) {
      return NextResponse.json(
        {
          error: "Soirée introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    // ========================================================
    // 5. VÉRIFICATION DU CLUB
    // ========================================================

    const allowed = canScanClub(
      access,
      event.club_id
    );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Ce pass appartient à un autre club. Vous n'êtes pas autorisé à le scanner.",
        },
        {
          status: 403,
        }
      );
    }

    // ========================================================
    // 6. CHECK-IN
    //
    // Seulement maintenant on consomme réellement une entrée.
    // ========================================================

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "check_in_reservation",
      {
        p_reservation_code: code,
      }
    );

    if (error) {
      console.error(
        "Erreur check_in_reservation :",
        error
      );

      return NextResponse.json(
        {
          error: "Impossible de vérifier cette réservation.",
        },
        {
          status: 500,
        }
      );
    }

    const result = Array.isArray(data)
      ? data[0]
      : data;

    if (!result) {
      return NextResponse.json(
        {
          error: "Résultat de scan introuvable.",
        },
        {
          status: 500,
        }
      );
    }

    // ========================================================
    // 7. INFORMATIONS TABLE
    //
    // Cette partie est volontairement NON bloquante.
    //
    // Si l'enrichissement échoue après le RPC, on ne renvoie
    // surtout pas une erreur 500 alors que l'entrée a déjà
    // été consommée.
    // ========================================================

    let tableNumber: string | null = null;
    let tableCapacity: number | null = null;

    let tableExpected: number | null = null;
    let tableCheckedIn: number | null = null;
    let tableRemaining: number | null = null;

    try {
      const {
        data: offer,
        error: offerError,
      } = await supabaseAdmin
        .from("vip_offers")
        .select(`
          id,
          table_number,
          capacity
        `)
        .eq(
          "id",
          reservation.vip_offer_id
        )
        .maybeSingle();

      if (offerError) {
        console.error(
          "Erreur récupération table après scan :",
          offerError
        );
      }

      if (offer) {
        tableNumber =
          offer.table_number;

        tableCapacity =
          Number(
            offer.capacity
          );

        // ----------------------------------------------------
        // Participants réellement confirmés de CETTE table
        // ----------------------------------------------------

        const {
          data: confirmedReservations,
          error: confirmedError,
        } = await supabaseAdmin
          .from("reservations")
          .select(`
            quantity,
            checked_in_quantity
          `)
          .eq(
            "vip_offer_id",
            reservation.vip_offer_id
          )
          .eq(
            "status",
            "confirmed"
          );

        if (confirmedError) {
          console.error(
            "Erreur calcul statistiques table après scan :",
            confirmedError
          );
        } else {
          const rows =
            confirmedReservations ?? [];

          tableExpected =
            rows.reduce(
              (
                total,
                item
              ) =>
                total +
                Number(
                  item.quantity ?? 0
                ),
              0
            );

          tableCheckedIn =
            rows.reduce(
              (
                total,
                item
              ) =>
                total +
                Number(
                  item.checked_in_quantity ?? 0
                ),
              0
            );

          tableRemaining =
            Math.max(
              tableExpected -
                tableCheckedIn,
              0
            );
        }
      }
    } catch (enrichmentError) {
      console.error(
        "Erreur enrichissement résultat scanner :",
        enrichmentError
      );
    }

    // ========================================================
    // 8. CLUB
    // ========================================================

    const club = Array.isArray(
      event.clubs
    )
      ? event.clubs[0]
      : event.clubs;

    // ========================================================
    // 9. RESPONSE
    // ========================================================

    return NextResponse.json({
      success:
        Boolean(
          result.success
        ),

      message:
        result.message,

      reservation: {
        id:
          result.reservation_id ??
          reservation.id,

        firstname:
          result.firstname,

        lastname:
          result.lastname,

        quantity:
          Number(
            result.quantity ?? 0
          ),

        checkedInQuantity:
          Number(
            result.checked_in_quantity ??
              0
          ),

        remainingEntries:
          Number(
            result.remaining_entries ??
              0
          ),

        eventName:
          result.event_name ??
          event.name,

        clubName:
          result.club_name ??
          club?.name ??
          "Club",

        checkedIn:
          Boolean(
            result.checked_in
          ),

        checkedInAt:
          result.checked_in_at ??
          null,

        // --------------------------------------------
        // TABLE
        // --------------------------------------------

        tableNumber,

        tableCapacity,

        tableExpected,

        tableCheckedIn,

        tableRemaining,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/admin/check-in :",
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