import { addDays, eachDay, eachMonth, endOfMonth, inRange } from "./dates";
import type {
  DateRange,
  DfcSection,
  FinanceData,
  ISODate,
  Movement,
  Transfer,
} from "./types";

const round2 = (v: number) => Math.round(v * 100) / 100;
const signed = (m: Movement) => (m.type === "inflow" ? m.amount : -m.amount);

export interface Scope {
  /** Contas selecionadas; vazio = todas. */
  accountIds: string[];
}

function accountFilter(data: FinanceData, scope: Scope) {
  const ids = scope.accountIds.length ? new Set(scope.accountIds) : new Set(data.accounts.map((a) => a.id));
  return (id: string) => ids.has(id);
}

/** Efeito de uma transferência no saldo das contas selecionadas. */
function transferEffect(t: Transfer, has: (id: string) => boolean): number {
  return (has(t.destinationAccountId) ? t.amount : 0) - (has(t.sourceAccountId) ? t.amount : 0);
}

/** Saldo realizado (só o que foi baixado) ao fim do dia `date`. */
export function balanceAt(data: FinanceData, scope: Scope, date: ISODate): number {
  const has = accountFilter(data, scope);
  let total = 0;
  for (const a of data.accounts) if (has(a.id)) total += a.initialBalance;
  for (const m of data.movements) if (m.paid && m.date <= date && has(m.bankAccountId)) total += signed(m);
  for (const t of data.transfers) if (t.date <= date) total += transferEffect(t, has);
  return round2(total);
}

/** Saldo atual de cada conta (todos os lançamentos baixados, independente da data). */
export function accountBalances(data: FinanceData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of data.accounts) out[a.id] = a.initialBalance;
  for (const m of data.movements) if (m.paid) out[m.bankAccountId] = (out[m.bankAccountId] ?? 0) + signed(m);
  for (const t of data.transfers) {
    out[t.sourceAccountId] -= t.amount;
    out[t.destinationAccountId] += t.amount;
  }
  for (const k in out) out[k] = round2(out[k]);
  return out;
}

export function currentBalance(data: FinanceData, scope: Scope): number {
  const has = accountFilter(data, scope);
  const b = accountBalances(data);
  return round2(Object.entries(b).reduce((s, [id, v]) => (has(id) ? s + v : s), 0));
}

export function movementsIn(data: FinanceData, scope: Scope, range: DateRange): Movement[] {
  const has = accountFilter(data, scope);
  return data.movements.filter((m) => has(m.bankAccountId) && inRange(m.date, range));
}

export function transfersIn(data: FinanceData, scope: Scope, range: DateRange): Transfer[] {
  const has = accountFilter(data, scope);
  return data.transfers.filter(
    (t) => inRange(t.date, range) && (has(t.sourceAccountId) || has(t.destinationAccountId)),
  );
}

const sum = (ms: { amount: number }[]) => round2(ms.reduce((s, m) => s + m.amount, 0));

export interface PeriodSummary {
  received: number;
  openInflows: number;
  openInflowsCount: number;
  paidInflowsCount: number;
  overdueInflowsCount: number;
  spent: number;
  openOutflows: number;
  openOutflowsCount: number;
  paidOutflowsCount: number;
  overdueOutflows: number;
  overdueOutflowsCount: number;
  transfers: number;
  transfersCount: number;
  current: number;
  projection: number;
}

export function periodSummary(data: FinanceData, scope: Scope, range: DateRange, today: ISODate): PeriodSummary {
  const ms = movementsIn(data, scope, range);
  const inflows = ms.filter((m) => m.type === "inflow");
  const outflows = ms.filter((m) => m.type === "outflow");
  const paidIn = inflows.filter((m) => m.paid);
  const openIn = inflows.filter((m) => !m.paid);
  const paidOut = outflows.filter((m) => m.paid);
  const openOut = outflows.filter((m) => !m.paid);
  const overdueOut = openOut.filter((m) => m.date < today);
  const ts = transfersIn(data, scope, range);
  const current = currentBalance(data, scope);
  return {
    received: sum(paidIn),
    openInflows: sum(openIn),
    openInflowsCount: openIn.length,
    paidInflowsCount: paidIn.length,
    overdueInflowsCount: openIn.filter((m) => m.date < today).length,
    spent: sum(paidOut),
    openOutflows: sum(openOut),
    openOutflowsCount: openOut.length,
    paidOutflowsCount: paidOut.length,
    overdueOutflows: sum(overdueOut),
    overdueOutflowsCount: overdueOut.length,
    transfers: sum(ts),
    transfersCount: ts.length,
    current,
    projection: round2(current + sum(openIn) - sum(openOut)),
  };
}

export interface DailyPoint {
  date: ISODate;
  balance: number;
  inflow: number;
  outflow: number;
}

/** Saldo realizado dia a dia no período + entradas/saídas baixadas do dia. */
export function dailyBalances(data: FinanceData, scope: Scope, range: DateRange): DailyPoint[] {
  const has = accountFilter(data, scope);
  let balance = balanceAt(data, scope, addDays(range.start, -1));
  const byDay = new Map<ISODate, { i: number; o: number; t: number }>();
  const bucket = (d: ISODate) => {
    let b = byDay.get(d);
    if (!b) byDay.set(d, (b = { i: 0, o: 0, t: 0 }));
    return b;
  };
  for (const m of data.movements) {
    if (!m.paid || !has(m.bankAccountId) || !inRange(m.date, range)) continue;
    const b = bucket(m.date);
    if (m.type === "inflow") b.i += m.amount;
    else b.o += m.amount;
  }
  for (const t of data.transfers) if (inRange(t.date, range)) bucket(t.date).t += transferEffect(t, has);
  return eachDay(range).map((date) => {
    const b = byDay.get(date);
    if (b) balance += b.i - b.o + b.t;
    return { date, balance: round2(balance), inflow: round2(b?.i ?? 0), outflow: round2(b?.o ?? 0) };
  });
}

export interface MonthPoint {
  month: string; // YYYY-MM
  inflowPaid: number;
  outflowPaid: number;
  inflowOpen: number;
  outflowOpen: number;
}

export function monthlySeries(data: FinanceData, scope: Scope, range: DateRange): MonthPoint[] {
  const months = eachMonth(range);
  const idx = new Map(months.map((m, i) => [m, i]));
  const out: MonthPoint[] = months.map((month) => ({ month, inflowPaid: 0, outflowPaid: 0, inflowOpen: 0, outflowOpen: 0 }));
  for (const m of movementsIn(data, scope, { start: range.start, end: endOfMonth(range.end) })) {
    const i = idx.get(m.date.slice(0, 7));
    if (i === undefined) continue;
    const p = out[i];
    if (m.type === "inflow") {
      if (m.paid) p.inflowPaid += m.amount;
      else p.inflowOpen += m.amount;
    } else if (m.paid) p.outflowPaid += m.amount;
    else p.outflowOpen += m.amount;
  }
  return out.map((p) => ({
    ...p,
    inflowPaid: round2(p.inflowPaid),
    outflowPaid: round2(p.outflowPaid),
    inflowOpen: round2(p.inflowOpen),
    outflowOpen: round2(p.outflowOpen),
  }));
}

/* ---------------- Demonstrativo de caixa (DFC) ---------------- */

export const SECTION_ORDER: DfcSection[] = [
  "operating_revenue",
  "variable_costs",
  "fixed_expenses",
  "financial_other",
  "investments",
  "partners_loans",
];

export const SECTION_LABEL: Record<DfcSection, string> = {
  operating_revenue: "Receitas da operação",
  variable_costs: "Custos que variam com a venda",
  fixed_expenses: "Despesas fixas do mês",
  financial_other: "Juros, tarifas e outras",
  investments: "Investimentos e bens",
  partners_loans: "Sócios e empréstimos",
};

export interface StatementRow {
  id: string;
  name: string;
  color?: string;
  values: number[]; // um por mês
  total: number;
  categories?: StatementRow[];
}

export interface CashflowStatement {
  months: string[];
  sections: Record<DfcSection, { values: number[]; total: number; groups: StatementRow[] }>;
  contributionMargin: number[];
  operatingResult: number[];
  operatingCashGeneration: number[];
  cashVariation: number[];
  openingBalance: number[];
  closingBalance: number[];
}

/** Regime de caixa, só realizado (baixado), mês a mês. */
export function cashflowStatement(data: FinanceData, scope: Scope, range: DateRange): CashflowStatement {
  const months = eachMonth(range);
  const n = months.length;
  const mi = new Map(months.map((m, i) => [m, i]));
  const zero = () => new Array<number>(n).fill(0);
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const groupById = new Map(data.groups.map((g) => [g.id, g]));

  const groupRows = new Map<string, StatementRow>();
  const catRows = new Map<string, StatementRow>();
  for (const m of movementsIn(data, scope, range)) {
    if (!m.paid) continue;
    const i = mi.get(m.date.slice(0, 7));
    if (i === undefined || !m.categoryId) continue;
    const cat = catById.get(m.categoryId);
    const group = cat && groupById.get(cat.groupId);
    if (!cat || !group) continue;
    let gr = groupRows.get(group.id);
    if (!gr) groupRows.set(group.id, (gr = { id: group.id, name: group.name, color: group.color, values: zero(), total: 0, categories: [] }));
    let cr = catRows.get(cat.id);
    if (!cr) {
      catRows.set(cat.id, (cr = { id: cat.id, name: cat.name, values: zero(), total: 0 }));
      gr.categories!.push(cr);
    }
    const v = signed(m);
    gr.values[i] += v;
    cr.values[i] += v;
  }

  const sections = Object.fromEntries(
    SECTION_ORDER.map((s) => [s, { values: zero(), total: 0, groups: [] as StatementRow[] }]),
  ) as CashflowStatement["sections"];
  for (const g of [...data.groups].sort((a, b) => a.position - b.position)) {
    const row = groupRows.get(g.id);
    if (!row) continue;
    row.values = row.values.map(round2);
    row.total = round2(row.values.reduce((a, b) => a + b, 0));
    row.categories!.forEach((c) => {
      c.values = c.values.map(round2);
      c.total = round2(c.values.reduce((a, b) => a + b, 0));
    });
    row.categories!.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const sec = sections[g.section];
    sec.groups.push(row);
    row.values.forEach((v, i) => (sec.values[i] += v));
  }
  for (const s of SECTION_ORDER) {
    sections[s].values = sections[s].values.map(round2);
    sections[s].total = round2(sections[s].values.reduce((a, b) => a + b, 0));
  }

  const add = (...arrs: number[][]) => zero().map((_, i) => round2(arrs.reduce((s, a) => s + a[i], 0)));
  const contributionMargin = add(sections.operating_revenue.values, sections.variable_costs.values);
  const operatingResult = add(contributionMargin, sections.fixed_expenses.values);
  const operatingCashGeneration = add(operatingResult, sections.financial_other.values);

  // Variação de caixa usa todos os lançamentos baixados (inclusive sem categoria),
  // para fechar com o saldo; transferências entre contas selecionadas se anulam.
  const opening: number[] = [];
  const closing: number[] = [];
  const variation: number[] = [];
  for (const m of months) {
    const start = `${m}-01`;
    const o = balanceAt(data, scope, addDays(start, -1));
    const c = balanceAt(data, scope, endOfMonth(start));
    opening.push(o);
    closing.push(c);
    variation.push(round2(c - o));
  }

  return {
    months,
    sections,
    contributionMargin,
    operatingResult,
    operatingCashGeneration,
    cashVariation: variation,
    openingBalance: opening,
    closingBalance: closing,
  };
}

/** Valores realizados por categoria (aba Categorias dos relatórios); despesas por padrão. */
export function expensesByCategory(data: FinanceData, scope: Scope, range: DateRange, top = 5, type: "inflow" | "outflow" = "outflow") {
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const m of movementsIn(data, scope, range)) {
    if (!m.paid || m.type !== type) continue;
    const key = m.categoryId ?? "none";
    totals.set(key, (totals.get(key) ?? 0) + m.amount);
  }
  const all = [...totals.entries()]
    .map(([id, amount]) => ({ id, name: catById.get(id)?.name ?? "Sem categoria", amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const total = all.reduce((s, r) => s + r.amount, 0);
  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (rest.length) head.push({ id: "others", name: "Outros", amount: round2(rest.reduce((s, r) => s + r.amount, 0)) });
  return { total: round2(total), rows: head.map((r) => ({ ...r, share: total ? r.amount / total : 0 })) };
}
