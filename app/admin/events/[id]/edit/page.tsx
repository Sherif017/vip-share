import {
  notFound,
  redirect,
} from "next/navigation";

import {
  canManageEvent,
  getAdminAccess,
} from "@/lib/admin-access";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import EditEventForm from "./EditEventForm";

type VipOffer = {
  id: string;
  table_number: string;
  total_table_price: number;

  capacity: number;
  confirmation_threshold: number;

  price_per_person: number;
  deposit_per_person: number;
  remaining_per_person: number;

  spots_reserved: number;

  booking_deadline:
    | string
    | null;

  status: string;
};

type EventData = {
  id: string;
  slug: string;
  name: string;

  event_date: string;
  start_time: string;

  music: string | null;

  image_url:
    | string
    | null;

  table_map_url:
    | string
    | null;

  commission_percentage:
    number;

  vip_offers:
    | VipOffer[]
    | null;
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } =
    await params;

  /*
  |--------------------------------------------------------------------------
  | Permissions
  |--------------------------------------------------------------------------
  */

  const access =
    await getAdminAccess();

  if (!access) {
    redirect("/login");
  }

  if (!access.canManageAnyClub) {
    redirect("/events");
  }

  const allowed =
    await canManageEvent(
      access,
      id
    );

  if (!allowed) {
    redirect("/admin");
  }

  /*
  |--------------------------------------------------------------------------
  | Soirée
  |--------------------------------------------------------------------------
  */

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("events")
      .select(`
        id,
        slug,
        name,
        event_date,
        start_time,
        music,
        image_url,
        table_map_url,
        commission_percentage,

        vip_offers (
          id,
          table_number,
          total_table_price,
          capacity,
          confirmation_threshold,
          price_per_person,
          deposit_per_person,
          remaining_per_person,
          spots_reserved,
          booking_deadline,
          status
        )
      `)
      .eq("id", id)
      .maybeSingle();

  if (error) {
    console.error(
      "Erreur récupération event :",
      error
    );
  }

  if (!data) {
    notFound();
  }

  const event =
    data as unknown as EventData;

  const tables =
    [...(event.vip_offers ?? [])]
      .sort((a, b) =>
        String(
          a.table_number
        ).localeCompare(
          String(
            b.table_number
          ),
          "fr",
          {
            numeric: true,
          }
        )
      );

  if (
    tables.length === 0
  ) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">

        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
          VIP Share · Admin
        </p>

        <h1 className="mt-3 text-4xl font-bold">
          Modifier la soirée
        </h1>

        <p className="mt-3 max-w-2xl text-zinc-400">
          Modifie les informations de la soirée,
          le Deposit et les différentes tables VIP.
        </p>

        <div className="mt-10">
          <EditEventForm
            eventId={
              event.id
            }
            initialValues={{
              name:
                event.name,

              slug:
                event.slug,

              eventDate:
                event.event_date,

              startTime:
                event.start_time?.slice(
                  0,
                  5
                ) ?? "",

              music:
                event.music ??
                "",

              depositPercentage:
                Number(
                  event.commission_percentage ??
                    20
                ),

              imageUrl:
                event.image_url,

              tableMapUrl:
                event.table_map_url,

              tables:
                tables.map(
                  (
                    table
                  ) => ({
                    id:
                      table.id,

                    tableNumber:
                      table.table_number,

                    totalTablePrice:
                      Number(
                        table.total_table_price
                      ),

                    capacity:
                      Number(
                        table.capacity
                      ),

                    confirmationThreshold:
                      Number(
                        table.confirmation_threshold
                      ),

                    bookingDeadline:
                      toDatetimeLocal(
                        table.booking_deadline
                      ),

                    spotsReserved:
                      Number(
                        table.spots_reserved ??
                          0
                      ),

                    status:
                      table.status,
                  })
                ),
            }}
          />
        </div>

      </div>
    </main>
  );
}

function toDatetimeLocal(
  value: string | null
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const pad = (
    value: number
  ) =>
    String(value).padStart(
      2,
      "0"
    );

  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() +
        1
    ),
    "-",
    pad(
      date.getDate()
    ),
    "T",
    pad(
      date.getHours()
    ),
    ":",
    pad(
      date.getMinutes()
    ),
  ].join("");
}