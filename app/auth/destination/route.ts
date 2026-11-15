import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/admin-access";

export async function GET(request: NextRequest) {
  const access = await getAdminAccess();

  const organizerIntent =
    request.nextUrl.searchParams.get("next") ===
    "/organisateur/inscription";

  let destination = "/events";

  if (!access) {
    destination = "/login";
  } else if (access.isManager) {
    destination = "/manager";
  } else if (access.managedClubIds.length > 0) {
    destination = "/admin";
  } else if (access.canScanAnyClub) {
    destination = "/admin/scan";
  } else if (organizerIntent) {
    destination = "/organisateur/inscription";
  }

  return NextResponse.redirect(
    new URL(destination, request.url)
  );
}
