import {
  NextResponse,
} from "next/server";

import {
  canManageEvent,
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

type SubmittedTable = {
  id:
    | string
    | null;

  tableNumber: string;

  totalTablePrice:
    number;

  capacity: number;

  confirmationThreshold:
    number;

  bookingDeadline:
    | string
    | null;
};

const BUCKET =
  "event-media";

const MAX_FILE_SIZE =
  8 * 1024 * 1024;

const ALLOWED_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/*
|--------------------------------------------------------------------------
| PATCH
|--------------------------------------------------------------------------
*/

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const uploadedPaths:
    string[] = [];

  try {
    const { id } =
      await params;

    /*
    |--------------------------------------------------------------------------
    | Auth + permissions
    |--------------------------------------------------------------------------
    */

    const access =
      await getAdminAccess();

    if (!access) {
      return NextResponse.json(
        {
          error:
            "Utilisateur non connecté.",
        },
        {
          status: 401,
        }
      );
    }

    if (!access.canManageAnyClub) {
      return NextResponse.json(
        {
          error:
            "Accès administrateur requis.",
        },
        {
          status: 403,
        }
      );
    }

    const allowed =
      await canManageEvent(
        access,
        id
      );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Vous n'êtes pas autorisé à modifier cette soirée.",
        },
        {
          status: 403,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | FormData
    |--------------------------------------------------------------------------
    */

    const formData =
      await request.formData();

    const name =
      String(
        formData.get(
          "name"
        ) ?? ""
      ).trim();

    const slug =
      String(
        formData.get(
          "slug"
        ) ?? ""
      )
        .trim()
        .toLowerCase();

    const eventDate =
      String(
        formData.get(
          "eventDate"
        ) ?? ""
      );

    const startTime =
      String(
        formData.get(
          "startTime"
        ) ?? ""
      );

    const music =
      String(
        formData.get(
          "music"
        ) ?? ""
      ).trim();

    const depositPercentage =
      Number(
        formData.get(
          "depositPercentage"
        )
      );

    const tablesRaw =
      String(
        formData.get(
          "tables"
        ) ?? ""
      );

    /*
    |--------------------------------------------------------------------------
    | Validation soirée
    |--------------------------------------------------------------------------
    */

    if (
      !name ||
      !slug ||
      !eventDate ||
      !startTime
    ) {
      return NextResponse.json(
        {
          error:
            "Informations de soirée incomplètes.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(
        depositPercentage
      ) ||
      depositPercentage <
        0 ||
      depositPercentage >
        100
    ) {
      return NextResponse.json(
        {
          error:
            "Le Deposit doit être compris entre 0% et 100%.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Tables JSON
    |--------------------------------------------------------------------------
    */

    let tables:
      SubmittedTable[];

    try {
      tables =
        JSON.parse(
          tablesRaw
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "Format des tables invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Array.isArray(
        tables
      ) ||
      tables.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "La soirée doit contenir au moins une table.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validation tables
    |--------------------------------------------------------------------------
    */

    const normalizedTableNumbers =
      tables.map(
        (
          table
        ) =>
          String(
            table.tableNumber ??
              ""
          )
            .trim()
            .toLowerCase()
      );

    if (
      new Set(
        normalizedTableNumbers
      ).size !==
      normalizedTableNumbers.length
    ) {
      return NextResponse.json(
        {
          error:
            "Deux tables ne peuvent pas avoir le même numéro.",
        },
        {
          status: 400,
        }
      );
    }

    for (
      const table of tables
    ) {
      table.tableNumber =
        String(
          table.tableNumber ??
            ""
        ).trim();

      table.totalTablePrice =
        Number(
          table.totalTablePrice
        );

      table.capacity =
        Number(
          table.capacity
        );

      table.confirmationThreshold =
        Number(
          table.confirmationThreshold
        );

      if (
        !table.tableNumber
      ) {
        return NextResponse.json(
          {
            error:
              "Toutes les tables doivent avoir un numéro.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isFinite(
          table.totalTablePrice
        ) ||
        table.totalTablePrice <=
          0
      ) {
        return NextResponse.json(
          {
            error:
              `Prix invalide pour la table n°${table.tableNumber}.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(
          table.capacity
        ) ||
        table.capacity <
          1
      ) {
        return NextResponse.json(
          {
            error:
              `Capacité invalide pour la table n°${table.tableNumber}.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(
          table.confirmationThreshold
        ) ||
        table.confirmationThreshold <
          1 ||
        table.confirmationThreshold >
          table.capacity
      ) {
        return NextResponse.json(
          {
            error:
              `Seuil de confirmation invalide pour la table n°${table.tableNumber}.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        table.bookingDeadline
      ) {
        const deadline =
          new Date(
            table.bookingDeadline
          );

        if (
          Number.isNaN(
            deadline.getTime()
          )
        ) {
          return NextResponse.json(
            {
              error:
                `Deadline invalide pour la table n°${table.tableNumber}.`,
            },
            {
              status: 400,
            }
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Soirée existante
    |--------------------------------------------------------------------------
    */

    const {
      data:
        currentEvent,
      error:
        currentEventError,
    } =
      await supabaseAdmin
        .from("events")
        .select(`
          id,
          image_url,
          table_map_url
        `)
        .eq("id", id)
        .maybeSingle();

    if (
      currentEventError ||
      !currentEvent
    ) {
      return NextResponse.json(
        {
          error:
            "Soirée introuvable.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Slug
    |--------------------------------------------------------------------------
    */

    const {
      data: slugEvent,
    } =
      await supabaseAdmin
        .from("events")
        .select("id")
        .eq(
          "slug",
          slug
        )
        .neq(
          "id",
          id
        )
        .maybeSingle();

    if (
      slugEvent
    ) {
      return NextResponse.json(
        {
          error:
            "Ce slug est déjà utilisé.",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Tables existantes
    |--------------------------------------------------------------------------
    */

    const {
      data:
        existingOffers,

      error:
        existingOffersError,
    } =
      await supabaseAdmin
        .from(
          "vip_offers"
        )
        .select(`
          id,
          table_number,
          capacity,
          spots_reserved
        `)
        .eq(
          "event_id",
          id
        );

    if (
      existingOffersError
    ) {
      console.error(
        "Erreur récupération tables :",
        existingOffersError
      );

      return NextResponse.json(
        {
          error:
            "Impossible de récupérer les tables existantes.",
        },
        {
          status: 500,
        }
      );
    }

    const existing =
      existingOffers ??
      [];

    const existingIds =
      new Set(
        existing.map(
          (
            offer
          ) =>
            offer.id
        )
      );

    /*
    |--------------------------------------------------------------------------
    | Vérifier IDs envoyés
    |--------------------------------------------------------------------------
    */

    for (
      const table of tables
    ) {
      if (
        table.id &&
        !existingIds.has(
          table.id
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Une table envoyée ne correspond pas à cette soirée.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Empêcher réduction capacité sous les réservations
    |--------------------------------------------------------------------------
    */

    for (
      const table of tables
    ) {
      if (!table.id) {
        continue;
      }

      const current =
        existing.find(
          (
            offer
          ) =>
            offer.id ===
            table.id
        );

      if (
        current &&
        table.capacity <
          Number(
            current.spots_reserved ??
              0
          )
      ) {
        return NextResponse.json(
          {
            error:
              `Impossible de réduire la capacité de la table n°${table.tableNumber} sous ${current.spots_reserved} places.`,
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Tables supprimées
    |--------------------------------------------------------------------------
    */

    const submittedExistingIds =
      new Set(
        tables
          .filter(
            (
              table
            ) =>
              Boolean(
                table.id
              )
          )
          .map(
            (
              table
            ) =>
              table.id as string
          )
      );

    const deletedOffers =
      existing.filter(
        (
          offer
        ) =>
          !submittedExistingIds.has(
            offer.id
          )
      );

    /*
    |--------------------------------------------------------------------------
    | Interdire suppression si une réservation existe
    |--------------------------------------------------------------------------
    */

    if (
      deletedOffers.length >
      0
    ) {
      const deletedIds =
        deletedOffers.map(
          (
            offer
          ) =>
            offer.id
        );

      const {
        data:
          reservationsOnDeletedTables,

        error:
          reservationCheckError,
      } =
        await supabaseAdmin
          .from(
            "reservations"
          )
          .select(`
            id,
            vip_offer_id
          `)
          .in(
            "vip_offer_id",
            deletedIds
          )
          .limit(1);

      if (
        reservationCheckError
      ) {
        console.error(
          "Erreur vérification réservations :",
          reservationCheckError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de vérifier les réservations des tables supprimées.",
          },
          {
            status: 500,
          }
        );
      }

      if (
        reservationsOnDeletedTables &&
        reservationsOnDeletedTables.length >
          0
      ) {
        return NextResponse.json(
          {
            error:
              "Impossible de supprimer une table qui possède déjà une réservation.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Fichiers
    |--------------------------------------------------------------------------
    */

    const posterEntry =
      formData.get(
        "poster"
      );

    const tableMapEntry =
      formData.get(
        "tableMap"
      );

    const poster =
      posterEntry instanceof
      File &&
      posterEntry.size >
        0
        ? posterEntry
        : null;

    const tableMap =
      tableMapEntry instanceof
      File &&
      tableMapEntry.size >
        0
        ? tableMapEntry
        : null;

    const fileError =
      validateFile(
        poster
      ) ??
      validateFile(
        tableMap
      );

    if (fileError) {
      return NextResponse.json(
        {
          error:
            fileError,
        },
        {
          status: 400,
        }
      );
    }

    let imageUrl =
      currentEvent.image_url;

    let tableMapUrl =
      currentEvent.table_map_url;

    /*
    |--------------------------------------------------------------------------
    | Upload affiche
    |--------------------------------------------------------------------------
    */

    if (poster) {
      const upload =
        await uploadImage(
          poster,
          id,
          "poster"
        );

      if (
        !upload.success
      ) {
        return NextResponse.json(
          {
            error:
              upload.error,
          },
          {
            status: 500,
          }
        );
      }

      uploadedPaths.push(
        upload.path
      );

      imageUrl =
        upload.url;
    }

    /*
    |--------------------------------------------------------------------------
    | Upload plan
    |--------------------------------------------------------------------------
    */

    if (
      tableMap
    ) {
      const upload =
        await uploadImage(
          tableMap,
          id,
          "table-map"
        );

      if (
        !upload.success
      ) {
        await cleanupUploads(
          uploadedPaths
        );

        return NextResponse.json(
          {
            error:
              upload.error,
          },
          {
            status: 500,
          }
        );
      }

      uploadedPaths.push(
        upload.path
      );

      tableMapUrl =
        upload.url;
    }

    /*
    |--------------------------------------------------------------------------
    | Mise à jour event
    |--------------------------------------------------------------------------
    */

    const {
      error:
        eventError,
    } =
      await supabaseAdmin
        .from("events")
        .update({
          name,
          slug,

          event_date:
            eventDate,

          start_time:
            startTime,

          music:
            music ||
            null,

          commission_percentage:
            depositPercentage,

          image_url:
            imageUrl,

          table_map_url:
            tableMapUrl,
        })
        .eq(
          "id",
          id
        );

    if (
      eventError
    ) {
      console.error(
        "Erreur update event :",
        eventError
      );

      await cleanupUploads(
        uploadedPaths
      );

      return NextResponse.json(
        {
          error:
            "Impossible de modifier la soirée.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Supprimer tables retirées
    |--------------------------------------------------------------------------
    */

    if (
      deletedOffers.length >
      0
    ) {
      const {
        error:
          deleteError,
      } =
        await supabaseAdmin
          .from(
            "vip_offers"
          )
          .delete()
          .in(
            "id",
            deletedOffers.map(
              (
                offer
              ) =>
                offer.id
            )
          );

      if (
        deleteError
      ) {
        console.error(
          "Erreur suppression tables :",
          deleteError
        );

        return NextResponse.json(
          {
            error:
              "La soirée a été modifiée mais certaines tables n'ont pas pu être supprimées.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Important :
    | temporairement renommer les tables existantes conservées.
    |
    | Ça permet par exemple :
    |
    | table 1 -> 2
    | table 2 -> 1
    |
    | sans casser l'index unique event_id + table_number.
    |--------------------------------------------------------------------------
    */

    const retainedTables =
      tables.filter(
        (
          table
        ) =>
          Boolean(
            table.id
          )
      );

    for (
      const table of retainedTables
    ) {
      const {
        error:
          tempError,
      } =
        await supabaseAdmin
          .from(
            "vip_offers"
          )
          .update({
            table_number:
              `__edit_${table.id}_${Date.now()}__`,
          })
          .eq(
            "id",
            table.id!
          )
          .eq(
            "event_id",
            id
          );

      if (
        tempError
      ) {
        console.error(
          "Erreur renommage temporaire table :",
          tempError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de préparer la mise à jour des tables.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Update tables existantes
    |--------------------------------------------------------------------------
    */

    for (
      const table of retainedTables
    ) {
      const calculated =
        calculatePrices(
          table.totalTablePrice,
          table.capacity,
          depositPercentage
        );

      const {
        error:
          offerError,
      } =
        await supabaseAdmin
          .from(
            "vip_offers"
          )
          .update({
            table_number:
              table.tableNumber,

            total_table_price:
              roundMoney(
                table.totalTablePrice
              ),

            capacity:
              table.capacity,

            confirmation_threshold:
              table.confirmationThreshold,

            price_per_person:
              calculated.pricePerPerson,

            deposit_per_person:
              calculated.depositPerPerson,

            remaining_per_person:
              calculated.remainingPerPerson,

            booking_deadline:
              table.bookingDeadline ||
              null,
          })
          .eq(
            "id",
            table.id!
          )
          .eq(
            "event_id",
            id
          );

      if (
        offerError
      ) {
        console.error(
          "Erreur update table :",
          offerError
        );

        return NextResponse.json(
          {
            error:
              `Impossible de modifier la table n°${table.tableNumber}.`,
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Nouvelles tables
    |--------------------------------------------------------------------------
    */

    const newTables =
      tables.filter(
        (
          table
        ) =>
          !table.id
      );

    if (
      newTables.length >
      0
    ) {
      const rows =
        newTables.map(
          (
            table
          ) => {
            const calculated =
              calculatePrices(
                table.totalTablePrice,
                table.capacity,
                depositPercentage
              );

            return {
              event_id:
                id,

              table_number:
                table.tableNumber,

              total_table_price:
                roundMoney(
                  table.totalTablePrice
                ),

              capacity:
                table.capacity,

              confirmation_threshold:
                table.confirmationThreshold,

              price_per_person:
                calculated.pricePerPerson,

              deposit_per_person:
                calculated.depositPerPerson,

              remaining_per_person:
                calculated.remainingPerPerson,

              booking_deadline:
                table.bookingDeadline ||
                null,

              spots_reserved:
                0,

              status:
                "forming",
            };
          }
        );

      const {
        error:
          insertError,
      } =
        await supabaseAdmin
          .from(
            "vip_offers"
          )
          .insert(rows);

      if (
        insertError
      ) {
        console.error(
          "Erreur création nouvelles tables :",
          insertError
        );

        return NextResponse.json(
          {
            error:
              "La soirée a été modifiée mais certaines nouvelles tables n'ont pas pu être créées.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Succès
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "PATCH /api/admin/events/[id] :",
      error
    );

    await cleanupUploads(
      uploadedPaths
    );

    return NextResponse.json(
      {
        error:
          "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Validation image
|--------------------------------------------------------------------------
*/

function validateFile(
  file:
    | File
    | null
) {
  if (!file) {
    return null;
  }

  if (
    file.size >
    MAX_FILE_SIZE
  ) {
    return "Les images doivent faire moins de 8 MB.";
  }

  if (
    !ALLOWED_TYPES.has(
      file.type
    )
  ) {
    return "Format d'image invalide. Utilise JPG, PNG ou WebP.";
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| Upload
|--------------------------------------------------------------------------
*/

async function uploadImage(
  file: File,
  eventId: string,
  type: string
): Promise<
  | {
      success: true;
      path: string;
      url: string;
    }
  | {
      success: false;
      error: string;
    }
> {
  const extension =
    getExtension(
      file
    );

  const path =
    `events/${eventId}/${type}-${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const buffer =
    Buffer.from(
      await file.arrayBuffer()
    );

  const {
    error,
  } =
    await supabaseAdmin.storage
      .from(BUCKET)
      .upload(
        path,
        buffer,
        {
          contentType:
            file.type,

          upsert:
            false,
        }
      );

  if (error) {
    console.error(
      "Erreur upload storage :",
      error
    );

    return {
      success: false,

      error:
        "Impossible d'envoyer l'image.",
    };
  }

  const {
    data,
  } =
    supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(
        path
      );

  return {
    success: true,

    path,

    url:
      data.publicUrl,
  };
}

/*
|--------------------------------------------------------------------------
| Cleanup
|--------------------------------------------------------------------------
*/

async function cleanupUploads(
  paths: string[]
) {
  if (
    paths.length === 0
  ) {
    return;
  }

  try {
    await supabaseAdmin.storage
      .from(BUCKET)
      .remove(paths);
  } catch (
    error
  ) {
    console.error(
      "Erreur cleanup fichiers :",
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| Extension
|--------------------------------------------------------------------------
*/

function getExtension(
  file: File
) {
  if (
    file.type ===
    "image/png"
  ) {
    return "png";
  }

  if (
    file.type ===
    "image/webp"
  ) {
    return "webp";
  }

  return "jpg";
}

/*
|--------------------------------------------------------------------------
| Prix
|--------------------------------------------------------------------------
*/

function calculatePrices(
  totalTablePrice:
    number,

  capacity:
    number,

  depositPercentage:
    number
) {
  const pricePerPerson =
    roundMoney(
      totalTablePrice /
        capacity
    );

  const depositPerPerson =
    roundMoney(
      pricePerPerson *
        (
          depositPercentage /
          100
        )
    );

  const remainingPerPerson =
    roundMoney(
      pricePerPerson -
        depositPerPerson
    );

  return {
    pricePerPerson,
    depositPerPerson,
    remainingPerPerson,
  };
}

function roundMoney(
  value: number
) {
  return Math.round(
    (
      value +
      Number.EPSILON
    ) *
      100
  ) / 100;
}