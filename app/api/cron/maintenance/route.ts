import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { dispatchMergeFinalizedEmails } from "@/lib/email/merge";

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
    // expire_due_merge_proposals ne renvoie qu'un compteur (contrat
    // existant, non modifié). On lit donc la liste des fusions dues
    // AVANT l'appel, pour savoir ensuite lesquelles notifier une fois
    // finalize_vip_offer_merge exécuté à l'intérieur du RPC — lecture
    // additive, aucun changement du RPC lui-même.
    let dueSourceOfferIds: string[] = [];
    if (rpc === "expire_due_merge_proposals") {
      const { data: due } = await supabaseAdmin
        .from("vip_merge_proposals")
        .select("source_offer_id")
        .eq("status", "pending")
        .lte("expires_at", new Date().toISOString());
      dueSourceOfferIds = (due ?? []).map((row) => row.source_offer_id);
    }

    const { data, error } = await supabaseAdmin.rpc(rpc);
    if (error) {
      errors.push(`${rpc}: ${error.message}`);
      console.error("Cron VIP Share RPC error", { rpc, error: error.message });
    } else {
      result[key] = Number(data ?? 0);
    }

    if (rpc === "expire_due_merge_proposals" && !error) {
      for (const sourceOfferId of dueSourceOfferIds) {
        // Une panne d'email ne doit jamais faire échouer le cron : les
        // transitions métier (finalize_vip_offer_merge) sont déjà
        // commitées par le RPC ci-dessus, quel que soit le résultat de
        // l'email.
        try {
          await dispatchMergeFinalizedEmails(sourceOfferId);
        } catch (emailError) {
          console.error("cron : envoi de l'email de fusion finalisée impossible", {
            sourceOfferId,
            message: emailError instanceof Error ? emailError.message : "Erreur inconnue",
          });
        }
      }
    }
  }

  return NextResponse.json(
    errors.length ? { ...result, errors } : result,
    { status: errors.length ? 207 : 200 }
  );
}
