import { NextResponse } from "next/server";

import {
  canManageVipOffer,
  getAdminAccess,
} from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

    const { data: offer, error: offerError } = await supabaseAdmin
      .from("vip_offers")
      .select(`
        id,
        table_number,
        status,
        total_table_price,
        price_per_person
      `)
      .eq("id", id)
      .maybeSingle();

    if (offerError) throw offerError;

    if (!offer) {
      return NextResponse.json(
        { success: false, error: "Table introuvable." },
        { status: 404 }
      );
    }

    if (offer.status !== "admin_review") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cette table n'est plus en attente de décision administrateur.",
        },
        { status: 409 }
      );
    }

    const { data: reservations, error: reservationsError } =
      await supabaseAdmin
        .from("reservations")
        .select("quantity")
        .eq("vip_offer_id", id)
        .in("status", ["confirmed", "checked_in"]);

    if (reservationsError) throw reservationsError;

    const confirmedPeople = (reservations ?? []).reduce(
      (total, reservation) =>
        total + Number(reservation.quantity ?? 0),
      0
    );

    if (confirmedPeople <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucun participant confirmé sur cette table.",
        },
        { status: 409 }
      );
    }

    const totalTablePrice = Number(offer.total_table_price);
    const originalPricePerPerson = Number(offer.price_per_person);

    if (
      !Number.isFinite(totalTablePrice) ||
      totalTablePrice <= 0 ||
      !Number.isFinite(originalPricePerPerson) ||
      originalPricePerPerson <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Les informations tarifaires de cette table sont invalides.",
        },
        { status: 409 }
      );
    }

    const roundMoney = (value: number) =>
      Math.round((value + Number.EPSILON) * 100) / 100;

    const newPricePerPerson = roundMoney(
      totalTablePrice / confirmedPeople
    );

    const supplementPerPerson = roundMoney(
      newPricePerPerson - originalPricePerPerson
    );

    if (supplementPerPerson <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Aucun supplément n'est nécessaire pour cette table.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      preview: {
        tableNumber: String(offer.table_number ?? ""),
        confirmedPeople,
        totalTablePrice,
        originalPricePerPerson,
        newPricePerPerson,
        supplementPerPerson,
        decisionHours: 24,
      },
    });
  } catch (error) {
    console.error("supplement-preview error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Impossible de calculer le supplément.",
      },
      { status: 500 }
    );
  }
}
