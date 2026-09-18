import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminAccess = {
  userId: string;

  isManager: boolean;

  managedClubIds: string[];

  scannerClubIds: string[];

  canManageAnyClub: boolean;

  canScanAnyClub: boolean;
};

function logAccessQueryError(
  context: string,
  error: { message?: string; code?: string },
  httpStatus: number,
) {
  // Never serialize the complete SDK error, request, user or authentication data.
  let message = error.message ?? "Erreur Supabase sans message";
  for (const name of [
    "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STAGING_DATABASE_URL",
  ]) {
    const value = process.env[name];
    if (value) message = message.split(value).join("[REDACTED]");
  }
  message = message
    .replace(/(?:sb_secret_|sb_publishable_|sk_live_|sk_test_|whsec_|eyJ)[A-Za-z0-9_.-]+/g, "[REDACTED]")
    .replace(/(?:https?|postgres(?:ql)?):\/\/\S+/g, "[REDACTED URL]")
    .replace(/(?:authorization|cookie|token)\s*[:=]\s*[^\r\n]+/gi, "[REDACTED AUTH]");
  // A serialized string remains readable in Next's overlay instead of showing {}.
  console.error("Erreur vérification permissions :", JSON.stringify({
    context,
    httpStatus,
    code: error.code && /^[A-Za-z0-9_]+$/.test(error.code) ? error.code : null,
    message: message.slice(0, 500),
  }));
}

export async function getAdminAccess(): Promise<AdminAccess | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // ==========================================================
  // PROFILE
  // ==========================================================

  const { data: profile, error: profileError, status: profileStatus } =
    await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    logAccessQueryError(
      "getAdminAccess: profiles.select(role), id=authenticated user",
      profileError,
      profileStatus,
    );

    throw new Error(
      "Impossible de vérifier les permissions utilisateur."
    );
  }

  const isManager =
    profile?.role === "manager";

  // ==========================================================
  // CLUB MEMBERSHIPS
  // ==========================================================

  const {
    data: memberships,
    error: membershipsError,
    status: membershipsStatus,
  } = await supabaseAdmin
    .from("club_memberships")
    .select("club_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipsError) {
    logAccessQueryError(
      "getAdminAccess: club_memberships.select(club_id,role,status), user_id=authenticated user, status=active",
      membershipsError,
      membershipsStatus,
    );

    throw new Error(
      "Impossible de vérifier les clubs autorisés."
    );
  }

  const activeMemberships =
    memberships ?? [];

  const managedClubIds =
    activeMemberships
      .filter(
        (membership) =>
          membership.role === "admin"
      )
      .map(
        (membership) =>
          membership.club_id
      );

  const scannerClubIds =
    activeMemberships
      .filter(
        (membership) =>
          membership.role === "admin" ||
          membership.role === "scanner"
      )
      .map(
        (membership) =>
          membership.club_id
      );

  return {
    userId: user.id,

    isManager,

    managedClubIds,

    scannerClubIds,

    canManageAnyClub:
      isManager ||
      managedClubIds.length > 0,

    canScanAnyClub:
      isManager ||
      scannerClubIds.length > 0,
  };
}

// ============================================================
// PEUT GÉRER UN CLUB ?
// ============================================================

export function canManageClub(
  access: AdminAccess,
  clubId: string
) {
  if (access.isManager) {
    return true;
  }

  return access.managedClubIds.includes(
    clubId
  );
}

// ============================================================
// PEUT SCANNER POUR UN CLUB ?
// ============================================================

export function canScanClub(
  access: AdminAccess,
  clubId: string
) {
  if (access.isManager) {
    return true;
  }

  return access.scannerClubIds.includes(
    clubId
  );
}

// ============================================================
// VÉRIFIER UNE SOIRÉE
// ============================================================

export async function canManageEvent(
  access: AdminAccess,
  eventId: string
) {
  const {
    data: event,
    error,
  } = await supabaseAdmin
    .from("events")
    .select("id, club_id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error(
      "Erreur récupération soirée :",
      error
    );

    throw new Error(
      "Impossible de vérifier la soirée."
    );
  }

  if (!event) {
    return false;
  }

  return canManageClub(
    access,
    event.club_id
  );
}

// ============================================================
// VÉRIFIER UNE TABLE
// ============================================================

export async function canManageVipOffer(
  access: AdminAccess,
  vipOfferId: string
) {
  const {
    data: offer,
    error,
  } = await supabaseAdmin
    .from("vip_offers")
    .select(`
      id,
      events (
        id,
        club_id
      )
    `)
    .eq("id", vipOfferId)
    .maybeSingle();

  if (error) {
    console.error(
      "Erreur récupération table VIP :",
      error
    );

    throw new Error(
      "Impossible de vérifier la table VIP."
    );
  }

  if (!offer) {
    return false;
  }

  const event = Array.isArray(
    offer.events
  )
    ? offer.events[0]
    : offer.events;

  if (!event) {
    return false;
  }

  return canManageClub(
    access,
    event.club_id
  );
}
