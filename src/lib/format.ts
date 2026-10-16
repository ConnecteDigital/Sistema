import { parseISO } from "./dates";
import type { ISODate } from "./types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$ 1.234,56" (negativos como "-R$ 1.234,56", igual ao original). */
export function formatBRL(v: number): string {
  return brl.format(v).replace(/ /g, " ").replace("-R$ ", "-R$ ");
}

/** Separa reais e centavos para o número grande do card herói. */
export function splitBRL(v: number): { int: string; cents: string } {
  const [int, cents] = num2.format(Math.abs(v)).split(",");
  return { int: (v < 0 ? "-" : "") + int, cents };
}

/** Valor do demonstrativo: inteiro, negativos entre parênteses. */
export function formatStatement(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "0";
  return r < 0 ? `(${num0.format(-r)})` : num0.format(r);
}

export function formatCompact(v: number): string {
  if (Math.abs(v) >= 1000) return `${num0.format(v / 1000)}k`;
  return num0.format(v);
}

export function formatPercent(v: number, digits = 1): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export const monthShort = (m: number) => MONTHS_SHORT[m];
export const monthLong = (m: number) => MONTHS_LONG[m];

/** "15 out 2026" */
export function formatDate(d: ISODate): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "15 out" */
export function formatDayMonth(d: ISODate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[m - 1]}`;
}

/** "15 de outubro de 2026" */
export function formatDateLong(d: ISODate): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

export function weekday(d: ISODate): string {
  return WEEKDAYS[parseISO(d).getDay()];
}

/** "01 out → 31 out 2026" */
export function formatRange(start: ISODate, end: ISODate): string {
  const [, sm, sd] = start.split("-").map(Number);
  return `${String(sd).padStart(2, "0")} ${MONTHS_SHORT[sm - 1]} → ${formatDate(end)}`;
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s(]/gu, " ").trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
