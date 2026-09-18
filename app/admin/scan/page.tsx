import { redirect } from "next/navigation";

import {
  getAdminAccess,
} from "@/lib/admin-access";

import ScanClient from "./ScanClient";

export default async function ScanPage() {
  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.canScanAnyClub) {
    redirect("/events");
  }

  return (
    <ScanClient />
  );
}