import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const jobs = [
  ["expiredReservations", "expire_stale_pending_reservations"],
  ["reviewedTables", "refresh_due_vip_offers"],
  ["expiredMerges", "expire_due_merge_proposals"],
  ["expiredDecisions", "expire_due_supplement_decisions"],
] as const;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const result: Record<string, number> = {};
  const errors: string[] = [];
  for (const [key, rpc] of jobs) {
    const { data, error } = await supabaseAdmin.rpc(rpc);
    if (error) {
      errors.push(`${rpc}: ${error.message}`);
      console.error("Cron VIP Share RPC error", { rpc, error: error.message });
    } else {
      result[key] = Number(data ?? 0);
    }
  }
  return NextResponse.json(
    errors.length ? { ...result, errors } : result,
    { status: errors.length ? 207 : 200 }
  );
}
