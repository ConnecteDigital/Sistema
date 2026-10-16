"use client";

import { AreaChart as AreaIcon, BarChart3, HelpCircle, LineChart as LineIcon, TrendingUp } from "lucide-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Segmented } from "@/components/ui/primitives";
import type { DailyPoint } from "@/lib/finance";
import { formatBRL, formatCompact, formatDayMonth } from "@/lib/format";
import type { ISODate } from "@/lib/types";

export type ChartMode = "saldo" | "linha" | "barras" | "acumulado";

export const CHART_MODES = [
  { value: "saldo" as const, label: "Saldo", icon: <AreaIcon /> },
  { value: "linha" as const, label: "Linha", icon: <LineIcon /> },
  { value: "barras" as const, label: "Barras", icon: <BarChart3 /> },
  { value: "acumulado" as const, label: "Acumulado", icon: <TrendingUp /> },
];

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 10.5, fill: "var(--muted-foreground)" },
} as const;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 font-medium">{formatDayMonth(label)}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
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

/** Gráfico do card "Fluxo de caixa" (painel e extrato). */
export function CashflowChart({ points, mode, today, height = 260 }: { points: DailyPoint[]; mode: ChartMode; today: ISODate; height?: number }) {
  const showToday = points.some((p) => p.date === today);
  const data = React.useMemo(() => {
    const out: (DailyPoint & { cumIn: number; cumOut: number })[] = [];
    for (const p of points) {
      const prev = out.at(-1);
      const cumIn = Math.round(((prev?.cumIn ?? 0) + p.inflow) * 100) / 100;
      const cumOut = Math.round(((prev?.cumOut ?? 0) + p.outflow) * 100) / 100;
      out.push({ ...p, cumIn, cumOut });
    }
    return out;
  }, [points]);
  const ticks = data.filter((_, i) => i % 4 === 0 || i === data.length - 1).map((p) => p.date);
  const x = <XAxis dataKey="date" ticks={ticks} tickFormatter={formatDayMonth} {...axisProps} interval={0} />;
  const y = <YAxis tickFormatter={formatCompact} width={44} {...axisProps} />;
  const grid = <CartesianGrid vertical={false} stroke="var(--border)" />;
  const todayLine = showToday && (
    <ReferenceLine x={today} stroke="var(--muted-foreground)" strokeDasharray="3 3" label={{ value: "hoje", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />
  );
  const tooltip = <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ring)", strokeDasharray: "3 3" }} />;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        {mode === "saldo" ? (
          <AreaChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-in)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--chart-in)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {grid}
            {x}
            {y}
            {tooltip}
            {todayLine}
            <Area type="monotone" dataKey="balance" name="Saldo em caixa" stroke="var(--chart-in)" strokeWidth={2} fill="url(#saldoFill)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        ) : mode === "barras" ? (
          <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barGap={2}>
            {grid}
            {x}
            {y}
            {tooltip}
            {todayLine}
            <Bar dataKey="inflow" name="Entradas" fill="var(--chart-in)" radius={[3, 3, 0, 0]} maxBarSize={10} />
            <Bar dataKey="outflow" name="Saídas" fill="var(--chart-out)" radius={[3, 3, 0, 0]} maxBarSize={10} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            {grid}
            {x}
            {y}
            {tooltip}
            {todayLine}
            <Line type="monotone" dataKey={mode === "acumulado" ? "cumIn" : "inflow"} name="Entradas" stroke="var(--chart-in)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey={mode === "acumulado" ? "cumOut" : "outflow"} name="Saídas" stroke="var(--chart-out)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ mode }: { mode: ChartMode }) {
  return (
    <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
      {mode === "saldo" ? (
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-[var(--chart-in)]" /> Saldo em caixa (só o que foi baixado)
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[var(--chart-in)]" /> Entradas {mode === "acumulado" && "acumuladas"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[var(--chart-out)]" /> Saídas {mode === "acumulado" && "acumuladas"}
          </span>
        </>
      )}
      <span className="flex items-center gap-1.5">
        <span className="w-3 border-t border-dashed border-muted-foreground" /> Hoje
      </span>
    </div>
  );
}

export function ChartModeSwitch({ value, onChange }: { value: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Segmented value={value} onChange={onChange} options={CHART_MODES} />
      <span title="Saldo considera só o que foi baixado. Linha, Barras e Acumulado mostram entradas e saídas baixadas por dia.">
        <HelpCircle className="size-4 text-muted-foreground" />
      </span>
    </div>
  );
}
