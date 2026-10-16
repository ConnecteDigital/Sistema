import type { DateRange, ISODate } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(s: ISODate, months: number): ISODate {
  const d = parseISO(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + "01";
}

export function endOfMonth(s: ISODate): ISODate {
  const d = parseISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function monthRange(s: ISODate): DateRange {
  return { start: startOfMonth(s), end: endOfMonth(s) };
}

export function yearRange(s: ISODate): DateRange {
  const y = s.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** Lista de dias (inclusive) entre start e end. */
export function eachDay(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Lista de meses "YYYY-MM" (inclusive) entre start e end. */
export function eachMonth(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = startOfMonth(range.start); d <= range.end; d = addMonths(d, 1)) out.push(d.slice(0, 7));
  return out;
}

export function inRange(d: ISODate, r: DateRange): boolean {
  return d >= r.start && d <= r.end;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}
