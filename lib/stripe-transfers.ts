import "server-only";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

type TransferTxn = {
  id: string;
  reservation_id: string;
  event_id: string;
  club_id: string;
  club_net_cents: number;
  currency: string;
  stripe_account_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_transfer_id: string | null;
  transfer_group: string;
  transfer_status: string;
  transfer_first_requested_at: string | null;
  transfer_attempt_count: number;
};

const TRANSFER_RETRY_WINDOW_MS =
  20 * 60 * 60 * 1000;

function assertTransferRetryWindow(txn: TransferTxn) {
  const firstAttempt = txn.transfer_first_requested_at
    ? Date.parse(txn.transfer_first_requested_at)
    : NaN;

  const age = Date.now() - firstAttempt;

  if (
    !Number.isFinite(firstAttempt) ||
    age < 0 ||
    age >= TRANSFER_RETRY_WINDOW_MS
  ) {
    throw new Error(
      "Fenetre de reprise Stripe depassee ou inconnue. Verification manuelle requise."
    );
  }
}

async function resolveChargeId(
  txn: TransferTxn
) {
  if (txn.stripe_charge_id) {
    return txn.stripe_charge_id;
  }

  if (!txn.stripe_payment_intent_id) {
    throw new Error(
      "PaymentIntent Stripe absent."
    );
  }

  const intent =
    await stripe.paymentIntents.retrieve(
      txn.stripe_payment_intent_id
    );

  const latestCharge =
    intent.latest_charge;

  const chargeId =
    typeof latestCharge === "string"
      ? latestCharge
      : latestCharge?.id ?? null;

  if (!chargeId) {
    throw new Error(
      "Charge Stripe introuvable."
    );
  }

  const { error } =
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        stripe_charge_id: chargeId,
      })
      .eq("id", txn.id)
      .is("stripe_charge_id", null);

  if (error) {
    throw error;
  }

  return chargeId;
}

async function recoverExistingTransfer(
  txn: TransferTxn,
  chargeId: string
) {
  const matches = [];

  for await (const transfer of stripe.transfers.list({
    transfer_group: txn.transfer_group,
    limit: 100,
  })) {
    if (
      transfer.metadata?.payment_transaction_id !== txn.id
    ) {
      continue;
    }

    const destination =
      typeof transfer.destination === "string"
        ? transfer.destination
        : transfer.destination?.id ?? null;

    const sourceTransaction =
      typeof transfer.source_transaction === "string"
        ? transfer.source_transaction
        : transfer.source_transaction?.id ?? null;

    if (
      transfer.amount !== txn.club_net_cents ||
      transfer.currency.toLowerCase() !==
        txn.currency.toLowerCase() ||
      destination !== txn.stripe_account_id ||
      sourceTransaction !== chargeId ||
      transfer.reversed ||
      transfer.amount_reversed > 0
    ) {
      throw new Error(
        "Transfert Stripe existant incoherent. Verification manuelle requise."
      );
    }

    matches.push(transfer);

    if (matches.length > 1) {
      throw new Error(
        "Plusieurs transferts Stripe detectes. Verification manuelle requise."
      );
    }
  }

  return matches[0] ?? null;
}


async function transferOne(
  transactionId: string
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin.rpc(
      "claim_payment_transfer",
      {
        p_transaction_id:
          transactionId,
      }
    );

  if (error) {
    throw error;
  }

  const txn =
    data as TransferTxn | null;

  if (!txn) {
    throw new Error(
      "Transaction transférable introuvable."
    );
  }

  if (
    txn.stripe_transfer_id ||
    txn.transfer_status ===
      "transferred"
  ) {
    return {
      transactionId: txn.id,
      transferId:
        txn.stripe_transfer_id,
      recovered: true,
    };
  }

  // Par defaut, le resultat financier reste incertain
  // tant que la recherche des transferts existants
  // n'a pas ete terminee.
  let financialOutcomeUncertain = true;

  try {
    /*
     * Separate Charges and Transfers exige que le compte
     * connecté puisse réellement recevoir des Transfers.
     *
     * On vérifie Stripe en temps réel juste avant le mouvement
     * d'argent : les snapshots locaux charges_enabled /
     * payouts_enabled ne remplacent pas cette capability.
     */
    const chargeId =
      await resolveChargeId(txn);

    /*
     * Protection supplémentaire contre un retry très tardif :
     * avant de créer quoi que ce soit, on recherche un transfert
     * Stripe portant notre identifiant interne.
     */
    let transfer =
      await recoverExistingTransfer(
        txn,
        chargeId
      );

    const recovered = Boolean(transfer);

    if (!transfer) {
      // Une ancienne tentative non retrouvee ne prouve
      // pas qu'aucun transfert n'a ete execute.
      assertTransferRetryWindow(txn);

      // Seule une premiere tentative peut etre marquee
      // failed avant tout appel de creation Stripe.
      financialOutcomeUncertain =
        txn.transfer_attempt_count !== 1;
      const { data: club, error: clubError } = await supabaseAdmin
        .from("clubs")
        .select(`
          stripe_account_id,
          stripe_connection_type,
          stripe_oauth_revoked_at,
          stripe_charges_enabled,
          stripe_payouts_enabled
        `)
        .eq("id", txn.club_id)
        .single();

      if (clubError) throw clubError;

      if (!club || club.stripe_account_id !== txn.stripe_account_id) {
        throw new Error(
          "Le compte Stripe du club ne correspond plus a la transaction."
        );
      }

      if (club.stripe_oauth_revoked_at) {
        throw new Error(
          "L'autorisation Stripe OAuth du club a ete revoquee."
        );
      }

      if (
        club.stripe_connection_type === "oauth" &&
        (!club.stripe_charges_enabled || !club.stripe_payouts_enabled)
      ) {
        throw new Error(
          "Le compte Stripe OAuth du club n'est pas operationnel."
        );
      }

      const connectedAccount =
        await stripe.accounts.retrieve(
          txn.stripe_account_id
        );

      if (
        connectedAccount.capabilities
          ?.transfers !== "active"
      ) {
        throw new Error(
          "La capability Stripe transfers du club n'est pas active."
        );
      }

      // Revalidation juste avant l'appel financier.
      assertTransferRetryWindow(txn);

      // Une erreur apres cet instant ne prouve pas
      // que Stripe n'a pas execute le transfert.
      financialOutcomeUncertain = true;

      transfer =
        await stripe.transfers.create(
          {
            amount:
              txn.club_net_cents,

            currency:
              txn.currency,

            destination:
              txn.stripe_account_id,

            source_transaction:
              chargeId,

            transfer_group:
              txn.transfer_group,

            metadata: {
              payment_transaction_id:
                txn.id,

              reservation_id:
                txn.reservation_id,

              event_id:
                txn.event_id,

              club_id:
                txn.club_id,
            },
          },
          {
            idempotencyKey:
              `kre-transfer:${txn.id}`,
          }
        );
    }

    const {
      data: completed,
      error: completeError,
    } =
      await supabaseAdmin.rpc(
        "complete_payment_transfer",
        {
          p_transaction_id:
            txn.id,

          p_stripe_transfer_id:
            transfer.id,

          p_stripe_charge_id:
            chargeId,
        }
      );

    if (completeError) {
      throw completeError;
    }

    return {
      transactionId:
        txn.id,

      transferId:
        transfer.id,

      recovered,

      completed,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erreur Stripe inconnue";

    if (!financialOutcomeUncertain) {
      const { error: failureError } =
        await supabaseAdmin.rpc(
          "fail_payment_transfer",
          {
            p_transaction_id: txn.id,
            p_error: message,
          }
        );

      if (failureError) {
        console.error(
          "Stripe Transfer: impossible de marquer la transaction failed",
          { transactionId: txn.id }
        );
      }
    } else {
      // Conserver processing : le prochain traitement
      // devra rechercher le transfert avant toute reprise.
      console.error(
        "Stripe Transfer: reconciliation necessaire",
        {
          transactionId: txn.id,
          message,
        }
      );
    }

    throw error;
  }
}

export async function transferApprovedEvent(
  eventId: string
) {
  const {
    data: transactions,
    error,
  } =
    await supabaseAdmin
      .from(
        "payment_transactions"
      )
      .select(`
        id,
        reservation_id,
        event_id,
        club_id,
        club_net_cents,
        currency,
        stripe_account_id,
        stripe_payment_intent_id,
        stripe_charge_id,
        stripe_transfer_id,
        transfer_group,
        transfer_status,
        transfer_first_requested_at,
        transfer_attempt_count
      `)
      .eq(
        "event_id",
        eventId
      )
      .eq(
        "status",
        "confirmed"
      )
      .in(
        "transfer_status",
        [
          "ready",
          "failed",
          "processing",
        ]
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  const results = [];

  for (
    const row
    of transactions ?? []
  ) {
    try {
      results.push({
        success: true,
        ...(await transferOne(
          row.id
        )),
      });
    } catch (error) {
      results.push({
        success: false,

        transactionId:
          row.id,

        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue",
      });
    }
  }

  const {
    data: settlement,
    error: settlementError,
  } =
    await supabaseAdmin.rpc(
      "finalize_event_settlement_if_complete",
      {
        p_event_id:
          eventId,
      }
    );

  if (settlementError) {
    throw settlementError;
  }

  return {
    results,
    settlement,
  };
}
