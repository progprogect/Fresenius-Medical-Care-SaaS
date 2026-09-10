import { formatInTimeZone } from "date-fns-tz";

export function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function fmtClinic(date: Date | string, timezone: string, pattern = "EEE, d MMM yyyy 'at' HH:mm") {
  return formatInTimeZone(new Date(date), timezone, pattern);
}

export function fmtTime(date: Date | string, timezone: string) {
  return formatInTimeZone(new Date(date), timezone, "HH:mm");
}

export function fmtDate(date: Date | string, timezone: string) {
  return formatInTimeZone(new Date(date), timezone, "EEE, d MMM yyyy");
}

export function minutesToHHMM(min: number) {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
