"use client";

import {
  AreaChart as AreaIcon,
  BarChart3,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  LineChart as LineIcon,
  Scale,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DropdownMenu, Switch } from "radix-ui";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AccountFilter, PeriodPicker } from "@/components/filters";
import { useFinance } from "@/components/finance-provider";
import { KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, Segmented } from "@/components/ui/primitives";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import {
  cashflowStatement,
  expensesByCategory,
  monthlySeries,
  movementsIn,
  SECTION_LABEL,
  SECTION_ORDER,
  type CashflowStatement,
  type MonthPoint,
  type StatementRow,
} from "@/lib/finance";
import { formatBRL, formatCompact, formatDate, formatPercent, formatRange, formatStatement, monthShort } from "@/lib/format";
import type { DateRange, DfcSection } from "@/lib/types";
import { cn, groupColor } from "@/lib/utils";

type Tab = "statement" | "monthly" | "categories";

const monthLabel = (ym: string, withYear = false) => {
  const [y, m] = ym.split("-").map(Number);
  const label = monthShort(m - 1);
  return (withYear ? `${label}/${String(y).slice(2)}` : label).replace(/^./, (c) => c.toUpperCase());
};

function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const { data, error, accountIds, today } = useFinance();
  const [range, setRange] = React.useState<DateRange | null>(null);
  const [tab, setTab] = React.useState<Tab>("statement");
  const year = today ? { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` } : null;
  const period = range ?? year;

  const computed = React.useMemo(() => {
    if (!data || !period) return null;
    const scope = { accountIds };
    const statement = cashflowStatement(data, scope, period);
    const paid = movementsIn(data, scope, period).filter((m) => m.paid);
    const inflow = paid.filter((m) => m.type === "inflow").reduce((s, m) => s + m.amount, 0);
    const outflow = paid.filter((m) => m.type === "outflow").reduce((s, m) => s + m.amount, 0);
    return {
      statement,
      inflow,
      outflow,
      opening: statement.openingBalance[0] ?? 0,
      closing: statement.closingBalance.at(-1) ?? 0,
    };
  }, [data, accountIds, period]);

  if (!data || !computed || !period) return <LoadingState error={error} />;
  const { statement, inflow, outflow, opening, closing } = computed;
  const variation = closing - opening;

  const exportCSV = () => {
    const rows: string[][] = [["Linha", ...statement.months.map((m) => monthLabel(m, true)), "Total"]];
    const add = (label: string, values: number[]) => rows.push([label, ...values.map((v) => v.toFixed(2).replace(".", ",")), values.reduce((a, b) => a + b, 0).toFixed(2).replace(".", ",")]);
    for (const s of SECTION_ORDER) {
      add(SECTION_LABEL[s].toUpperCase(), statement.sections[s].values);
      for (const g of statement.sections[s].groups) {
        add(`  ${g.name}`, g.values);
        g.categories?.forEach((c) => add(`    ${c.name}`, c.values));
      }
    }
    add("Variação de caixa", statement.cashVariation);
    rows.push(["Saldo inicial", ...statement.openingBalance.map((v) => v.toFixed(2).replace(".", ",")), ""]);
    rows.push(["Saldo final", ...statement.closingBalance.map((v) => v.toFixed(2).replace(".", ",")), ""]);
    download(`demonstrativo_${period.start}_${period.end}.csv`, "﻿" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n"));
  };

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={`Regime de caixa · ${formatRange(period.start, period.end)}`}
        actions={
          <>
            <AccountFilter />
            <PeriodPicker value={period} onChange={setRange} />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Saldo inicial" tone="neutral" icon={<Wallet />} amount={opening} sub={`Em ${formatDate(addDays(period.start, -1))}`} />
        <KpiCard label="Entradas" tone="success" amount={inflow} sub={formatRange(period.start, period.end)} />
        <KpiCard label="Saídas" tone="danger" amount={outflow} sub={formatRange(period.start, period.end)} />
        <KpiCard label="Variação de caixa" tone={variation >= 0 ? "success" : "danger"} icon={<TrendingUp />} amount={variation} sub="Geração de caixa no período" />
        <KpiCard label="Saldo final" tone="neutral" icon={<Scale />} amount={closing} sub="Saldo realizado no fim do período" />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "statement", label: "Demonstrativo", icon: <FileText /> },
            { value: "monthly", label: "Fluxo mensal", icon: <BarChart3 /> },
            { value: "categories", label: "Categorias", icon: <Tag /> },
          ]}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button>
              <Download /> Exportar
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border bg-popover p-1 shadow-xl animate-pop-in">
              <DropdownMenu.Item onSelect={exportCSV} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-accent">
                <FileSpreadsheet className="size-3.5 text-muted-foreground" /> Exportar CSV
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setTimeout(() => window.print(), 50)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-accent">
                <FileText className="size-3.5 text-muted-foreground" /> Exportar PDF
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div key={tab} className="mt-3 animate-pop-in">
        {tab === "statement" && <StatementView statement={statement} period={period} />}
        {tab === "monthly" && <MonthlyView end={period.end} accountIds={accountIds} />}
        {tab === "categories" && <CategoriesView period={period} accountIds={accountIds} />}
      </div>
    </>
  );
}

/* ---------------- Demonstrativo ---------------- */

function Cell({ v, className }: { v: number; className?: string }) {
  return (
    <td className={cn("px-2 py-2.5 text-right tabular whitespace-nowrap", v < -0.004 && "text-destructive-foreground", className)} title={formatBRL(v)}>
      {formatStatement(v)}
    </td>
  );
}

function StatementView({ statement, period }: { statement: CashflowStatement; period: DateRange }) {
  const [detail, setDetail] = React.useState(false);
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = React.useState<Set<DfcSection>>(new Set());
  const months = statement.months;
  const total = (vs: number[]) => vs.reduce((a, b) => a + b, 0);
  const revenue = total(statement.sections.operating_revenue.values);
  const margin = total(statement.contributionMargin);
  const opResult = total(statement.operatingResult);

  const toggleGroup = (id: string) =>
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold">Demonstrativo de caixa</h2>
          <p className="text-[12.5px] text-muted-foreground">Regime de caixa · {formatRange(period.start, period.end)} · Realizado · mês a mês</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground print:hidden">
          Detalhar categorias
          <Switch.Root
            checked={detail}
            onCheckedChange={(v) => {
              setDetail(v);
              setOpenGroups(new Set());
            }}
            className="relative h-[18px] w-8 rounded-full bg-input transition-colors data-[state=checked]:bg-primary"
          >
            <Switch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px]" />
          </Switch.Root>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12.5px]">
          <thead>
            <tr className="border-y text-[11.5px] text-muted-foreground">
              <th className="sticky left-0 bg-card py-2.5 pl-4 text-left font-medium">Linha</th>
              {months.map((m) => (
                <th key={m} className="px-2 py-2.5 text-right font-medium">
                  {monthLabel(m, months.length > 12)}
                </th>
              ))}
              <th className="px-2 py-2.5 pr-4 text-right font-semibold text-foreground">{months.length <= 12 ? months[0].slice(0, 4) : "Total"}</th>
            </tr>
          </thead>
          <tbody className="bg-card">
            {SECTION_ORDER.map((sec) => {
              const s = statement.sections[sec];
              const isCollapsed = collapsed.has(sec);
              return (
                <React.Fragment key={sec}>
                  <tr className="border-b">
                    <td className="sticky left-0 bg-card py-2.5 pl-4 pr-2">
                      <button
                        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setCollapsed((c) => {
                            const n = new Set(c);
                            if (n.has(sec)) n.delete(sec);
                            else n.add(sec);
                            return n;
                          })
                        }
                        disabled={!s.groups.length}
                      >
                        <ChevronRight className={cn("size-3.5 transition-transform", s.groups.length && !isCollapsed && "rotate-90", !s.groups.length && "opacity-0")} />
                        {SECTION_LABEL[sec]}
                      </button>
                    </td>
                    {s.values.map((v, i) => (
                      <Cell key={i} v={v} className="font-medium" />
                    ))}
                    <Cell v={s.total} className="pr-4 font-semibold" />
                  </tr>
                  {!isCollapsed &&
                    s.groups.map((g) => (
                      <GroupRows key={g.id} group={g} open={detail || openGroups.has(g.id)} onToggle={() => toggleGroup(g.id)} />
                    ))}
                  {sec === "variable_costs" && (
                    <>
                      <SummaryRow label="Margem de contribuição" values={statement.contributionMargin} strong />
                      <tr className="border-b text-[11.5px] text-muted-foreground">
                        <td className="sticky left-0 bg-card py-2 pl-4">Margem de contribuição (%)</td>
                        {statement.contributionMargin.map((v, i) => {
                          const rev = statement.sections.operating_revenue.values[i];
                          return (
                            <td key={i} className="px-2 py-2 text-right tabular">
                              {rev ? formatPercent((v / rev) * 100) : "—"}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 pr-4 text-right tabular">{revenue ? formatPercent((margin / revenue) * 100) : "—"}</td>
                      </tr>
                    </>
                  )}
                  {sec === "fixed_expenses" && <SummaryRow label="Resultado operacional" values={statement.operatingResult} strong />}
                  {sec === "financial_other" && <SummaryRow label="Geração de caixa operacional" values={statement.operatingCashGeneration} strong />}
                </React.Fragment>
              );
            })}
            <SummaryRow label="Variação de caixa" values={statement.cashVariation} strong />
            <tr className="border-b">
              <td className="sticky left-0 bg-card py-2.5 pl-4">Saldo inicial</td>
              {statement.openingBalance.map((v, i) => (
                <Cell key={i} v={v} />
              ))}
              <td />
            </tr>
            <tr className="border-b font-semibold">
              <td className="sticky left-0 bg-card py-2.5 pl-4">Saldo final</td>
              {statement.closingBalance.map((v, i) => (
                <Cell key={i} v={v} />
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t px-5 py-3 text-[12px] text-muted-foreground">
        No período: margem de contribuição <b className="text-foreground">{revenue ? formatPercent((margin / revenue) * 100) : "—"}</b> · resultado operacional{" "}
        <b className="text-foreground">{revenue ? formatPercent((opResult / revenue) * 100) : "—"}</b> da receita. Valores arredondados; passe o mouse para ver o valor completo.
      </p>
    </Card>
  );
}

function SummaryRow({ label, values, strong }: { label: string; values: number[]; strong?: boolean }) {
  return (
    <tr className={cn("border-b", strong && "bg-muted/40 font-semibold")}>
      <td className="sticky left-0 bg-inherit py-2.5 pl-4 pr-2">{label}</td>
      {values.map((v, i) => (
        <Cell key={i} v={v} />
      ))}
      <Cell v={values.reduce((a, b) => a + b, 0)} className="pr-4 font-semibold" />
    </tr>
  );
}

function GroupRows({ group, open, onToggle }: { group: StatementRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b hover:bg-accent/40">
        <td className="sticky left-0 bg-card py-2.5 pl-8 pr-2">
          <button className="flex items-center gap-2 text-left" onClick={onToggle}>
            <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
            <span className="size-2 shrink-0 rounded-full" style={{ background: groupColor(group.color) }} />
            {group.name}
          </button>
        </td>
        {group.values.map((v, i) => (
          <Cell key={i} v={v} />
        ))}
        <Cell v={group.total} className="pr-4 font-medium" />
      </tr>
      {open &&
        group.categories?.map((c, idx) => (
          <tr key={c.id} className="border-b text-muted-foreground animate-row-in" style={{ animationDelay: `${idx * 20}ms` }}>
            <td className="sticky left-0 bg-card py-2 pl-16 pr-2">{c.name}</td>
            {c.values.map((v, i) => (
              <Cell key={i} v={v} />
            ))}
            <Cell v={c.total} className="pr-4" />
          </tr>
        ))}
    </>
  );
}

/* ---------------- Fluxo mensal ---------------- */

type MonthlyMode = "barras" | "linha" | "acumulado";

function MonthlyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-medium">{monthLabel(label, true)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular">{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function MonthlyView({ end, accountIds }: { end: string; accountIds: string[] }) {
  const { data, today } = useFinance();
  const [span, setSpan] = React.useState<"6" | "12" | "24">("12");
  const [mode, setMode] = React.useState<MonthlyMode>("barras");
  const rows = React.useMemo<MonthPoint[]>(() => {
    if (!data) return [];
    const last = endOfMonth(end);
    const first = startOfMonth(addMonths(last, -(Number(span) - 1)));
    return monthlySeries(data, { accountIds }, { start: first, end: last });
  }, [data, end, span, accountIds]);

  const chart = rows.reduce<(MonthPoint & { cumIn: number; cumOut: number; result: number })[]>((acc, r) => {
    const prev = acc.at(-1);
    acc.push({
      ...r,
      cumIn: (prev?.cumIn ?? 0) + r.inflowPaid + r.inflowOpen,
      cumOut: (prev?.cumOut ?? 0) + r.outflowPaid + r.outflowOpen,
      result: r.inflowPaid - r.outflowPaid,
    });
    return acc;
  }, []);
  const thisMonth = today.slice(0, 7);
  const cumulative = rows.reduce<number[]>((acc, r) => [...acc, (acc.at(-1) ?? 0) + r.inflowPaid - r.outflowPaid], []);
  const totals = rows.reduce(
    (t, r) => ({ ip: t.ip + r.inflowPaid, op: t.op + r.outflowPaid, ie: t.ie + r.inflowPaid + r.inflowOpen, oe: t.oe + r.outflowPaid + r.outflowOpen }),
    { ip: 0, op: 0, ie: 0, oe: 0 },
  );
  const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "var(--muted-foreground)" } } as const;

  return (
    <div className="space-y-3">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold">Fluxo mensal</h2>
            <p className="text-[12.5px] text-muted-foreground">Últimos {span} meses · realizado (cor cheia) e em aberto (translúcido) lado a lado</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "barras", label: "Barras", icon: <BarChart3 /> },
                { value: "linha", label: "Linha", icon: <LineIcon /> },
                { value: "acumulado", label: "Acumulado", icon: <AreaIcon /> },
              ]}
            />
            <Segmented value={span} onChange={setSpan} options={[{ value: "6", label: "6m" }, { value: "12", label: "12m" }, { value: "24", label: "24m" }]} />
          </div>
        </div>
        <div className="mt-4 h-[300px]">
          <ResponsiveContainer>
            {mode === "barras" ? (
              <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, Number(span) > 12)} {...axis} />
                <YAxis tickFormatter={formatCompact} width={44} {...axis} />
                <Tooltip content={<MonthlyTooltip />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="inflowPaid" name="Entradas efetuadas" stackId="in" fill="var(--chart-in)" maxBarSize={28} />
                <Bar dataKey="inflowOpen" name="A receber" stackId="in" fill="var(--chart-in)" fillOpacity={0.3} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="outflowPaid" name="Saídas efetuadas" stackId="out" fill="var(--chart-out)" maxBarSize={28} />
                <Bar dataKey="outflowOpen" name="A pagar" stackId="out" fill="var(--chart-out)" fillOpacity={0.3} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            ) : (
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m, Number(span) > 12)} {...axis} />
                <YAxis tickFormatter={formatCompact} width={44} {...axis} />
                <Tooltip content={<MonthlyTooltip />} />
                {mode === "linha" ? (
                  <>
                    <Line dataKey="inflowPaid" name="Entradas efetuadas" stroke="var(--chart-in)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="outflowPaid" name="Saídas efetuadas" stroke="var(--chart-out)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line dataKey="result" name="Resultado" stroke="var(--chart-balance)" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                  </>
                ) : (
                  <>
                    <Line dataKey="cumIn" name="Entradas acumuladas" stroke="var(--chart-in)" strokeWidth={2} dot={false} />
                    <Line dataKey="cumOut" name="Saídas acumuladas" stroke="var(--chart-out)" strokeWidth={2} dot={false} />
                  </>
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-in)]" /> Entradas efetuadas</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-out)]" /> Saídas efetuadas</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-in)] opacity-30" /> A receber</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-out)] opacity-30" /> A pagar</span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="text-[15px] font-semibold">Mês a mês</h2>
          <p className="text-[12.5px] text-muted-foreground">Resultado e acumulado no realizado. Previsto = realizado + em aberto.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <thead>
              <tr className="border-y text-left text-[11.5px] text-muted-foreground">
                <th className="py-2.5 pl-5 font-medium">Mês</th>
                <th className="py-2.5 text-right font-medium">Entradas real.</th>
                <th className="py-2.5 text-right font-medium">Saídas real.</th>
                <th className="py-2.5 text-right font-medium">Entradas prev.</th>
                <th className="py-2.5 text-right font-medium">Saídas prev.</th>
                <th className="py-2.5 text-right font-medium">Resultado</th>
                <th className="py-2.5 text-right font-medium">Acumulado</th>
                <th className="py-2.5 pr-5 text-right font-medium">% realização</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const result = r.inflowPaid - r.outflowPaid;
                const cum = cumulative[idx];
                const expected = r.inflowPaid + r.inflowOpen;
                const future = r.month > thisMonth;
                return (
                  <tr key={r.month} className={cn("border-b", r.month === thisMonth && "bg-brand-soft/50 font-medium", future && "text-muted-foreground")}>
                    <td className="py-2.5 pl-5">{monthLabel(r.month, true)}</td>
                    <td className="py-2.5 text-right tabular">{formatBRL(r.inflowPaid)}</td>
                    <td className="py-2.5 text-right text-destructive-foreground tabular">{formatBRL(r.outflowPaid)}</td>
                    <td className="py-2.5 text-right tabular">{formatBRL(expected)}</td>
                    <td className="py-2.5 text-right tabular">{formatBRL(r.outflowPaid + r.outflowOpen)}</td>
                    <td className={cn("py-2.5 text-right font-medium tabular", result < 0 && "text-destructive-foreground")}>{formatBRL(result)}</td>
                    <td className={cn("py-2.5 text-right tabular", cum < 0 && "text-destructive-foreground")}>{formatBRL(cum)}</td>
                    <td className="py-2.5 pr-5 text-right tabular">{expected ? `${Math.round((r.inflowPaid / expected) * 100)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-semibold">
                <td className="py-3 pl-5">Total</td>
                <td className="py-3 text-right tabular">{formatBRL(totals.ip)}</td>
                <td className="py-3 text-right text-destructive-foreground tabular">{formatBRL(totals.op)}</td>
                <td className="py-3 text-right tabular">{formatBRL(totals.ie)}</td>
                <td className="py-3 text-right tabular">{formatBRL(totals.oe)}</td>
                <td className="py-3 text-right tabular">{formatBRL(totals.ip - totals.op)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Categorias ---------------- */

function CategoriesView({ period, accountIds }: { period: DateRange; accountIds: string[] }) {
  const { data } = useFinance();
  const [kind, setKind] = React.useState<"outflow" | "inflow">("outflow");
  const [top, setTop] = React.useState<"5" | "10" | "all">("5");
  const result = React.useMemo(
    () => (data ? expensesByCategory(data, { accountIds }, period, top === "all" ? 999 : Number(top), kind) : { total: 0, rows: [] }),
    [data, accountIds, period, top, kind],
  );
  const isOut = kind === "outflow";
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{isOut ? "Despesas" : "Receitas"} por categoria</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {formatRange(period.start, period.end)} · Caixa · Realizado · total <b className={cn("tabular", isOut ? "text-destructive-foreground" : "text-success-foreground")}>{formatBRL(result.total)}</b>
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Segmented value={kind} onChange={setKind} options={[{ value: "outflow", label: "Despesas" }, { value: "inflow", label: "Receitas" }]} />
          <Segmented value={top} onChange={setTop} options={[{ value: "5", label: "Top 5" }, { value: "10", label: "Top 10" }, { value: "all", label: "Todas" }]} />
        </div>
      </div>
      <ul className="mt-5 space-y-4">
        {result.rows.map((r, i) => (
          <li key={r.id} className="animate-row-in" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-medium">
                {r.name} <span className="ml-2 text-[12px] font-normal text-muted-foreground">{Math.round(r.share * 100)}%</span>
              </span>
              <span className="font-semibold tabular">{formatBRL(r.amount)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full origin-left rounded-full animate-[bar-grow_0.7s_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{ width: `${(r.amount / (result.rows[0]?.amount || 1)) * 100}%`, background: isOut ? "var(--chart-out)" : "var(--chart-in)", animationDelay: `${i * 40}ms` }}
              />
            </div>
          </li>
        ))}
        {result.rows.length === 0 && <li className="py-10 text-center text-[12.5px] text-muted-foreground">Nada realizado no período.</li>}
      </ul>
    </Card>
  );
}
