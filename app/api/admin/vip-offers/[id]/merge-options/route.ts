import { NextResponse } from "next/server";

import {
  canManageVipOffer,
  getAdminAccess,
} from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ACTIVE_RESERVATION_STATUSES = ["confirmed", "checked_in"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        { success: false, error: "Utilisateur non connecté." },
        { status: 401 }
      );
    }

    if (!access.canManageAnyClub) {
      return NextResponse.json(
        { success: false, error: "Accès administrateur requis." },
        { status: 403 }
      );
    }

    if (!(await canManageVipOffer(access, id))) {
      return NextResponse.json(
        { success: false, error: "Tu n'as pas accès à cette table." },
        { status: 403 }
      );
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from("vip_offers")
      .select(`
        id,
        event_id,
        table_number,
        capacity,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        status,
        merge_status
      `)
      .eq("id", id)
      .maybeSingle();

    if (sourceError) throw sourceError;

    if (!source) {
      return NextResponse.json(
        { success: false, error: "Table introuvable." },
        { status: 404 }
      );
    }

    if (source.status !== "admin_review") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette table n'est plus en attente de décision administrateur.",
        },
        { status: 409 }
      );
    }

    if (source.merge_status === "pending") {
      return NextResponse.json(
        { success: false, error: "Une fusion est déjà en attente." },
        { status: 409 }
      );
    }

    const { data: offers, error: offersError } = await supabaseAdmin
      .from("vip_offers")
      .select(`
        id,
        table_number,
        capacity,
        price_per_person,
        deposit_per_person,
        remaining_per_person,
        status,
        merge_status
      `)
      .eq("event_id", source.event_id)
      .neq("id", source.id);

    if (offersError) throw offersError;

    const offerIds = [source.id, ...(offers ?? []).map((offer) => offer.id)];

    const { data: reservations, error: reservationsError } =
      await supabaseAdmin
        .from("reservations")
        .select(`
          vip_offer_id,
          quantity,
          status,
          checked_in,
          checked_in_quantity,
          checked_in_at,
          supplement_amount,
          supplement_status,
          supplement_paid_at,
          supplement_stripe_session_id,
          stripe_supplement_session_id
        `)
        .in("vip_offer_id", offerIds)
        .in("status", ACTIVE_RESERVATION_STATUSES);

    if (reservationsError) throw reservationsError;

    const blockedOfferIds = new Set<string>();
    const peopleByOffer = new Map<string, number>();

    for (const reservation of reservations ?? []) {
      if (
        reservation.status === "checked_in" ||
        reservation.checked_in === true ||
        Number(reservation.checked_in_quantity ?? 0) > 0 ||
        reservation.checked_in_at ||
        reservation.supplement_paid_at ||
        Number(reservation.supplement_amount ?? 0) !== 0 ||
        reservation.supplement_status ||
        reservation.supplement_stripe_session_id ||
        reservation.stripe_supplement_session_id
      ) {
        blockedOfferIds.add(reservation.vip_offer_id);
      }

      peopleByOffer.set(
        reservation.vip_offer_id,
        (peopleByOffer.get(reservation.vip_offer_id) ?? 0) +
          Number(reservation.quantity ?? 0)
      );
    }

    const sourcePeople = peopleByOffer.get(source.id) ?? 0;

    if (blockedOfferIds.has(source.id)) {
      return NextResponse.json(
        { success: false, error: "Une réservation source est déjà entrée ou liée à un supplément." },
        { status: 409 }
      );
    }

    const blockedStatuses = new Set([
      "cancelled",
      "refunding",
      "refunded",
      "merged",
      "refund_pending",
      "merge_pending",
      "decision_pending",
      "supplement_payment_pending",
    ]);

    const options = (offers ?? [])
      .filter((offer) => {
        if (blockedOfferIds.has(offer.id)) return false;
        if (blockedStatuses.has(offer.status)) return false;
        if (offer.merge_status === "pending") return false;

        if (
          Number(offer.price_per_person) !== Number(source.price_per_person) ||
          Number(offer.deposit_per_person) !==
            Number(source.deposit_per_person) ||
          Number(offer.remaining_per_person) !==
            Number(source.remaining_per_person)
        ) {
          return false;
        }

        const targetPeople = peopleByOffer.get(offer.id) ?? 0;

        return sourcePeople + targetPeople <= Number(offer.capacity);
      })
      .map((offer) => {
        const targetPeople = peopleByOffer.get(offer.id) ?? 0;
        const combinedPeople = sourcePeople + targetPeople;

        return {
          id: offer.id,
          tableNumber: String(offer.table_number ?? ""),
          capacity: Number(offer.capacity),
          confirmedPeople: targetPeople,
          combinedPeople,
          availablePlacesAfterMerge:
            Number(offer.capacity) - combinedPeople,
        };
      })
      .sort((a, b) =>
        a.tableNumber.localeCompare(b.tableNumber, "fr", {
          numeric: true,
        })
      );

    return NextResponse.json({
      success: true,
      source: {
        id: source.id,
        tableNumber: String(source.table_number ?? ""),
        confirmedPeople: sourcePeople,
      },
      options,
    });
  } catch (error) {
    console.error("merge-options error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de rechercher les tables compatibles.",
      },
      { status: 500 }
    );
  }
}
