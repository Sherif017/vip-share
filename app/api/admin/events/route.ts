import {
  NextResponse,
} from "next/server";

import {
  randomUUID,
} from "crypto";

import {
  canManageClub,
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

const STORAGE_BUCKET =
  "event-media";

const MAX_FILE_SIZE =
  8 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

type TablePayload = {
  tableNumber: string;
  totalTablePrice: number;
  capacity: number;
  confirmationThreshold: number;
  bookingDeadline:
    | string
    | null;
};

function getString(
  formData: FormData,
  key: string
) {
  const value =
    formData.get(key);

  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function getOptionalFile(
  formData: FormData,
  key: string
) {
  const value =
    formData.get(key);

  if (
    value instanceof File &&
    value.size > 0
  ) {
    return value;
  }

  return null;
}

function validateImage(
  file: File | null,
  label: string
) {
  if (!file) {
    return;
  }

  if (
    !ALLOWED_IMAGE_TYPES.has(
      file.type
    )
  ) {
    throw new Error(
      `${label} : format non accepté. Utilise JPG, PNG ou WebP.`
    );
  }

  if (
    file.size >
    MAX_FILE_SIZE
  ) {
    throw new Error(
      `${label} : l'image dépasse 8 Mo.`
    );
  }
}

function getExtension(
  file: File
) {
  if (
    file.type ===
    "image/jpeg"
  ) {
    return "jpg";
  }

  if (
    file.type ===
    "image/png"
  ) {
    return "png";
  }

  return "webp";
}

function roundMoney(
  value: number
) {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100
    ) / 100
  );
}

async function removeUploadedFiles(
  paths: string[]
) {
  if (
    paths.length === 0
  ) {
    return;
  }

  const { error } =
    await supabaseAdmin
      .storage
      .from(
        STORAGE_BUCKET
      )
      .remove(paths);

  if (error) {
    console.error(
      "Erreur nettoyage Storage :",
      error
    );
  }
}

export async function POST(
  request: Request
) {
  let createdClubId:
    | string
    | null = null;

  let createdEventId:
    | string
    | null = null;

  const uploadedPaths:
    string[] = [];

  try {
    /*
    |--------------------------------------------------------------------------
    | Authentification + permissions
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

    /*
    |--------------------------------------------------------------------------
    | Lecture du formulaire
    |--------------------------------------------------------------------------
    */

    const formData =
      await request.formData();

    const clubMode =
      getString(
        formData,
        "clubMode"
      );

    const clubId =
      getString(
        formData,
        "clubId"
      );

    const clubName =
      getString(
        formData,
        "clubName"
      );

    const clubCity =
      getString(
        formData,
        "clubCity"
      );

    const clubAddress =
      getString(
        formData,
        "clubAddress"
      );

    const name =
      getString(
        formData,
        "name"
      );

    const slug =
      getString(
        formData,
        "slug"
      ).toLowerCase();

    const eventDate =
      getString(
        formData,
        "eventDate"
      );

    const startTime =
      getString(
        formData,
        "startTime"
      );

    const music =
      getString(
        formData,
        "music"
      );

    const commissionPercentage =
      Number(
        getString(
          formData,
          "commissionPercentage"
        )
      );

    const rawTables =
      getString(
        formData,
        "tables"
      );

    const posterFile =
      getOptionalFile(
        formData,
        "poster"
      );

    const tableMapFile =
      getOptionalFile(
        formData,
        "tableMap"
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
            "Les informations de la soirée sont incomplètes.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isFinite(
        commissionPercentage
      ) ||
      commissionPercentage <=
        0 ||
      commissionPercentage >
        100
    ) {
      return NextResponse.json(
        {
          error:
            "La commission doit être comprise entre 1 % et 100 %.",
        },
        {
          status: 400,
        }
      );
    }

    validateImage(
      posterFile,
      "Affiche"
    );

    validateImage(
      tableMapFile,
      "Plan des tables"
    );

    /*
    |--------------------------------------------------------------------------
    | Validation des tables
    |--------------------------------------------------------------------------
    */

    let tables:
      TablePayload[];

    try {
      const parsed =
        JSON.parse(
          rawTables
        );

      if (
        !Array.isArray(parsed)
      ) {
        throw new Error();
      }

      tables =
        parsed as TablePayload[];
    } catch {
      return NextResponse.json(
        {
          error:
            "Les tables envoyées sont invalides.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      tables.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Ajoute au moins une table.",
        },
        {
          status: 400,
        }
      );
    }

    const tableNumbers =
      new Set<string>();

    for (
      const table of tables
    ) {
      const tableNumber =
        String(
          table.tableNumber ??
            ""
        ).trim();

      const capacity =
        Number(
          table.capacity
        );

      const threshold =
        Number(
          table.confirmationThreshold
        );

      const totalPrice =
        Number(
          table.totalTablePrice
        );

      if (!tableNumber) {
        return NextResponse.json(
          {
            error:
              "Chaque table doit avoir un numéro.",
          },
          {
            status: 400,
          }
        );
      }

      const normalizedNumber =
        tableNumber.toLowerCase();

      if (
        tableNumbers.has(
          normalizedNumber
        )
      ) {
        return NextResponse.json(
          {
            error:
              `Le numéro de table "${tableNumber}" est utilisé plusieurs fois.`,
          },
          {
            status: 400,
          }
        );
      }

      tableNumbers.add(
        normalizedNumber
      );

      if (
        !Number.isFinite(
          totalPrice
        ) ||
        totalPrice <= 0
      ) {
        return NextResponse.json(
          {
            error:
              `Prix invalide pour la table ${tableNumber}.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(
          capacity
        ) ||
        capacity < 1
      ) {
        return NextResponse.json(
          {
            error:
              `Capacité invalide pour la table ${tableNumber}.`,
          },
          {
            status: 400,
          }
        );
      }

      if (
        !Number.isInteger(
          threshold
        ) ||
        threshold < 1 ||
        threshold >
          capacity
      ) {
        return NextResponse.json(
          {
            error:
              `Le seuil de la table ${tableNumber} doit être compris entre 1 et ${capacity}.`,
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
                `Échéance invalide pour la table ${tableNumber}.`,
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
    | Vérifier le slug avant de créer quoi que ce soit
    |--------------------------------------------------------------------------
    */

    const {
      data:
        existingEvent,
    } =
      await supabaseAdmin
        .from("events")
        .select("id")
        .eq(
          "slug",
          slug
        )
        .maybeSingle();

    if (existingEvent) {
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
    | Club
    |--------------------------------------------------------------------------
    */

    let finalClubId =
      clubId;

    /*
    |--------------------------------------------------------------------------
    | Nouveau club : Manager uniquement
    |--------------------------------------------------------------------------
    */

    if (
      clubMode === "new"
    ) {
      if (!access.isManager) {
        return NextResponse.json(
          {
            error:
              "Seul le Manager VIP Share peut créer un nouveau club.",
          },
          {
            status: 403,
          }
        );
      }

      if (
        !clubName ||
        !clubCity
      ) {
        return NextResponse.json(
          {
            error:
              "Nom et ville du club obligatoires.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: newClub,
        error:
          clubInsertError,
      } =
        await supabaseAdmin
          .from("clubs")
          .insert({
            name:
              clubName,

            city:
              clubCity,

            address:
              clubAddress ||
              null,
          })
          .select("id")
          .single();

      if (
        clubInsertError ||
        !newClub
      ) {
        console.error(
          "Erreur création club :",
          clubInsertError
        );

        return NextResponse.json(
          {
            error:
              "Impossible de créer le club.",
          },
          {
            status: 500,
          }
        );
      }

      finalClubId =
        newClub.id;

      createdClubId =
        newClub.id;
    }

    /*
    |--------------------------------------------------------------------------
    | Club existant
    |--------------------------------------------------------------------------
    */

    else if (
      clubMode === "existing"
    ) {
      if (!clubId) {
        return NextResponse.json(
          {
            error:
              "Club invalide.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: existingClub,
        error:
          existingClubError,
      } =
        await supabaseAdmin
          .from("clubs")
          .select("id")
          .eq(
            "id",
            clubId
          )
          .maybeSingle();

      if (
        existingClubError ||
        !existingClub
      ) {
        return NextResponse.json(
          {
            error:
              "Club introuvable.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        !canManageClub(
          access,
          clubId
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Vous n'êtes pas autorisé à créer une soirée pour ce club.",
          },
          {
            status: 403,
          }
        );
      }

      finalClubId =
        clubId;
    }

    else {
      return NextResponse.json(
        {
          error:
            "Mode de sélection du club invalide.",
        },
        {
          status: 400,
        }
      );
    }

    if (!finalClubId) {
      return NextResponse.json(
        {
          error:
            "Club invalide.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Créer la soirée
    |--------------------------------------------------------------------------
    */

    const {
      data: event,
      error:
        eventInsertError,
    } =
      await supabaseAdmin
        .from("events")
        .insert({
          club_id:
            finalClubId,

          slug,

          name,

          event_date:
            eventDate,

          start_time:
            startTime,

          music:
            music || null,

          commission_percentage:
            commissionPercentage,

          image_url:
            null,

          table_map_url:
            null,

          status:
            "published",
        })
        .select(
          "id, slug"
        )
        .single();

    if (
      eventInsertError ||
      !event
    ) {
      console.error(
        "Erreur création event :",
        eventInsertError
      );

      if (
        createdClubId
      ) {
        await supabaseAdmin
          .from("clubs")
          .delete()
          .eq(
            "id",
            createdClubId
          );
      }

      return NextResponse.json(
        {
          error:
            "Impossible de créer la soirée.",
        },
        {
          status: 500,
        }
      );
    }

    createdEventId =
      event.id;

    /*
    |--------------------------------------------------------------------------
    | Upload affiche / map
    |--------------------------------------------------------------------------
    */

    let imageUrl:
      | string
      | null = null;

    let tableMapUrl:
      | string
      | null = null;

    if (posterFile) {
      const extension =
        getExtension(
          posterFile
        );

      const path =
        `events/${event.id}/poster-${randomUUID()}.${extension}`;

      const {
        error:
          posterUploadError,
      } =
        await supabaseAdmin
          .storage
          .from(
            STORAGE_BUCKET
          )
          .upload(
            path,
            posterFile,
            {
              contentType:
                posterFile.type,

              upsert:
                false,
            }
          );

      if (
        posterUploadError
      ) {
        throw new Error(
          `Impossible d'importer l'affiche : ${posterUploadError.message}`
        );
      }

      uploadedPaths.push(
        path
      );

      const {
        data: publicUrlData,
      } =
        supabaseAdmin
          .storage
          .from(
            STORAGE_BUCKET
          )
          .getPublicUrl(
            path
          );

      imageUrl =
        publicUrlData
          .publicUrl;
    }

    if (tableMapFile) {
      const extension =
        getExtension(
          tableMapFile
        );

      const path =
        `events/${event.id}/table-map-${randomUUID()}.${extension}`;

      const {
        error:
          mapUploadError,
      } =
        await supabaseAdmin
          .storage
          .from(
            STORAGE_BUCKET
          )
          .upload(
            path,
            tableMapFile,
            {
              contentType:
                tableMapFile.type,

              upsert:
                false,
            }
          );

      if (
        mapUploadError
      ) {
        throw new Error(
          `Impossible d'importer la map : ${mapUploadError.message}`
        );
      }

      uploadedPaths.push(
        path
      );

      const {
        data: publicUrlData,
      } =
        supabaseAdmin
          .storage
          .from(
            STORAGE_BUCKET
          )
          .getPublicUrl(
            path
          );

      tableMapUrl =
        publicUrlData
          .publicUrl;
    }

    /*
    |--------------------------------------------------------------------------
    | Sauvegarder URLs médias
    |--------------------------------------------------------------------------
    */

    if (
      imageUrl ||
      tableMapUrl
    ) {
      const {
        error:
          mediaUpdateError,
      } =
        await supabaseAdmin
          .from("events")
          .update({
            image_url:
              imageUrl,

            table_map_url:
              tableMapUrl,
          })
          .eq(
            "id",
            event.id
          );

      if (
        mediaUpdateError
      ) {
        throw new Error(
          "Impossible d'enregistrer les images de la soirée."
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Créer toutes les tables
    |--------------------------------------------------------------------------
    */

    const offerRows =
      tables.map(
        (table) => {
          const capacity =
            Number(
              table.capacity
            );

          const totalPrice =
            roundMoney(
              Number(
                table.totalTablePrice
              )
            );

          const pricePerPerson =
            roundMoney(
              totalPrice /
                capacity
            );

          const commissionPerPerson =
            roundMoney(
              pricePerPerson *
                (
                  commissionPercentage /
                  100
                )
            );

          const remainingPerPerson =
            roundMoney(
              pricePerPerson -
                commissionPerPerson
            );

          return {
            event_id:
              event.id,

            table_number:
              table.tableNumber
                .trim(),

            total_table_price:
              totalPrice,

            capacity,

            confirmation_threshold:
              Number(
                table.confirmationThreshold
              ),

            price_per_person:
              pricePerPerson,

            /*
             * Compatibilité temporaire
             * avec le système Stripe actuel :
             *
             * deposit_per_person =
             * commission VIP Share.
             */
            deposit_per_person:
              commissionPerPerson,

            remaining_per_person:
              remainingPerPerson,

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
        offersInsertError,
    } =
      await supabaseAdmin
        .from(
          "vip_offers"
        )
        .insert(
          offerRows
        );

    if (
      offersInsertError
    ) {
      console.error(
        "Erreur création tables VIP :",
        offersInsertError
      );

      throw new Error(
        "Impossible de créer les tables VIP."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Succès
    |--------------------------------------------------------------------------
    */

    return NextResponse.json(
      {
        success:
          true,

        eventId:
          event.id,

        slug:
          event.slug,

        tablesCreated:
          tables.length,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/admin/events :",
      error
    );

    /*
    |--------------------------------------------------------------------------
    | Nettoyage si la création échoue
    |--------------------------------------------------------------------------
    */

    await removeUploadedFiles(
      uploadedPaths
    );

    if (
      createdEventId
    ) {
      await supabaseAdmin
        .from("events")
        .delete()
        .eq(
          "id",
          createdEventId
        );
    }

    if (
      createdClubId
    ) {
      await supabaseAdmin
        .from("clubs")
        .delete()
        .eq(
          "id",
          createdClubId
        );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Une erreur interne est survenue.",
      },
      {
        status: 500,
      }
    );
  }
}