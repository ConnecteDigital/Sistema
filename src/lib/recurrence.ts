import { addDays, addMonths, daysBetween } from "./dates";
import type { FinanceData, ISODate, Movement, Recurrence, RecurrencePeriod } from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Quanto uma série vale por mês. */
export const MONTHLY_FACTOR: Record<RecurrencePeriod, number> = {
  daily: 365.25 / 12,
  weekly: 365.25 / 7 / 12,
  biweekly: 365.25 / 14 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

export const PERIOD_LABEL: Record<RecurrencePeriod, string> = {
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

/** n-ésima data da série (0 = data inicial). */
export function nthOccurrence(start: ISODate, period: RecurrencePeriod, n: number): ISODate {
  switch (period) {
    case "daily":
      return addDays(start, n);
    case "weekly":
      return addDays(start, 7 * n);
    case "biweekly":
      return addDays(start, 14 * n);
    case "monthly":
      return addMonths(start, n);
    case "quarterly":
      return addMonths(start, 3 * n);
    case "semiannual":
      return addMonths(start, 6 * n);
    case "annual":
      return addMonths(start, 12 * n);
  }
}

export type SeriesStatus = "active" | "overdue" | "completed" | "canceled";

export interface SeriesStats {
  recurrence: Recurrence;
  movements: Movement[];
  launched: number; // lançamentos até hoje
  paidCount: number;
  next: Movement | null; // próximo em aberto a partir de hoje
  daysToNext: number | null;
  openFuture: number; // soma dos em aberto a partir de hoje
  lastDate: ISODate | null;
  overdue: Movement[];
  monthly: number;
  status: SeriesStatus;
}

export function seriesStats(data: FinanceData, today: ISODate): SeriesStats[] {
  const byRec = new Map<string, Movement[]>();
  for (const m of data.movements) {
    if (!m.recurrenceId) continue;
    const list = byRec.get(m.recurrenceId);
    if (list) list.push(m);
    else byRec.set(m.recurrenceId, [m]);
  }
  return data.recurrences.map((r) => {
    const ms = (byRec.get(r.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const overdue = ms.filter((m) => !m.paid && m.date < today);
    const future = ms.filter((m) => !m.paid && m.date >= today);
    const next = future[0] ?? null;
    let status: SeriesStatus;
    if (!r.active) status = "canceled";
    else if (overdue.length) status = "overdue";
    else if (!future.length) status = "completed";
    else status = "active";
    return {
      recurrence: r,
      movements: ms,
      launched: ms.filter((m) => m.date <= today).length,
      paidCount: ms.filter((m) => m.paid).length,
      next,
      daysToNext: next ? daysBetween(today, next.date) : null,
      openFuture: round2(future.reduce((s, m) => s + m.amount, 0)),
      lastDate: ms.at(-1)?.date ?? null,
      overdue,
      monthly: round2(r.amount * MONTHLY_FACTOR[r.period]),
      status,
    };
  });
}

export interface RecurrenceSummary {
  inflowMonthly: number;
  inflowSeries: number;
  outflowMonthly: number;
  outflowSeries: number;
  result: number;
  coverage: number | null;
  receivable: number;
  payable: number;
  horizon: ISODate | null;
  overdueAmount: number;
  overdueCount: number;
}

export function recurrenceSummary(stats: SeriesStats[]): RecurrenceSummary {
  const live = stats.filter((s) => s.status === "active" || s.status === "overdue");
  const ins = live.filter((s) => s.recurrence.type === "inflow");
  const outs = live.filter((s) => s.recurrence.type === "outflow");
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const inflowMonthly = sum(ins.map((s) => s.monthly));
  const outflowMonthly = sum(outs.map((s) => s.monthly));
  const overdue = live.flatMap((s) => s.overdue);
  const horizon = live.reduce<ISODate | null>((h, s) => (s.lastDate && (!h || s.lastDate > h) ? s.lastDate : h), null);
  return {
    inflowMonthly,
    inflowSeries: ins.length,
    outflowMonthly,
    outflowSeries: outs.length,
    result: round2(inflowMonthly - outflowMonthly),
    coverage: outflowMonthly ? inflowMonthly / outflowMonthly : null,
    // "A vencer" do resumo inclui o que está em atraso (igual ao sistema de referência).
    receivable: sum(ins.map((s) => s.openFuture + s.overdue.reduce((t, m) => t + m.amount, 0))),
    payable: sum(outs.map((s) => s.openFuture + s.overdue.reduce((t, m) => t + m.amount, 0))),
    horizon,
    overdueAmount: sum(overdue.map((m) => m.amount)),
    overdueCount: overdue.length,
  };
}

/** Quantos meses à frente as séries sem fim ficam sempre geradas. */
export const HORIZON_MONTHS = 12;

/**
 * Lançamentos que faltam para manter as séries ativas sem fim preenchidas até
 * `HORIZON_MONTHS` à frente. Nunca preenche datas passadas nem buracos antigos.
 */
export function missingOccurrences(data: FinanceData, today: ISODate): Omit<Movement, "id">[] {
  const horizon = addMonths(today, HORIZON_MONTHS);
  const out: Omit<Movement, "id">[] = [];
  const byRec = new Map<string, Movement[]>();
  for (const m of data.movements) if (m.recurrenceId) (byRec.get(m.recurrenceId) ?? byRec.set(m.recurrenceId, []).get(m.recurrenceId)!).push(m);
  for (const r of data.recurrences) {
    // Só séries sem fim e ativas; parceladas já nascem completas e nunca são refeitas.
    if (!r.active || !r.bankAccountId || r.quantity !== null) continue;
    const ms = byRec.get(r.id) ?? [];
    if (!ms.length) continue; // séries sem nenhum lançamento ficam como estão
    const existing = new Set(ms.map((m) => m.date));
    const last = ms.reduce((d, m) => (m.date > d ? m.date : d), ms[0].date);
    const template = ms.reduce((a, m) => (m.date > a.date ? m : a), ms[0]);
    for (let n = 0; n < 2000; n++) {
      const d = nthOccurrence(r.startDate, r.period, n);
      if (d > horizon) break;
      if (d <= last || d < today || existing.has(d)) continue;
      out.push({
        type: r.type,
        date: d,
        competenceDate: d,
        dueDate: d,
        amount: r.amount,
        description: template.description || r.description,
        bankAccountId: r.bankAccountId,
        categoryId: r.categoryId ?? template.categoryId,
        contactId: r.contactId ?? template.contactId,
        recurrenceId: r.id,
        paid: false,
        installment: 0,
        totalInstallments: 0,
        documentNumber: null,
        notes: null,
      });
    }
  }
  return out;
}
