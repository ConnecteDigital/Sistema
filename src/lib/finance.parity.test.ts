/**
 * Paridade com o sistema original (valores capturados em 15/10/2026).
 * Roda só quando o export do FCS V1 está disponível:
 *   LEGACY_EXPORT=/caminho/dados.json npx vitest run
 * O arquivo de dados nunca entra no repositório.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertLegacyExport, verifyBalances, type LegacyExport } from "./legacy-import";
import {
  accountBalances,
  cashflowStatement,
  dailyBalances,
  expensesByCategory,
  monthlySeries,
  movementsIn,
  periodSummary,
} from "./finance";

const path = process.env.LEGACY_EXPORT;
const run = path && existsSync(path) ? describe : describe.skip;

run("paridade com o FCS (export de 15/10/2026)", () => {
  const src = JSON.parse(readFileSync(path!, "utf8")) as LegacyExport;
  const { data } = convertLegacyExport(src);
  const all = { accountIds: [] };
  const today = "2026-10-15";
  const oct = { start: "2026-10-01", end: "2026-10-31" };
  const year = { start: "2026-01-01", end: "2026-12-31" };

  it("saldos por conta batem com o export", () => {
    for (const r of verifyBalances(src, accountBalances(data), data)) expect(r.ok, r.account).toBe(true);
  });

  it("painel de outubro/2026", () => {
    const s = periodSummary(data, all, oct, today);
    expect(s.current).toBe(395540.79);
    expect(s.received).toBe(14975);
    expect(s.openInflows).toBe(19350);
    expect(s.openInflowsCount).toBe(22);
    expect(s.paidInflowsCount).toBe(15);
    expect(s.spent).toBe(7326.68);
    expect(s.openOutflows).toBe(19643);
    expect(s.openOutflowsCount).toBe(4);
    expect(s.paidOutflowsCount).toBe(14);
    expect(s.transfers).toBe(11020.97);
    expect(s.transfersCount).toBe(2);
    expect(s.overdueOutflows).toBe(0);
    expect(s.projection).toBe(395247.79);
  });

  it("gráfico de saldo de outubro/2026", () => {
    const pts = dailyBalances(data, all, oct);
    expect(pts[0].balance).toBe(387820.47); // menor saldo, 1 out
    expect(pts.at(-1)!.balance).toBe(395540.79);
    expect(Math.min(...pts.map((p) => p.balance))).toBe(387820.47);
  });

  it("movimentos de outubro/2026", () => {
    const ms = movementsIn(data, all, oct);
    expect(ms.length).toBe(55);
    const inflow = ms.filter((m) => m.type === "inflow").reduce((s, m) => s + m.amount, 0);
    const outflow = ms.filter((m) => m.type === "outflow").reduce((s, m) => s + m.amount, 0);
    expect(Math.round(inflow * 100) / 100).toBe(34325);
    expect(Math.round(outflow * 100) / 100).toBe(26969.68);
  });

  it("relatório anual 2026", () => {
    const st = cashflowStatement(data, all, year);
    expect(st.openingBalance[0]).toBe(348425);
    expect(st.closingBalance[11]).toBe(395540.79);
    expect(Math.round(st.sections.operating_revenue.total)).toBe(358236);
    expect(Math.round(st.sections.variable_costs.total)).toBe(-24278);
    expect(Math.round(st.sections.fixed_expenses.total)).toBe(-286842);
    expect(st.sections.operating_revenue.values.slice(0, 3).map(Math.round)).toEqual([27151, 32800, 34550]);
    const series = monthlySeries(data, all, year);
    expect(series[1].outflowPaid).toBe(44416.17);
    expect(series[9].inflowOpen + series[9].inflowPaid).toBe(34325);
  });

  it("despesas por categoria 2026", () => {
    const r = expensesByCategory(data, all, year);
    expect(r.rows[0]).toMatchObject({ name: "Retirada de lucro", amount: 148500 });
    expect(r.total).toBe(311120.21);
  });
});
