"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { useMovementDialog } from "@/components/movement-dialog";
import { PageHeader } from "@/components/page-header";
import { RecurrenceDialog } from "@/components/recurrence-dialog";
import { Button } from "@/components/ui/button";
import { Badge, Card, CountPill, UnderlineTabs } from "@/components/ui/primitives";
import { addMonths, startOfMonth } from "@/lib/dates";
import { formatBRL, formatCompact, formatDate, monthShort } from "@/lib/format";
import { PERIOD_LABEL, recurrenceSummary, seriesStats, type SeriesStats, type SeriesStatus } from "@/lib/recurrence";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
type TabKey = "all" | "live" | "overdue" | "completed" | "canceled";
type SortKey = "next" | "amount" | "monthly" | "future";

const STATUS_BADGE: Record<SeriesStatus, { tone: "success" | "danger" | "neutral" | "info"; label: string }> = {
  active: { tone: "success", label: "Ativa" },
  overdue: { tone: "danger", label: "Em atraso" },
  completed: { tone: "info", label: "Concluída" },
  canceled: { tone: "neutral", label: "Cancelada" },
};

function inDays(n: number | null) {
  if (n === null) return "";
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  return `em ${n} dias`;
}

export default function RecorrenciasPage() {
  const { data, error, today } = useFinance();
  const { open } = useMovementDialog();
  const [tab, setTab] = React.useState<TabKey>("live");
  const [type, setType] = React.useState<"all" | "inflow" | "outflow">("all");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "next", dir: "asc" });
  const [page, setPage] = React.useState(0);
  const [editing, setEditing] = React.useState<SeriesStats | null>(null);

  const stats = React.useMemo(() => (data && today ? seriesStats(data, today) : []), [data, today]);
  const summary = React.useMemo(() => recurrenceSummary(stats), [stats]);
  const lookups = React.useMemo(
    () => ({
      contact: new Map(data?.contacts.map((c) => [c.id, c.name]) ?? []),
      category: new Map(data?.categories.map((c) => [c.id, c.name]) ?? []),
    }),
    [data],
  );

  const counts = React.useMemo(() => {
    const c = { all: stats.length, live: 0, overdue: 0, completed: 0, canceled: 0 };
    for (const s of stats) {
      if (s.status === "active" || s.status === "overdue") c.live++;
      if (s.status === "overdue") c.overdue++;
      if (s.status === "completed") c.completed++;
      if (s.status === "canceled") c.canceled++;
    }
    return c;
  }, [stats]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = stats.filter((s) => {
      if (tab === "live" && !(s.status === "active" || s.status === "overdue")) return false;
      if (tab === "overdue" && s.status !== "overdue") return false;
      if (tab === "completed" && s.status !== "completed") return false;
      if (tab === "canceled" && s.status !== "canceled") return false;
      if (type !== "all" && s.recurrence.type !== type) return false;
      if (q) {
        const hay = [s.recurrence.description, lookups.contact.get(s.recurrence.contactId ?? ""), lookups.category.get(s.recurrence.categoryId ?? "")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sort.key === "next") return ((a.next?.date ?? "9999") < (b.next?.date ?? "9999") ? -1 : (a.next?.date ?? "9999") > (b.next?.date ?? "9999") ? 1 : 0) * dir;
      if (sort.key === "amount") return (a.recurrence.amount - b.recurrence.amount) * dir;
      if (sort.key === "monthly") return (a.monthly - b.monthly) * dir;
      return (a.openFuture - b.openFuture) * dir;
    });
  }, [stats, tab, type, query, sort, lookups]);

  if (!data || !today) return <LoadingState error={error} />;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const signed = (s: SeriesStats, v: number) => (s.recurrence.type === "inflow" ? v : -v);
  const totalMonthly = rows.reduce((t, s) => t + signed(s, s.monthly), 0);
  const totalFuture = rows.reduce((t, s) => t + signed(s, s.openFuture), 0);
  const horizon = summary.horizon ? `${summary.horizon.slice(5, 7)}/${summary.horizon.slice(0, 4)}` : "";

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "next" ? "asc" : "desc" }));
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="O que se"
        accent="repete"
        description="Aluguel, salário, assinatura, mensalidade — o compromisso que volta todo mês e sustenta o seu caixa."
        actions={
          <Button variant="primary" size="md" onClick={() => open({ kind: "inflow", recurring: true })}>
            <Plus /> Nova recorrência
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HeroCard
          label="Resultado recorrente / mês"
          amount={summary.result}
          sub={summary.coverage ? `Cobertura · ${Math.round(summary.coverage * 100)}% do custo fixo` : "Sem saídas recorrentes"}
        />
        <KpiCard
          label="Entradas recorrentes / mês"
          tone="success"
          amount={summary.inflowMonthly}
          sub={`${summary.inflowSeries} séries em vigor`}
          active={type === "inflow"}
          dimmed={type === "outflow"}
          onClick={() => {
            setType((t) => (t === "inflow" ? "all" : "inflow"));
            setPage(0);
          }}
        />
        <KpiCard
          label="Saídas recorrentes / mês"
          tone="danger"
          amount={summary.outflowMonthly}
          sub={`${summary.outflowSeries} séries em vigor`}
          active={type === "outflow"}
          dimmed={type === "inflow"}
          onClick={() => {
            setType((t) => (t === "outflow" ? "all" : "outflow"));
            setPage(0);
          }}
        />
        <KpiCard
          label={`Saldo a vencer${horizon ? ` · até ${horizon}` : ""}`}
          tone="info"
          amount={summary.receivable - summary.payable}
          sub={`${formatBRL(summary.receivable)} a receber · ${formatBRL(summary.payable)} a pagar`}
        />
        <KpiCard
          label="Em atraso"
          tone="warning"
          amount={summary.overdueAmount}
          sub={`${summary.overdueCount} ${summary.overdueCount === 1 ? "vencido" : "vencidos"} até hoje`}
          active={tab === "overdue"}
          onClick={() => {
            setTab((t) => (t === "overdue" ? "live" : "overdue"));
            setPage(0);
          }}
        />
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar descrição, contato…"
              className="h-7 w-full rounded-[7px] border bg-card pl-8 pr-7 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-muted-foreground" aria-label="Limpar busca">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {type !== "all" && (
            <button onClick={() => setType("all")} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-medium text-brand-foreground">
              {type === "inflow" ? "Só entradas" : "Só saídas"} <X className="size-3" />
            </button>
          )}
        </div>
        <div className="mt-2 px-4">
          <UnderlineTabs
            value={tab}
            onChange={(t) => {
              setTab(t);
              setPage(0);
            }}
            options={[
              { value: "all", label: <>Todas <CountPill>{counts.all}</CountPill></> },
              { value: "live", label: <>Ativas <CountPill tone="success">{counts.live}</CountPill></> },
              { value: "overdue", label: <>Em atraso <CountPill tone="danger">{counts.overdue}</CountPill></> },
              { value: "completed", label: <>Concluídas <CountPill>{counts.completed}</CountPill></> },
              { value: "canceled", label: <>Canceladas <CountPill>{counts.canceled}</CountPill></> },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table key={`${tab}-${type}`} className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="py-2.5 pl-4 font-medium">Recorrência</th>
                <th className="py-2.5 font-medium">Repetição</th>
                <th className="py-2.5 font-medium">Andamento</th>
                <th className="py-2.5 font-medium">
                  <SortBtn k="next" sort={sort} onToggle={toggleSort}>Próximo</SortBtn>
                </th>
                <th className="py-2.5 text-right font-medium">
                  <SortBtn k="amount" sort={sort} onToggle={toggleSort} right>Valor</SortBtn>
                </th>
                <th className="py-2.5 text-right font-medium">
                  <SortBtn k="monthly" sort={sort} onToggle={toggleSort} right>Por mês</SortBtn>
                </th>
                <th className="py-2.5 text-right font-medium">
                  <SortBtn k="future" sort={sort} onToggle={toggleSort} right>A vencer</SortBtn>
                </th>
                <th className="py-2.5 pl-6 pr-4 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => {
                const r = s.recurrence;
                const isIn = r.type === "inflow";
                const badge = STATUS_BADGE[s.status];
                const sub = [lookups.category.get(r.categoryId ?? ""), lookups.contact.get(r.contactId ?? "")].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={r.id}
                    onClick={() => setEditing(s)}
                    style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}
                    className="group cursor-pointer border-b transition-colors animate-row-in hover:bg-accent/60"
                  >
                    <td className="max-w-[320px] py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("h-8 w-1 shrink-0 rounded-full", isIn ? "bg-success" : "bg-destructive")} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{r.description || "—"}</div>
                          {sub && <div className="truncate text-[11.5px] text-muted-foreground">{sub}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className="rounded border px-1.5 py-0.5 text-[11px]">
                        {PERIOD_LABEL[r.period]} · {r.quantity ? `${r.quantity}x` : "fixa"}
                      </span>
                    </td>
                    <td className="py-2.5 text-[12.5px]">
                      {s.launched} lançado{s.launched === 1 ? "" : "s"}
                      {r.quantity ? <span className="text-muted-foreground"> de {r.quantity}</span> : null}
                    </td>
                    <td className="py-2.5">
                      {s.next ? (
                        <>
                          <div className="tabular">{formatDate(s.next.date)}</div>
                          <div className={cn("text-[11px]", (s.daysToNext ?? 99) <= 3 ? "font-medium text-brand-foreground" : "text-muted-foreground")}>{inDays(s.daysToNext)}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={cn("py-2.5 text-right font-semibold tabular", isIn ? "text-success-foreground" : "text-destructive-foreground")}>{formatBRL(r.amount)}</td>
                    <td className="py-2.5 text-right text-muted-foreground tabular">{formatBRL(s.monthly)}</td>
                    <td className="py-2.5 text-right font-medium tabular">{formatBRL(s.openFuture)}</td>
                    <td className="py-2.5 pl-6 pr-4">
                      <Badge tone={badge.tone} dot>
                        {badge.label}
                        {s.status === "overdue" ? ` · ${s.overdue.length}` : ""}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[13px] text-muted-foreground">
                    Nenhuma recorrência aqui.
                  </td>
                </tr>
              )}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td colSpan={5} className="py-3 pl-4">
                    Total das séries do filtro
                  </td>
                  <td className={cn("py-3 text-right tabular", totalMonthly < 0 && "text-destructive-foreground")}>{formatBRL(totalMonthly)}</td>
                  <td className={cn("py-3 text-right tabular", totalFuture < 0 && "text-destructive-foreground")}>{formatBRL(totalFuture)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-muted-foreground">
          <span>
            {rows.length} série{rows.length === 1 ? "" : "s"}
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <Button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft /> Anterior
              </Button>
              <span className="tabular">
                {safePage + 1} de {pages}
              </span>
              <Button disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
                Próxima <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </Card>

      <NextMonthsChart stats={stats} today={today} />

      {editing && <RecurrenceDialog stats={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SortBtn({
  k,
  sort,
  onToggle,
  children,
  right,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onToggle: (k: SortKey) => void;
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <button className={cn("inline-flex items-center gap-1 hover:text-foreground", right && "flex-row-reverse")} onClick={() => onToggle(k)}>
      {children}
      {sort.key !== k ? <ArrowUpDown className="size-3 opacity-40" /> : sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
    </button>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string; fillOpacity?: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const [y, m] = label.split("-").map(Number);
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-medium capitalize">
        {monthShort(m - 1)}/{String(y).slice(2)}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-medium tabular">{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function NextMonthsChart({ stats, today }: { stats: SeriesStats[]; today: string }) {
  const months = React.useMemo(() => {
    const start = startOfMonth(today);
    const list = Array.from({ length: 12 }, (_, i) => ({ month: addMonths(start, i).slice(0, 7), inPaid: 0, inOpen: 0, outPaid: 0, outOpen: 0 }));
    const idx = new Map(list.map((m, i) => [m.month, i]));
    for (const s of stats) {
      if (s.status === "canceled") continue;
      for (const m of s.movements) {
        const i = idx.get(m.date.slice(0, 7));
        if (i === undefined) continue;
        const row = list[i];
        const key = m.type === "inflow" ? (m.paid ? "inPaid" : "inOpen") : m.paid ? "outPaid" : "outOpen";
        row[key] += m.amount;
      }
    }
    return list;
  }, [stats, today]);
  const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "var(--muted-foreground)" } } as const;
  const label = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return `${monthShort(m - 1)}/${String(y).slice(2)}`;
  };
  return (
    <Card className="mt-3 p-5">
      <h2 className="text-[15px] font-semibold">Os próximos 12 meses</h2>
      <p className="text-[12.5px] text-muted-foreground">Só o que vem de recorrência, mês a mês — em cor cheia o que já foi quitado, translúcido o que está em aberto.</p>
      <div className="mt-4 h-[280px]">
        <ResponsiveContainer>
          <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickFormatter={label} {...axis} />
            <YAxis tickFormatter={formatCompact} width={44} {...axis} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="inPaid" name="Entradas efetuadas" stackId="in" fill="var(--chart-in)" maxBarSize={28} />
            <Bar dataKey="inOpen" name="A receber" stackId="in" fill="var(--chart-in)" fillOpacity={0.3} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="outPaid" name="Saídas efetuadas" stackId="out" fill="var(--chart-out)" maxBarSize={28} />
            <Bar dataKey="outOpen" name="A pagar" stackId="out" fill="var(--chart-out)" fillOpacity={0.3} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-in)]" /> Entradas efetuadas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-out)]" /> Saídas efetuadas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-in)] opacity-30" /> A receber</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-out)] opacity-30" /> A pagar</span>
      </div>
    </Card>
  );
}
