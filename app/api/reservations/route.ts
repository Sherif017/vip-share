import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripe } from "@/lib/stripe";

type ReservationRpcResult = {
  reservation_id: string;
  reservation_code: string;
  total_price: number;
  deposit_paid: number;
  remaining_amount: number;
};

export async function POST(request: Request) {
  let reservationId: string | null = null;

  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Vérifier que l'utilisateur est connecté
    |--------------------------------------------------------------------------
    */

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tu dois être connecté pour effectuer une réservation.",
        },
        {
          status: 401,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Lire les données envoyées par le formulaire
    |--------------------------------------------------------------------------
    */

    const body = await request.json();

    const eventSlug =
      typeof body.eventSlug === "string"
        ? body.eventSlug.trim()
        : "";

    const firstname =
      typeof body.firstname === "string"
        ? body.firstname.trim()
        : "";

    const lastname =
      typeof body.lastname === "string"
        ? body.lastname.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : "";

    const quantity = Number(body.quantity);

    /*
    |--------------------------------------------------------------------------
    | 3. Validation
    |--------------------------------------------------------------------------
    */

    if (!eventSlug) {
      return NextResponse.json(
        {
          success: false,
          error: "Événement invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (!firstname) {
      return NextResponse.json(
        {
          success: false,
          error: "Le prénom est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    if (!lastname) {
      return NextResponse.json(
        {
          success: false,
          error: "Le nom est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          success: false,
          error: "Adresse email invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "Le numéro de téléphone est obligatoire.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le nombre de places est invalide.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 4. Création de la réservation dans Supabase
    |--------------------------------------------------------------------------
    |
    | IMPORTANT :
    | Les prix NE viennent pas du navigateur.
    |
    | La fonction SQL récupère :
    | - price_per_person
    | - deposit_per_person
    | - remaining_per_person
    |
    | directement depuis vip_offers.
    |--------------------------------------------------------------------------
    */

    const {
      data: reservationData,
      error: reservationError,
    } = await supabaseAdmin.rpc(
      "create_vip_reservation",
      {
        p_event_slug: eventSlug,
        p_user_id: user.id,
        p_firstname: firstname,
        p_lastname: lastname,
        p_email: email,
        p_phone: phone,
        p_quantity: quantity,
      }
    );

    if (reservationError) {
      console.error(
        "Erreur create_vip_reservation :",
        reservationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            reservationError.message ||
            "Impossible de créer la réservation.",
        },
        {
          status: 400,
        }
      );
    }

    const reservation =
      reservationData?.[0] as
        | ReservationRpcResult
        | undefined;

    if (!reservation) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La réservation n'a pas pu être créée.",
        },
        {
          status: 500,
        }
      );
    }

    reservationId =
      reservation.reservation_id;

    /*
    |--------------------------------------------------------------------------
    | 5. Création de la session Stripe Checkout
    |--------------------------------------------------------------------------
    */

    const origin =
      new URL(request.url).origin;

    let session;

    try {
      session =
        await stripe.checkout.sessions.create({
          mode: "payment",

          payment_method_types: ["card"],

          customer_email: email,

          line_items: [
            {
              price_data: {
                currency: "eur",

                product_data: {
                  name: `VIP Share — ${eventSlug}`,
                  description: `${quantity} place${
                    quantity > 1 ? "s" : ""
                  } VIP`,
                },

                /*
                 * Stripe travaille en centimes.
                 *
                 * Exemple :
                 * 50 € => 5000
                 */
                unit_amount: Math.round(
                  Number(
                    reservation.deposit_paid
                  ) * 100
                ),
              },

              quantity: 1,
            },
          ],

          metadata: {
            reservation_id:
              reservation.reservation_id,

            reservation_code:
              reservation.reservation_code,

            user_id: user.id,

            event_slug: eventSlug,

            quantity:
              quantity.toString(),
          },

          success_url:
            `${origin}/confirmation/` +
            `${reservation.reservation_code}` +
            `?payment=success`,

          cancel_url:
            `${origin}/checkout/` +
            `${eventSlug}` +
            `?quantity=${quantity}` +
            `&payment=cancelled`,

          /*
           * La place est bloquée pendant
           * maximum 30 minutes.
           */
          expires_at:
            Math.floor(Date.now() / 1000) +
            30 * 60,
        });
    } catch (stripeError) {
      console.error(
        "Erreur création Stripe Checkout :",
        stripeError
      );

      /*
       * Stripe n'a pas pu créer la session.
       *
       * On libère donc immédiatement les places
       * qui avaient été temporairement bloquées.
       */
      await supabaseAdmin.rpc(
        "expire_vip_reservation",
        {
          p_reservation_id:
            reservation.reservation_id,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de démarrer le paiement.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 6. Sauvegarder l'identifiant Stripe
    |--------------------------------------------------------------------------
    */

    const {
      error: stripeSessionUpdateError,
    } = await supabaseAdmin
      .from("reservations")
      .update({
        stripe_checkout_session_id:
          session.id,
      })
      .eq(
        "id",
        reservation.reservation_id
      );

    if (stripeSessionUpdateError) {
      console.error(
        "Erreur sauvegarde Stripe Session :",
        stripeSessionUpdateError
      );

      /*
       * Une session Stripe existe mais nous
       * n'avons pas pu la rattacher correctement
       * à la réservation.
       *
       * On essaye donc de l'expirer.
       */
      try {
        await stripe.checkout.sessions.expire(
          session.id
        );
      } catch (expireStripeError) {
        console.error(
          "Impossible d'expirer la session Stripe :",
          expireStripeError
        );
      }

      /*
       * Puis on libère la réservation.
       */
      await supabaseAdmin.rpc(
        "expire_vip_reservation",
        {
          p_reservation_id:
            reservation.reservation_id,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Impossible de finaliser la réservation.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 7. Vérifier que Stripe a retourné une URL
    |--------------------------------------------------------------------------
    */

    if (!session.url) {
      try {
        await stripe.checkout.sessions.expire(
          session.id
        );
      } catch {
        // Rien à faire.
      }

      await supabaseAdmin.rpc(
        "expire_vip_reservation",
        {
          p_reservation_id:
            reservation.reservation_id,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "URL Stripe Checkout introuvable.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 8. Tout est bon
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,

      reservation: {
        id:
          reservation.reservation_id,

        code:
          reservation.reservation_code,

        totalPrice: Number(
          reservation.total_price
        ),

        depositPaid: Number(
          reservation.deposit_paid
        ),

        remainingAmount: Number(
          reservation.remaining_amount
        ),
      },

      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error(
      "Erreur POST /api/reservations :",
      error
    );

    /*
     * Sécurité supplémentaire :
     *
     * si une réservation avait déjà été créée
     * avant l'erreur, on essaye de libérer
     * les places.
     */
    if (reservationId) {
      try {
        await supabaseAdmin.rpc(
          "expire_vip_reservation",
          {
            p_reservation_id:
              reservationId,
          }
        );
      } catch (cleanupError) {
        console.error(
          "Erreur nettoyage réservation :",
          cleanupError
        );
      }
    }

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