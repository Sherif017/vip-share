import {
  NextResponse,
} from "next/server";

import {
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  stripe,
} from "@/lib/stripe";

import {
  refundFullPayment,
} from "@/lib/full-payment-refund";

import {
  dispatchRefundRequestedEmail,
  dispatchRefundCompletedEmail,
} from "@/lib/email/refund";


type RefundRow = {
  id: string;
  reservation_id: string;

  payment_type:
    | "full_payment_initial"
    | "supplement";

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


export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } =
      await params;


    const access =
      await getAdminAccess();


    if (!access) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }


    /*
     * Pilote :
     * les remboursements du nouveau modèle
     * financier restent sous contrôle K-RÉ.
     */

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select("id,role")
        .eq(
          "id",
          access.userId
        )
        .maybeSingle();


    if (
      profileError ||
      !profile ||
      profile.role !==
        "manager"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Accès K-RÉ requis.",
        },
        {
          status: 403,
        }
      );
    }


    const body =
      await request
        .json()
        .catch(() => ({}));


    const reason =
      typeof body.reason ===
        "string"
        ? body.reason
            .trim()
            .slice(
              0,
              500
            )
        : null;


    /*
     * CRITIQUE :
     *
     * Cet RPC prépare initial + supplément
     * dans UNE SEULE transaction PostgreSQL.
     *
     * Aucun refund Stripe n'est lancé avant
     * que tous les refunds nécessaires
     * existent en base.
     */

    const {
      data: prepared,
      error: prepareError,
    } =
      await supabaseAdmin.rpc(
        "prepare_full_payment_refunds",
        {
          p_reservation_id:
            id,

          p_requested_by:
            access.userId,

          p_reason:
            reason,
        }
      );


    const preparedRows =
      Array.isArray(prepared)
        ? prepared as RefundRow[]
        : prepared
          ? [
              prepared as RefundRow,
            ]
          : [];


    if (
      prepareError ||
      preparedRows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            prepareError
              ?.message ??
            "Remboursement impossible.",
        },
        {
          status: 409,
        }
      );
    }


    const results:
      Array<Record<string, unknown>> =
      [];


    /*
     * Les refunds sont traités séparément.
     *
     * Si le second échoue :
     * - le premier reste idempotent ;
     * - la réservation n'est PAS clôturée ;
     * - un retry reprend uniquement ce qui reste.
     */

    for (
      const preparedRefund
      of preparedRows
    ) {
      if (
        preparedRefund.status ===
          "refunded"
      ) {
        results.push({
          paymentType:
            preparedRefund
              .payment_type,

          alreadyRefunded:
            true,

          refund:
            preparedRefund,
        });

        continue;
      }


      const {
        data: claimed,
        error: claimError,
      } =
        await supabaseAdmin.rpc(
          "claim_vip_refund",
          {
            p_refund_id:
              preparedRefund.id,

            p_admin_user_id:
              access.userId,
          }
        );


      if (
        claimError ||
        !claimed
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              claimError
                ?.message ??
              "Impossible de réclamer le remboursement.",

            completed:
              results,
          },
          {
            status: 409,
          }
        );
      }


      const claimedRefund =
        claimed as RefundRow;


      try {
        await dispatchRefundRequestedEmail(
          claimedRefund
        );
      } catch (
        emailError
      ) {
        console.error(
          "full-payment refund email requested:",
          {
            refundId:
              claimedRefund.id,

            paymentType:
              claimedRefund
                .payment_type,

            message:
              emailError instanceof
                Error
                ? emailError.message
                : "Erreur inconnue",
          }
        );
      }


      try {
        const result =
          await refundFullPayment(
            supabaseAdmin,
            stripe,
            claimedRefund,
            access.userId
          );


        try {
          await dispatchRefundCompletedEmail(
            result.refund as RefundRow
          );
        } catch (
          emailError
        ) {
          console.error(
            "full-payment refund email completed:",
            {
              refundId:
                claimedRefund.id,

              paymentType:
                claimedRefund
                  .payment_type,

              message:
                emailError instanceof
                  Error
                  ? emailError.message
                  : "Erreur inconnue",
            }
          );
        }


        results.push({
          paymentType:
            claimedRefund
              .payment_type,

          ...result,
        });

      } catch (error) {

        await supabaseAdmin.rpc(
          "fail_vip_refund",
          {
            p_refund_id:
              claimedRefund.id,

            p_error:
              error instanceof Error
                ? error.message
                : "Erreur Stripe",
          }
        );


        console.error(
          "K-RÉ full-payment refund:",
          {
            reservationId:
              id,

            refundId:
              claimedRefund.id,

            paymentType:
              claimedRefund
                .payment_type,

            message:
              error instanceof Error
                ? error.message
                : "Erreur inconnue",
          }
        );


        return NextResponse.json(
          {
            success: false,

            error:
              "Le remboursement est en attente de nouvelle tentative.",

            completed:
              results,

            failedPaymentType:
              claimedRefund
                .payment_type,
          },
          {
            status: 502,
          }
        );
      }
    }


    return NextResponse.json({
      success: true,

      alreadyRefunded:
        results.every(
          (result) =>
            result.alreadyRefunded ===
              true
        ),

      refundCount:
        results.length,

      refunds:
        results,
    });

  } catch (error) {

    console.error(
      "K-RÉ full-payment refund route:",
      error
    );


    return NextResponse.json(
      {
        success: false,

        error:
          "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}
