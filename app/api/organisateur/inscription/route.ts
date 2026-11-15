import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Vous devez être connecté." },
        { status: 401 }
      );
    }

    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Veuillez confirmer votre adresse email." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const clean = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";

    const firstname = clean(body.firstname);
    const lastname = clean(body.lastname);
    const organizationName = clean(body.organizationName);
    const city = clean(body.city);

    const fields = [
      firstname,
      lastname,
      organizationName,
      city,
    ];

    if (fields.some((value) => !value || value.length > 120)) {
      return NextResponse.json(
        { error: "Veuillez renseigner correctement tous les champs." },
        { status: 400 }
      );
    }

    const { data: clubId, error } = await supabaseAdmin.rpc(
      "register_organizer",
      {
        p_user_id: user.id,
        p_firstname: firstname,
        p_lastname: lastname,
        p_organization_name: organizationName,
        p_city: city,
      }
    );

    if (error) {
      if (error.message === "Compte partenaire deja existant") {
        return NextResponse.json(
          { error: "Vous possédez déjà un compte organisateur." },
          { status: 409 }
        );
      }

      if (error.message === "Compte administrateur existant") {
        return NextResponse.json(
          { error: "Vous possédez déjà un compte administrateur." },
          { status: 403 }
        );
      }

      console.error("Organizer registration failed", {
        code: error.code,
      });

      return NextResponse.json(
        { error: "Impossible de créer votre espace organisateur." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        clubId,
        redirectTo: "/admin",
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de traiter votre demande." },
      { status: 400 }
    );
  }
}
