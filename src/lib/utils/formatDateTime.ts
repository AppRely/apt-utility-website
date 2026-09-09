export function getISTDateTimeParts(value: unknown) {
  const date = new Date(String(value ?? ""));

  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${getPart("day")}/${getPart("month")}/${getPart("year")}`,
    time: `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`,
  };
}

export function formatToIST(value: unknown): string {
  const parts = getISTDateTimeParts(value);
  return parts ? `${parts.date} ${parts.time}` : "—";
}
