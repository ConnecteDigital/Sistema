"use client";

import { AlertTriangle, MapPin, Sparkles, TrendingDown, Trophy, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFinance } from "@/components/finance-provider";
import { KpiCard } from "@/components/kpi";
import { Card, Segmented } from "@/components/ui/primitives";
import { formatBRL, formatCompact, formatDate, monthShort } from "@/lib/format";
import { computeInsights, type Ranked } from "@/lib/insights";
import type { DateRange } from "@/lib/types";
import { cn } from "@/lib/utils";

const PALETTE = ["#e35f20", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#94a3b8"];
const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "var(--muted-foreground)" } } as const;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${monthShort(m - 1).replace(/^./, (c) => c.toUpperCase())}/${String(y).slice(2)}`;
};
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

function Section({ title, subtitle, icon, children, className, actions }: { title: string; subtitle?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {icon && <span className="text-primary [&_svg]:size-4">{icon}</span>}
            {title}
          </h2>
          {subtitle && <p className="text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

function ChartTooltip({ active, payload, label, money = true }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey?: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-lg">
      {label && <div className="mb-1 font-medium">{/^\d{4}-\d{2}$/.test(label) ? monthLabel(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular">{money && p.dataKey !== "clients" ? formatBRL(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Ranking com barra (melhores clientes, cidades). */
function RankList({ rows, limit = 10, color = "var(--primary)", href }: { rows: Ranked[]; limit?: number; color?: string; href?: (r: Ranked) => string | null }) {
  const max = rows[0]?.amount || 1;
  return (
    <ol className="space-y-2.5">
      {rows.slice(0, limit).map((r, i) => {
        const link = href?.(r);
        const label = (
          <span className="truncate" title={r.label}>
            {r.label}
          </span>
        );
        return (
          <li key={r.key} className="animate-row-in" style={{ animationDelay: `${i * 35}ms` }}>
            <div className="flex items-center gap-2 text-[13px]">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded text-[10.5px] font-semibold", i < 3 ? "bg-brand-soft text-brand-foreground" : "bg-muted text-muted-foreground")}>{i + 1}</span>
              {link ? (
                <Link href={link} className="flex min-w-0 flex-1 hover:underline">
                  {label}
                </Link>
              ) : (
                <span className="flex min-w-0 flex-1">{label}</span>
              )}
              <span className="text-[11.5px] text-muted-foreground tabular">{pct(r.share)}</span>
              <span className="w-28 text-right font-semibold tabular">{formatBRL(r.amount)}</span>
            </div>
            <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full origin-left rounded-full animate-[bar-grow_0.7s_cubic-bezier(0.16,1,0.3,1)_both]" style={{ width: `${(r.amount / max) * 100}%`, background: color, animationDelay: `${i * 35}ms` }} />
            </div>
          </li>
        );
      })}
      {rows.length === 0 && <li className="py-6 text-center text-[13px] text-muted-foreground">Nada recebido no período.</li>}
    </ol>
  );
}

export function InsightsView({ period, accountIds }: { period: DateRange; accountIds: string[] }) {
  const { data, today } = useFinance();
  const [placeMode, setPlaceMode] = React.useState<"states" | "cities">("states");
  const ins = React.useMemo(() => (data ? computeInsights(data, { accountIds }, period, today) : null), [data, accountIds, period, today]);
  if (!data || !ins) return null;

  const catName = (key: string) => (key === "outros" ? "Outros" : (ins.categories.find((c) => c.key === key)?.label ?? "Sem categoria"));
  const stackKeys = [...ins.topCategoryKeys, ...(ins.months.some((m) => m.byCategory.outros) ? ["outros"] : [])];
  const serviceRows = ins.months.map((m) => ({ month: m.month, ...Object.fromEntries(stackKeys.map((k) => [k, Math.round((m.byCategory[k] ?? 0) * 100) / 100])) }));
  // Percentuais sobre o que tem local identificado (igual à rosca).
  const placeTotal = ins.states.reduce((s, r) => s + r.amount, 0);
  const placeRows = (placeMode === "states" ? ins.states : ins.cities).map((r) => ({ ...r, share: placeTotal ? (r.amount / placeTotal) * 100 : 0 }));
  const donut = [...ins.states.slice(0, 5), ...(ins.states.length > 5 ? [{ key: "outros", label: "Outros estados", amount: ins.states.slice(5).reduce((s, r) => s + r.amount, 0), count: 0, share: 0 }] : [])];
  const forecastRows = ins.forecast.map((f) => ({ ...f, operating: Math.round((f.inflow - f.costs) * 100) / 100 }));
  const best = ins.months.reduce((a, b) => (b.revenue > a.revenue ? b : a), ins.months[0]);
  // Só meses fechados: o mês corrente ainda está pela metade.
  const closed = ins.months.filter((m) => m.month < today.slice(0, 7));
  const last3 = closed.slice(-3).reduce((s, m) => s + m.revenue, 0) / 3;
  const prev3 = closed.slice(-6, -3).reduce((s, m) => s + m.revenue, 0) / 3;
  const trend = prev3 ? ((last3 - prev3) / prev3) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <KpiCard label="Faturamento recebido" tone="success" amount={ins.revenue} sub="Entradas pagas no período" />
        <KpiCard label="Clientes que pagaram" tone="info" icon={<Users />} value={String(ins.activeClients)} sub={`${ins.newClients.length} novos no período`} />
        <KpiCard label="Ticket médio" tone="neutral" amount={ins.avgTicket} sub="Por cliente, por mês" />
        <KpiCard
          label="Tendência"
          tone={trend >= 0 ? "success" : "danger"}
          icon={trend >= 0 ? <Sparkles /> : <TrendingDown />}
          value={`${trend >= 0 ? "+" : ""}${pct(trend)}`}
          sub="3 últimos meses fechados × 3 anteriores"
        />
        <KpiCard
          label="Dependência dos 5 maiores"
          tone={ins.top5Share > 50 ? "warning" : "neutral"}
          icon={<AlertTriangle />}
          value={pct(ins.top5Share)}
          sub={ins.top5Share > 50 ? "Metade do faturamento em 5 clientes" : "Faturamento bem distribuído"}
        />
      </div>

      <Section
        title="Faturamento e clientes"
        icon={<Sparkles />}
        subtitle={
          <>
            12 meses até {monthLabel(ins.months.at(-1)?.month ?? period.end.slice(0, 7))} · melhor mês: <b className="text-foreground">{best ? `${monthLabel(best.month)} (${formatBRL(best.revenue)})` : "—"}</b>
          </>
        }
      >
        <div className="h-[280px]">
          <ResponsiveContainer>
            <ComposedChart data={ins.months} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis yAxisId="money" tickFormatter={formatCompact} width={44} {...axis} />
              <YAxis yAxisId="count" orientation="right" width={28} allowDecimals={false} {...axis} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Bar yAxisId="money" dataKey="revenue" name="Faturamento" fill="var(--chart-in)" radius={[4, 4, 0, 0]} maxBarSize={34} />
              <Bar yAxisId="money" dataKey="withdrawals" name="Retiradas e reserva" fill="#8b5cf6" fillOpacity={0.55} radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Line yAxisId="money" dataKey="costs" name="Custos da operação" stroke="var(--chart-out)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              <Line yAxisId="count" dataKey="clients" name="Clientes que pagaram" stroke="var(--chart-balance)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-in)]" /> Faturamento</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[var(--chart-out)]" /> Custos da operação</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#8b5cf6] opacity-60" /> Retiradas de lucro, empréstimos e investimentos (não é custo)</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--chart-balance)]" /> Clientes que pagaram (eixo da direita)</span>
        </div>
      </Section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Section title="Melhores clientes" icon={<Trophy />} subtitle={`Quem mais pagou no período · ${ins.activeClients} clientes`}>
          <RankList rows={ins.clients} href={(r) => (r.key !== "-" ? `/movimentos?contato=${r.key}` : null)} />
          {ins.newClients.length > 0 && (
            <div className="mt-4 border-t pt-3 text-[12.5px]">
              <span className="font-medium">Novos no período: </span>
              <span className="text-muted-foreground">{ins.newClients.slice(0, 8).map((c) => c.label).join(" · ")}{ins.newClients.length > 8 ? ` e mais ${ins.newClients.length - 8}` : ""}</span>
            </div>
          )}
        </Section>

        <Section
          title="De onde vem o dinheiro"
          icon={<MapPin />}
          subtitle="Faturamento por região do cliente"
          actions={<Segmented value={placeMode} onChange={setPlaceMode} options={[{ value: "states", label: "Estados" }, { value: "cities", label: "Cidades" }]} />}
        >
          {placeMode === "states" && donut.length > 0 && (
            <div className="mb-4 flex items-center gap-4">
              <div className="size-[140px] shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donut} dataKey="amount" nameKey="label" innerRadius={42} outerRadius={66} paddingAngle={2} stroke="none">
                      {donut.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5 text-[12.5px]">
                {donut.map((d, i) => (
                  <li key={d.key} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="flex-1 truncate">{d.label}</span>
                    <span className="text-muted-foreground tabular">{pct(placeTotal ? (d.amount / placeTotal) * 100 : 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <RankList rows={placeRows} limit={placeMode === "states" ? 8 : 10} color="#3b82f6" />
          {ins.unknownPlace > 0 && (
            <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
              <b className="text-foreground tabular">{formatBRL(ins.unknownPlace)}</b> vieram de clientes sem cidade identificada. A cidade sai do endereço do cadastro ou do nome (ex.: “Chaveiro X (Curitiba)”) —{" "}
              <Link href="/contatos" className="font-medium text-primary hover:underline">
                completar cadastros
              </Link>
              .
            </p>
          )}
        </Section>
      </div>

      <Section title="Receita por serviço" icon={<Sparkles />} subtitle="Quanto cada tipo de serviço trouxe, mês a mês (12 meses)">
        <div className="h-[280px]">
          <ResponsiveContainer>
            <BarChart data={serviceRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
              <YAxis tickFormatter={formatCompact} width={44} {...axis} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} formatter={(v) => <span className="text-muted-foreground">{v}</span>} />
              {stackKeys.map((k, i) => (
                <Bar key={k} dataKey={k} name={catName(k)} stackId="s" fill={PALETTE[i % PALETTE.length]} maxBarSize={34} radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Section title="Clientes que pararam de pagar" icon={<TrendingDown />} subtitle="Pagavam com frequência e não pagam há mais de 45 dias">
          {ins.atRisk.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Nenhum cliente sumido. 👏</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b text-left text-[11.5px] text-muted-foreground">
                  <th className="pb-2 font-normal">Cliente</th>
                  <th className="pb-2 font-normal">Último pagamento</th>
                  <th className="pb-2 text-right font-normal">Pagava/mês</th>
                </tr>
              </thead>
              <tbody>
                {ins.atRisk.slice(0, 10).map((r) => (
                  <tr key={r.contact.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <Link href={`/movimentos?contato=${r.contact.id}`} className="font-medium hover:underline">
                        {r.contact.name}
                      </Link>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {formatDate(r.lastPaid)} <span className={cn("ml-1 rounded px-1 text-[10.5px] font-medium", r.days > 90 ? "bg-destructive-soft text-destructive-foreground" : "bg-warning-soft text-warning-foreground")}>{r.days} dias</span>
                    </td>
                    <td className="py-2 text-right font-medium tabular">{formatBRL(r.monthly)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Quem está devendo" icon={<AlertTriangle />} subtitle={<>Recebimentos vencidos e não pagos · total <b className="text-destructive-foreground tabular">{formatBRL(ins.overdueTotal)}</b></>}>
          {ins.overdue.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Ninguém em atraso. 👏</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b text-left text-[11.5px] text-muted-foreground">
                  <th className="pb-2 font-normal">Cliente</th>
                  <th className="pb-2 font-normal">Desde</th>
                  <th className="pb-2 text-right font-normal">Em atraso</th>
                </tr>
              </thead>
              <tbody>
                {ins.overdue.slice(0, 10).map((r) => (
                  <tr key={r.label} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {r.contact ? (
                        <Link href={`/movimentos?contato=${r.contact.id}`} className="font-medium hover:underline">
                          {r.label}
                        </Link>
                      ) : (
                        r.label
                      )}
                      {r.count > 1 && <span className="ml-1 text-[11px] text-muted-foreground">({r.count} parcelas)</span>}
                    </td>
                    <td className="py-2 text-muted-foreground">{formatDate(r.oldest)}</td>
                    <td className="py-2 text-right font-medium text-destructive-foreground tabular">{formatBRL(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section
        title="Próximos 3 meses"
        icon={<Sparkles />}
        subtitle="O que já está lançado em aberto e quanto vai sobrar em cada conta — partindo do saldo de hoje, que inclui o que já foi guardado"
      >
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={forecastRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
                <YAxis tickFormatter={formatCompact} width={44} {...axis} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} formatter={(v) => <span className="text-muted-foreground">{v}</span>} />
                <Bar dataKey="inflow" name="A receber" fill="var(--chart-in)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="costs" name="Custos da operação" fill="var(--chart-out)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="withdrawals" name="Retiradas e reserva" fill="#8b5cf6" fillOpacity={0.7} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2 text-[12.5px]">
            {forecastRows.map((f) => (
              <li key={f.month} className="rounded-lg border px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold">{monthLabel(f.month)}</span>
                  <span className="text-muted-foreground">
                    saldo no fim do mês <b className={cn("text-[13px] tabular", f.balance < 0 ? "text-destructive-foreground" : "text-foreground")}>{formatBRL(f.balance)}</b>
                  </span>
                </div>
                <div className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {f.balances.map((b) => (
                    <div key={b.accountId} className="flex justify-between">
                      <span>{b.name}</span>
                      <span className={cn("tabular", b.balance < 0 && "text-destructive-foreground")}>{formatBRL(b.balance)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t pt-1">
                    <span>Operação (recebe − custos)</span>
                    <span className={cn("font-medium tabular", f.operating < 0 ? "text-destructive-foreground" : "text-success-foreground")}>
                      {f.operating >= 0 ? "+" : ""}
                      {formatBRL(f.operating)}
                    </span>
                  </div>
                  {f.withdrawals > 0 && (
                    <div className="flex justify-between">
                      <span>Retiradas e reserva</span>
                      <span className="tabular">−{formatBRL(f.withdrawals)}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  );
}
