"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ChartLegend, ChartModeSwitch, CashflowChart, type ChartMode } from "@/components/cashflow-chart";
import { AccountAvatar } from "@/components/avatars";
import { AccountFilter, PeriodPicker } from "@/components/filters";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LedgerPanel } from "@/components/ledger-panel";
import { TransfersPanel } from "@/components/transfers-panel";
import { useMovementDialog } from "@/components/movement-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, Checkbox } from "@/components/ui/primitives";
import { accountBalances, balanceAt, dailyBalances, movementsIn, periodSummary, transfersIn } from "@/lib/finance";
import { formatBRL, formatDayMonth, formatRange, greeting } from "@/lib/format";
import { addDays } from "@/lib/dates";
import { LoadingState } from "@/components/loading-state";

type Focus = null | "inflow" | "outflow" | "transfer" | "overdue";

const FOCUS_LABEL: Record<Exclude<Focus, null>, string> = {
  inflow: "Recebidos",
  outflow: "Despesas",
  transfer: "Transferências",
  overdue: "Vencidos",
};

export default function PainelPage() {
  const { data, error, today, range, accountIds, setAccountIds } = useFinance();
  const { open } = useMovementDialog();
  const [mode, setMode] = React.useState<ChartMode>("saldo");
  const [focus, setFocus] = React.useState<Focus>(null);
  const pick = (f: Exclude<Focus, null>) => {
    const next = focus === f ? null : f;
    setFocus(next);
    if (next === "inflow" || next === "outflow") setMode("barras");
    else if (focus === "inflow" || focus === "outflow") setMode("saldo");
  };

  const computed = React.useMemo(() => {
    if (!data) return null;
    const s = { accountIds };
    const points = dailyBalances(data, s, range);
    const minPoint = points.reduce((a, b) => (b.balance < a.balance ? b : a), points[0]);
    const ms = movementsIn(data, s, range);
    return {
      summary: periodSummary(data, s, range, today),
      startBalance: balanceAt(data, s, addDays(range.start, -1)),
      balances: accountBalances(data),
      points,
      minPoint,
      inflows: ms.filter((m) => m.type === "inflow"),
      outflows: ms.filter((m) => m.type === "outflow"),
      transfers: transfersIn(data, s, range).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [data, accountIds, range, today]);

  if (!data || !computed) return <LoadingState error={error} />;
  const { summary, balances, points, minPoint, startBalance } = computed;
  const accounts = [...data.accounts].sort((a, b) => a.position - b.position);
  const selected = accountIds.length ? accountIds : accounts.map((a) => a.id);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    if (next.length) setAccountIds(next.length === accounts.length ? [] : next);
  };
  const selectedTotal = accounts.filter((a) => selected.includes(a.id)).reduce((s, a) => s + (balances[a.id] ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={`Painel · ${formatRange(range.start, range.end)}`}
        title={`${greeting()},`}
        accent={`${(process.env.NEXT_PUBLIC_USER_NAME ?? "Gabriel").toUpperCase()}.`}
        description="Veja o resumo do seu fluxo de caixa."
        actions={
          <>
            <AccountFilter />
            <PeriodPicker />
            <Button variant="primary" size="md" onClick={() => open({ kind: "inflow" })}>
              <Plus /> Novo lançamento
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HeroCard
          label="Saldo atual"
          amount={summary.current}
          sub={`Projeção · ${formatBRL(summary.projection)}`}
          dimmed={focus !== null}
          onClick={focus ? () => setFocus(null) : undefined}
        />
        <KpiCard
          label="Recebidos"
          tone="success"
          amount={summary.received}
          sub={`A receber · ${formatBRL(summary.openInflows)}`}
          active={focus === "inflow"}
          dimmed={focus !== null && focus !== "inflow"}
          onClick={() => pick("inflow")}
        />
        <KpiCard
          label="Despesas"
          tone="danger"
          amount={summary.spent}
          sub={`A pagar · ${formatBRL(summary.openOutflows)}`}
          active={focus === "outflow"}
          dimmed={focus !== null && focus !== "outflow"}
          onClick={() => pick("outflow")}
        />
        <KpiCard
          label="Transferências"
          tone="info"
          amount={summary.transfers}
          sub={`${summary.transfersCount} ${summary.transfersCount === 1 ? "transferência" : "transferências"} entre contas`}
          active={focus === "transfer"}
          dimmed={focus !== null && focus !== "transfer"}
          onClick={() => pick("transfer")}
        />
        <KpiCard
          label="Vencidos · ação"
          tone="warning"
          amount={summary.overdueOutflows}
          sub={`${summary.overdueOutflowsCount} ${summary.overdueOutflowsCount === 1 ? "item pendente" : "itens pendentes"}`}
          active={focus === "overdue"}
          dimmed={focus !== null && focus !== "overdue"}
          onClick={() => pick("overdue")}
        />
      </div>

      <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ${focus ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="flex items-center gap-2 rounded-lg border border-dashed bg-card px-3 py-2 text-[12.5px]">
            <span className="text-muted-foreground">Mostrando só</span>
            <span className="font-semibold">{focus ? FOCUS_LABEL[focus] : ""}</span>
            <span className="text-muted-foreground">· clique no card de novo ou</span>
            <button onClick={() => setFocus(null)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-brand-foreground hover:bg-brand-soft">
              <X className="size-3" /> ver tudo
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-start justify-between p-5 pb-3">
            <div>
              <h2 className="text-[15px] font-semibold">Contas</h2>
              <p className="text-[12.5px] text-muted-foreground">{selected.length} contas selecionadas</p>
            </div>
            <Button variant="muted" asChild>
              <Link href="/contas">
                <Plus /> Nova
              </Link>
            </Button>
          </div>
          <ul className="flex-1 px-5">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b py-3">
                <Checkbox checked={selected.includes(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Incluir ${a.name}`} />
                <AccountAvatar name={a.name} index={a.position} />
                <Link href={`/contas/${a.id}`} className="flex-1 truncate text-[13px] font-medium hover:underline">
                  {a.name}
                </Link>
                <span className="text-[15px] font-semibold tabular">{formatBRL(balances[a.id] ?? 0)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between bg-muted px-5 py-4">
            <span className="text-eyebrow uppercase text-muted-foreground">Total disponível</span>
            <span className="text-[16px] font-semibold text-brand-foreground tabular">{formatBRL(selectedTotal)}</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">
                {focus === "inflow" ? "Recebimentos por dia" : focus === "outflow" ? "Despesas por dia" : "Fluxo de caixa"}
              </h2>
              <p className="text-[12.5px] text-muted-foreground">
                {focus === "inflow" || focus === "outflow" ? "Só o que foi baixado" : "Saldo em caixa"} · {formatRange(range.start, range.end)}
              </p>
            </div>
            <ChartModeSwitch value={mode} onChange={setMode} />
          </div>
          <div className="mt-2">
            <CashflowChart
              key={focus ?? "all"}
              points={points}
              mode={mode}
              today={today}
              series={focus === "inflow" || focus === "outflow" ? focus : undefined}
            />
          </div>
          <div className="mt-2">
            <ChartLegend mode={mode} series={focus === "inflow" || focus === "outflow" ? focus : undefined} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-4 border-t pt-3">
            <div>
              <div className="text-[11.5px] text-muted-foreground">Saldo no início do período</div>
              <div className="text-[13px] font-semibold tabular">{formatBRL(startBalance)}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted-foreground">Saldo em {formatDayMonth(range.end)}</div>
              <div className="text-[13px] font-semibold tabular">{formatBRL(points.at(-1)?.balance ?? 0)}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted-foreground">Menor saldo · {minPoint && formatDayMonth(minPoint.date)}</div>
              <div className="text-[13px] font-semibold tabular">{formatBRL(minPoint?.balance ?? 0)}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-2">
        {focus === "transfer" ? (
          <TransfersPanel transfers={computed.transfers} accountName={(id) => data.accounts.find((a) => a.id === id)?.name ?? "—"} />
        ) : (
          <>
            {focus !== "outflow" && (
              <LedgerPanel
                key={`in-${focus}`}
                type="inflow"
                movements={computed.inflows}
                today={today}
                initialTab={focus === "inflow" ? "paid" : focus === "overdue" ? "overdue" : "open"}
                className={focus === "inflow" ? "lg:col-span-2" : undefined}
              />
            )}
            {focus !== "inflow" && (
              <LedgerPanel
                key={`out-${focus}`}
                type="outflow"
                movements={computed.outflows}
                today={today}
                initialTab={focus === "outflow" ? "paid" : focus === "overdue" ? "overdue" : "open"}
                className={focus === "outflow" ? "lg:col-span-2" : undefined}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

