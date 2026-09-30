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
};

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
  txn: TransferTxn
) {
  const transfers =
    await stripe.transfers.list({
      transfer_group:
        txn.transfer_group,
      limit: 100,
    });

  return (
    transfers.data.find(
      (transfer) =>
        transfer.metadata
          ?.payment_transaction_id ===
          txn.id &&
        transfer.amount ===
          txn.club_net_cents &&
        transfer.currency.toLowerCase() ===
          txn.currency.toLowerCase()
    ) ?? null
  );
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

  try {
    /*
     * Separate Charges and Transfers exige que le compte
     * connecté puisse réellement recevoir des Transfers.
     *
     * On vérifie Stripe en temps réel juste avant le mouvement
     * d'argent : les snapshots locaux charges_enabled /
     * payouts_enabled ne remplacent pas cette capability.
     */
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

    const chargeId =
      await resolveChargeId(txn);

    /*
     * Protection supplémentaire contre un retry très tardif :
     * avant de créer quoi que ce soit, on recherche un transfert
     * Stripe portant notre identifiant interne.
     */
    let transfer =
      await recoverExistingTransfer(
        txn
      );

    if (!transfer) {
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

      recovered:
        Boolean(
          txn.stripe_transfer_id
        ),

      completed,
    };
  } catch (error) {
    await supabaseAdmin.rpc(
      "fail_payment_transfer",
      {
        p_transaction_id:
          txn.id,

        p_error:
          error instanceof Error
            ? error.message
            : "Erreur Stripe inconnue",
      }
    );

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
        transfer_status
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
