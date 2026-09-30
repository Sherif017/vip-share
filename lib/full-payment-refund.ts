import "server-only";

import type Stripe from "stripe";
import type {
  SupabaseClient,
} from "@supabase/supabase-js";


type FullPaymentRefundType =
  | "full_payment_initial"
  | "supplement";


type LedgerPaymentType =
  | "initial"
  | "supplement";


type FullPaymentRefundRow = {
  id: string;
  reservation_id: string;

  payment_type:
    FullPaymentRefundType;

  stripe_session_id: string;

  payment_transaction_id:
    string;

  stripe_transfer_reversal_id:
    | string
    | null;

  status:
    | "refund_pending"
    | "refunding"
    | "refunded";

  amount:
    | number
    | null;

  currency: string;
};


type PaymentTransaction = {
  id: string;
  reservation_id: string;

  payment_type:
    LedgerPaymentType;

  total_customer_cents:
    number;

  club_net_cents:
    number;

  currency: string;
  status: string;

  stripe_payment_intent_id:
    | string
    | null;

  stripe_charge_id:
    | string
    | null;

  stripe_transfer_id:
    | string
    | null;

  stripe_transfer_reversal_id:
    | string
    | null;

  transfer_status: string;
};


type Reservation = {
  id: string;
  user_id: string;
  vip_offer_id: string;
  payment_model: string;
};


function expectedLedgerPaymentType(
  refundType: FullPaymentRefundType
): LedgerPaymentType {
  return refundType ===
    "full_payment_initial"
    ? "initial"
    : "supplement";
}


function expectedStripeMetadataType(
  refundType: FullPaymentRefundType
) {
  return refundType ===
    "full_payment_initial"
    ? "full_payment_initial"
    : "full_payment_supplement";
}


async function recoverOrCreateReversal(
  stripe: Stripe,
  txn: PaymentTransaction
) {
  if (
    !txn.stripe_transfer_id
  ) {
    return null;
  }


  if (
    txn.stripe_transfer_reversal_id
  ) {
    return txn
      .stripe_transfer_reversal_id;
  }


  const reversals =
    await stripe.transfers
      .listReversals(
        txn.stripe_transfer_id,
        {
          limit: 100,
        }
      );


  const existing =
    reversals.data.find(
      (candidate) =>
        candidate.amount ===
          txn.club_net_cents &&

        candidate.metadata
          ?.payment_transaction_id ===
          txn.id
    );


  if (existing) {
    return existing.id;
  }


  const reversal =
    await stripe.transfers
      .createReversal(
        txn.stripe_transfer_id,
        {
          amount:
            txn.club_net_cents,

          metadata: {
            payment_transaction_id:
              txn.id,

            reservation_id:
              txn.reservation_id,

            payment_type:
              txn.payment_type,

            reason:
              "full_payment_refund",
          },
        },
        {
          idempotencyKey:
            `kre-transfer-reversal:${txn.id}`,
        }
      );


  if (
    reversal.amount !==
    txn.club_net_cents
  ) {
    throw new Error(
      "Montant du reversal Stripe inattendu."
    );
  }


  return reversal.id;
}


async function recoverOrCreateRefund(
  stripe: Stripe,
  txn: PaymentTransaction,
  refund: FullPaymentRefundRow
) {
  if (
    !txn.stripe_payment_intent_id
  ) {
    throw new Error(
      "PaymentIntent Stripe absent."
    );
  }


  const refunds =
    await stripe.refunds.list({
      payment_intent:
        txn.stripe_payment_intent_id,

      limit: 100,
    });


  const successful =
    refunds.data.filter(
      (candidate) =>
        candidate.status !==
          "failed" &&

        candidate.status !==
          "canceled"
    );


  const existing =
    successful.find(
      (candidate) =>
        candidate.amount ===
          txn.total_customer_cents &&

        candidate.currency
          ?.toLowerCase() ===
          txn.currency
            .toLowerCase() &&

        candidate.metadata
          ?.vip_refund_id ===
          refund.id &&

        (
          !candidate.metadata
            ?.payment_transaction_id ||

          candidate.metadata
            ?.payment_transaction_id ===
            txn.id
        )
    );


  if (existing) {
    return existing;
  }


  const alreadyRefunded =
    successful.reduce(
      (
        total,
        candidate
      ) =>
        total +
        candidate.amount,
      0
    );


  if (alreadyRefunded !== 0) {
    throw new Error(
      "PaymentIntent déjà partiellement remboursé avec un montant incompatible."
    );
  }


  return stripe.refunds.create(
    {
      payment_intent:
        txn.stripe_payment_intent_id,

      amount:
        txn.total_customer_cents,

      metadata: {
        vip_refund_id:
          refund.id,

        payment_transaction_id:
          txn.id,

        reservation_id:
          txn.reservation_id,

        payment_type:
          refund.payment_type,
      },
    },
    {
      idempotencyKey:
        `kre-full-payment-refund:${refund.id}`,
    }
  );
}


export async function refundFullPayment(
  db: SupabaseClient,
  stripe: Stripe,
  refund:
    FullPaymentRefundRow,
  processedBy: string
) {
  const {
    data: reservation,
    error: reservationError,
  } =
    await db
      .from("reservations")
      .select(`
        id,
        user_id,
        vip_offer_id,
        payment_model
      `)
      .eq(
        "id",
        refund.reservation_id
      )
      .single();


  if (
    reservationError ||
    !reservation
  ) {
    throw new Error(
      "Réservation introuvable."
    );
  }


  const typedReservation =
    reservation as Reservation;


  if (
    typedReservation
      .payment_model !==
      "full_payment"
  ) {
    throw new Error(
      "Modèle de paiement incompatible."
    );
  }


  const expectedPaymentType =
    expectedLedgerPaymentType(
      refund.payment_type
    );


  const {
    data: transaction,
    error: transactionError,
  } =
    await db
      .from(
        "payment_transactions"
      )
      .select(`
        id,
        reservation_id,
        payment_type,
        total_customer_cents,
        club_net_cents,
        currency,
        status,
        stripe_payment_intent_id,
        stripe_charge_id,
        stripe_transfer_id,
        stripe_transfer_reversal_id,
        transfer_status
      `)
      .eq(
        "id",
        refund
          .payment_transaction_id
      )
      .eq(
        "reservation_id",
        refund.reservation_id
      )
      .eq(
        "payment_type",
        expectedPaymentType
      )
      .single();


  if (
    transactionError ||
    !transaction
  ) {
    throw new Error(
      "Transaction financière introuvable."
    );
  }


  const txn =
    transaction as PaymentTransaction;


  if (
    txn.payment_type !==
      expectedPaymentType
  ) {
    throw new Error(
      "Type de transaction financière incompatible."
    );
  }


  if (
    txn.status ===
      "refunded" &&

    refund.status ===
      "refunded"
  ) {
    return {
      alreadyRefunded: true,
      refund,
    };
  }


  if (
    txn.status !==
      "confirmed"
  ) {
    throw new Error(
      "Transaction financière non remboursable."
    );
  }


  if (
    !Number.isInteger(
      txn.total_customer_cents
    ) ||

    txn.total_customer_cents <= 0 ||

    !Number.isInteger(
      txn.club_net_cents
    ) ||

    txn.club_net_cents < 0
  ) {
    throw new Error(
      "Snapshot financier invalide."
    );
  }


  if (
    refund.amount !== null &&

    refund.amount !==
      txn.total_customer_cents
  ) {
    throw new Error(
      "Montant du remboursement incompatible avec le ledger."
    );
  }


  if (
    refund.currency
      .toLowerCase() !==
    txn.currency
      .toLowerCase()
  ) {
    throw new Error(
      "Devise du remboursement incompatible."
    );
  }


  const session =
    await stripe.checkout
      .sessions.retrieve(
        refund.stripe_session_id,
        {
          expand: [
            "payment_intent",
          ],
        }
      );


  const metadata =
    session.metadata ?? {};


  const expectedMetadata =
    expectedStripeMetadataType(
      refund.payment_type
    );


  if (
    session.status !==
      "complete" ||

    session.payment_status !==
      "paid" ||

    session.currency
      ?.toLowerCase() !==
      txn.currency
        .toLowerCase() ||

    session.amount_total !==
      txn.total_customer_cents ||

    metadata.payment_type !==
      expectedMetadata ||

    metadata.reservation_id !==
      typedReservation.id ||

    (
      metadata.user_id &&
      metadata.user_id !==
        typedReservation.user_id
    ) ||

    (
      metadata.vip_offer_id &&
      metadata.vip_offer_id !==
        typedReservation.vip_offer_id
    )
  ) {
    throw new Error(
      "Session Stripe incompatible avec le ledger K-RÉ."
    );
  }


  const paymentIntent =
    typeof session
      .payment_intent ===
      "string"
      ? null
      : session.payment_intent;


  const paymentIntentId =
    typeof session
      .payment_intent ===
      "string"
      ? session.payment_intent
      : paymentIntent?.id ??
        txn
          .stripe_payment_intent_id;


  if (!paymentIntentId) {
    throw new Error(
      "PaymentIntent Stripe introuvable."
    );
  }


  if (
    txn.stripe_payment_intent_id &&

    txn.stripe_payment_intent_id !==
      paymentIntentId
  ) {
    throw new Error(
      "PaymentIntent incompatible avec le ledger."
    );
  }


  if (
    paymentIntent &&

    (
      paymentIntent.currency
        ?.toLowerCase() !==
        txn.currency
          .toLowerCase() ||

      paymentIntent
        .amount_received !==
        txn.total_customer_cents ||

      paymentIntent.status !==
        "succeeded"
    )
  ) {
    throw new Error(
      "PaymentIntent Stripe incompatible."
    );
  }


  /*
   * Chaque transaction est autonome :
   *
   * initial :
   *   refund du paiement initial
   *   + reversal de son net club éventuel
   *
   * supplement :
   *   refund du supplément
   *   + reversal de son net club éventuel
   *
   * Dans les deux cas le client récupère
   * le total_customer_cents de CETTE transaction.
   */

  let reversalId =
    txn
      .stripe_transfer_reversal_id;


  if (
    txn.stripe_transfer_id
  ) {
    reversalId =
      await recoverOrCreateReversal(
        stripe,
        txn
      );


    if (!reversalId) {
      throw new Error(
        "Reversal Stripe introuvable."
      );
    }


    const {
      error:
        reversalPersistError,
    } =
      await db.rpc(
        "record_full_payment_transfer_reversal",
        {
          p_transaction_id:
            txn.id,

          p_reversal_id:
            reversalId,
        }
      );


    if (
      reversalPersistError
    ) {
      throw reversalPersistError;
    }
  }


  const refundStripe =
    await recoverOrCreateRefund(
      stripe,
      {
        ...txn,

        stripe_payment_intent_id:
          paymentIntentId,
      },
      refund
    );


  if (
    refundStripe.amount !==
      txn.total_customer_cents ||

    refundStripe.currency
      ?.toLowerCase() !==
      txn.currency
        .toLowerCase()
  ) {
    throw new Error(
      "Remboursement Stripe inattendu."
    );
  }


  const {
    data: completed,
    error: completeError,
  } =
    await db.rpc(
      "complete_full_payment_refund",
      {
        p_refund_id:
          refund.id,

        p_stripe_refund_id:
          refundStripe.id,

        p_payment_intent_id:
          paymentIntentId,

        p_amount:
          txn
            .total_customer_cents,

        p_processed_by:
          processedBy,

        p_transfer_reversal_id:
          reversalId,
      }
    );


  if (completeError) {
    throw completeError;
  }


  return {
    alreadyRefunded: false,

    paymentType:
      refund.payment_type,

    reversalId,

    stripeRefundId:
      refundStripe.id,

    refund:
      completed,
  };
}
