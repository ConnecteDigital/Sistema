"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ChartLegend, ChartModeSwitch, CashflowChart, type ChartMode } from "@/components/cashflow-chart";
import { AccountAvatar } from "@/components/avatars";
import { AccountFilter, PeriodPicker } from "@/components/filters";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LedgerPanel } from "@/components/ledger-panel";
import { useMovementDialog } from "@/components/movement-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, Checkbox } from "@/components/ui/primitives";
import { accountBalances, balanceAt, dailyBalances, movementsIn, periodSummary } from "@/lib/finance";
import { formatBRL, formatDayMonth, formatRange, greeting } from "@/lib/format";
import { addDays } from "@/lib/dates";
import { LoadingState } from "@/components/loading-state";

export default function PainelPage() {
  const { data, error, today, range, accountIds, setAccountIds } = useFinance();
  const { open } = useMovementDialog();
  const [mode, setMode] = React.useState<ChartMode>("saldo");

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
        <HeroCard label="Saldo atual" amount={summary.current} sub={`Projeção · ${formatBRL(summary.projection)}`} />
        <KpiCard label="Recebidos" tone="success" value={formatBRL(summary.received)} sub={`Previsto · ${formatBRL(summary.openInflows)}`} />
        <KpiCard label="Despesas" tone="danger" value={formatBRL(summary.spent)} sub={`Previsto · ${formatBRL(summary.openOutflows)}`} />
        <KpiCard
          label="Transferências"
          tone="info"
          value={formatBRL(summary.transfers)}
          sub={`${summary.transfersCount} ${summary.transfersCount === 1 ? "transferência" : "transferências"} entre contas`}
        />
        <KpiCard
          label="Vencidos · ação"
          tone="warning"
          value={formatBRL(summary.overdueOutflows)}
          sub={`${summary.overdueOutflowsCount} ${summary.overdueOutflowsCount === 1 ? "item pendente" : "itens pendentes"}`}
        />
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
            <span className="text-[16px] font-semibold text-primary tabular dark:text-success-foreground">{formatBRL(selectedTotal)}</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Fluxo de caixa</h2>
              <p className="text-[12.5px] text-muted-foreground">Saldo em caixa · {formatRange(range.start, range.end)}</p>
            </div>
            <ChartModeSwitch value={mode} onChange={setMode} />
          </div>
          <div className="mt-2">
            <CashflowChart points={points} mode={mode} today={today} />
          </div>
          <div className="mt-2">
            <ChartLegend mode={mode} />
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
        <LedgerPanel type="inflow" movements={computed.inflows} today={today} />
        <LedgerPanel type="outflow" movements={computed.outflows} today={today} />
      </div>
    </>
  );
}
