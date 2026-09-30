type EventClock = {
  eventDate: string;
  startTime: string;
  endTime?: string | null;
};

type ParisClock = {
  date: string;
  time: string;
};

function parisClock(
  date = new Date()
): ParisClock {
  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(date);

  const get = (
    type:
      Intl.DateTimeFormatPartTypes
  ) =>
    parts.find(
      (part) =>
        part.type === type
    )?.value ?? "";

  return {
    date:
      `${get("year")}-${get("month")}-${get("day")}`,
    time:
      `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function normalizeTime(
  value:
    | string
    | null
    | undefined
): string {
  const raw =
    String(value ?? "")
      .slice(0, 8);

  if (
    /^\d{2}:\d{2}:\d{2}$/.test(
      raw
    )
  ) {
    return raw;
  }

  if (
    /^\d{2}:\d{2}$/.test(
      raw
    )
  ) {
    return `${raw}:00`;
  }

  return "06:00:00";
}

function addCalendarDays(
  date: string,
  days: number
): string {
  const [
    year,
    month,
    day,
  ] =
    date
      .split("-")
      .map(Number);

  const value =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  value.setUTCDate(
    value.getUTCDate() +
      days
  );

  return value
    .toISOString()
    .slice(0, 10);
}

export function parisToday(
  date = new Date()
): string {
  return parisClock(date).date;
}

export function parisDateOffset(
  days: number,
  date = new Date()
): string {
  return addCalendarDays(
    parisToday(date),
    days
  );
}

/**
 * Si l'heure de fin est <= à l'heure
 * de début, la soirée se termine
 * le lendemain.
 *
 * Exemple :
 * 23:30 -> 05:00
 */
export function eventEndDate(
  event: EventClock
): string {
  const start =
    normalizeTime(
      event.startTime
    );

  const end =
    normalizeTime(
      event.endTime
    );

  return end <= start
    ? addCalendarDays(
        event.eventDate,
        1
      )
    : event.eventDate;
}

/**
 * Les nouvelles réservations ferment
 * dès le début de la soirée.
 */
export function eventHasStarted(
  event: EventClock,
  now = new Date()
): boolean {
  const current =
    parisClock(now);

  const currentKey =
    `${current.date}T${current.time}`;

  const startKey =
    `${event.eventDate}T${normalizeTime(
      event.startTime
    )}`;

  return (
    currentKey >= startKey
  );
}

/**
 * La soirée reste publiquement visible
 * jusqu'à son heure réelle de fin.
 */
export function eventIsOver(
  event: EventClock,
  now = new Date()
): boolean {
  const current =
    parisClock(now);

  const currentKey =
    `${current.date}T${current.time}`;

  const endKey =
    `${eventEndDate(event)}T${normalizeTime(
      event.endTime
    )}`;

  return (
    currentKey >= endKey
  );
}
