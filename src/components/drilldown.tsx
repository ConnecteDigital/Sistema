"use client";

import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/primitives";
import { eachDay } from "@/lib/dates";
import { formatBRL, formatCompact } from "@/lib/format";
import type { DateRange, Movement, MovementType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinance } from "./finance-provider";

const ddmm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

function DayTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-medium">{ddmm(label)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color, opacity: p.name === "Em aberto" ? 0.45 : 1 }} />
            {p.name}
          </span>
          <span className="font-medium tabular">{formatBRL(p.value)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t pt-1 font-medium">
        <span>Total</span>
        <span className="tabular">{formatBRL(total)}</span>
      </div>
    </div>
  );
}

/** Gráfico "Faturamento por dia" / "Despesas por dia" com efetuado + em aberto empilhados. */
export function DailyBreakdown({ type, movements, range, today, title }: { type: MovementType; movements: Movement[]; range: DateRange; today: string; title: string }) {
  const color = type === "inflow" ? "var(--chart-in)" : "var(--chart-out)";
  const days = React.useMemo(() => {
    const map = new Map(eachDay(range).map((d) => [d, { date: d, paid: 0, open: 0 }]));
    for (const m of movements) {
      const row = map.get(m.date);
      if (!row) continue;
      if (m.paid) row.paid += m.amount;
      else row.open += m.amount;
    }
    return [...map.values()];
  }, [movements, range]);
  const total = days.reduce((s, d) => s + d.paid + d.open, 0);
  const max = days.reduce((a, d) => (d.paid + d.open > a.paid + a.open ? d : a), days[0] ?? { date: range.start, paid: 0, open: 0 });
  const ticks = days.filter((_, i) => i % 3 === 0 || i === days.length - 1).map((d) => d.date);
  const axis = { tickLine: false, axisLine: false, tick: { fontSize: 10.5, fill: "var(--muted-foreground)" } } as const;
  return (
    <Card className="p-5 animate-pop-in">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="text-[12.5px] text-muted-foreground">Distribuição diária no período</p>
        </div>
        <span title="Cor cheia: já baixado. Translúcido: ainda em aberto.">
          <HelpCircle className="size-4 text-muted-foreground" />
        </span>
      </div>
      <div className="mt-3 h-[230px]">
        <ResponsiveContainer>
          <BarChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" ticks={ticks} interval={0} tickFormatter={ddmm} {...axis} />
            <YAxis tickFormatter={formatCompact} width={40} {...axis} />
            <Tooltip content={<DayTooltip />} cursor={{ fill: "var(--muted)" }} />
            {days.some((d) => d.date === today) && <ReferenceLine x={today} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
            <Bar dataKey="paid" name="Efetuado" stackId="d" fill={color} maxBarSize={18} />
            <Bar dataKey="open" name="Em aberto" stackId="d" fill={color} fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: color }} /> Efetuado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full opacity-40" style={{ background: color }} /> Em aberto
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4 border-t pt-3">
        <div>
          <div className="text-[11.5px] text-muted-foreground">Total no período</div>
          <div className="text-[13px] font-semibold tabular">{formatBRL(total)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted-foreground">Média por dia</div>
          <div className="text-[13px] font-semibold tabular">{formatBRL(days.length ? total / days.length : 0)}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted-foreground">Maior dia · {ddmm(max.date)}</div>
          <div className="text-[13px] font-semibold tabular">{formatBRL(max.paid + max.open)}</div>
        </div>
      </div>
    </Card>
  );
}

/** Ranking com barras (por cliente/fornecedor ou por categoria), paginado. */
export function RankingCard({ title, subtitle, rows, type, pageSize = 8 }: { title: string; subtitle?: string; rows: { key: string; name: string; amount: number }[]; type: MovementType; pageSize?: number }) {
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const top = rows[0]?.amount || 1;
  const color = type === "inflow" ? "var(--chart-in)" : "var(--chart-out)";
  return (
    <Card className="flex flex-col p-5 animate-pop-in">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle} · {formatBRL(rows.reduce((t, r) => t + r.amount, 0))}</p>}
      <ul key={page} className="mt-4 flex-1 space-y-3.5">
        {visible.map((r, i) => (
          <li key={r.key} className="animate-row-in" style={{ animationDelay: `${i * 35}ms` }}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-medium">{r.name}</span>
              <span className="shrink-0 font-semibold tabular">{formatBRL(r.amount)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full origin-left rounded-full animate-[bar-grow_0.7s_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{ width: `${(r.amount / top) * 100}%`, background: color, animationDelay: `${i * 35}ms` }}
              />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="py-8 text-center text-[12.5px] text-muted-foreground">Nada no período.</li>}
      </ul>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            {page * pageSize + 1}–{Math.min(rows.length, page * pageSize + pageSize)} de {rows.length}
          </span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className={cn("rounded p-1 hover:bg-accent", page === 0 && "opacity-40")} aria-label="Anterior">
              <ChevronLeft className="size-4" />
            </button>
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className={cn("rounded p-1 hover:bg-accent", page >= pages - 1 && "opacity-40")} aria-label="Próxima">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Soma por chave (contato ou categoria), do maior para o menor. */
export function useRankings(movements: Movement[]) {
  const { data } = useFinance();
  return React.useMemo(() => {
    const contact = new Map(data?.contacts.map((c) => [c.id, c.name]) ?? []);
    const category = new Map(data?.categories.map((c) => [c.id, c.name]) ?? []);
    const group = (keyOf: (m: Movement) => string | null, nameOf: (k: string) => string | undefined, none: string) => {
      const totals = new Map<string, number>();
      for (const m of movements) {
        const k = keyOf(m) ?? "none";
        totals.set(k, (totals.get(k) ?? 0) + m.amount);
      }
      return [...totals.entries()]
        .map(([key, amount]) => ({ key, name: key === "none" ? none : nameOf(key) ?? none, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount);
    };
    return {
      byContact: group((m) => m.contactId, (k) => contact.get(k), "Sem vínculo"),
      byCategory: group((m) => m.categoryId, (k) => category.get(k), "Sem categoria"),
    };
  }, [movements, data]);
}
