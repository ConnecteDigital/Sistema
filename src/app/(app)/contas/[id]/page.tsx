"use client";

import { ArrowLeft, ArrowLeftRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Switch } from "radix-ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { AccountAvatar } from "@/components/avatars";
import { CashflowChart, ChartLegend } from "@/components/cashflow-chart";
import { useFinance } from "@/components/finance-provider";
import { LoadingState } from "@/components/loading-state";
import { useMovementDialog } from "@/components/movement-dialog";
import { Button } from "@/components/ui/button";
import { Badge, Card, CountPill } from "@/components/ui/primitives";
import { addDays, addMonths, monthRange } from "@/lib/dates";
import { accountBalances, balanceAt, dailyBalances } from "@/lib/finance";
import { formatBRL, formatDayMonth, monthLong } from "@/lib/format";
import type { ISODate, Movement } from "@/lib/types";
import { cn } from "@/lib/utils";

type Line =
  | { kind: "movement"; date: ISODate; m: Movement; signed: number }
  | { kind: "transfer"; date: ISODate; id: string; other: string; description: string; signed: number };

export default function ExtratoPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, today } = useFinance();
  const { open } = useMovementDialog();
  const [month, setMonth] = React.useState<ISODate | null>(null);
  const [showPending, setShowPending] = React.useState(false);
  const ref = month ?? today;

  const computed = React.useMemo(() => {
    if (!data || !ref) return null;
    const account = data.accounts.find((a) => a.id === id);
    if (!account) return null;
    const range = monthRange(ref);
    const scope = { accountIds: [id] };
    const contact = new Map(data.contacts.map((c) => [c.id, c.name]));
    const accName = new Map(data.accounts.map((a) => [a.id, a.name]));
    const lines: Line[] = [];
    for (const m of data.movements) {
      if (m.bankAccountId !== id || m.date < range.start || m.date > range.end) continue;
      lines.push({ kind: "movement", date: m.date, m, signed: m.type === "inflow" ? m.amount : -m.amount });
    }
    for (const t of data.transfers) {
      if (t.date < range.start || t.date > range.end) continue;
      if (t.sourceAccountId === id) lines.push({ kind: "transfer", date: t.date, id: t.id, other: accName.get(t.destinationAccountId) ?? "—", description: t.description, signed: -t.amount });
      if (t.destinationAccountId === id) lines.push({ kind: "transfer", date: t.date, id: t.id, other: accName.get(t.sourceAccountId) ?? "—", description: t.description, signed: t.amount });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date) || b.signed - a.signed);
    const points = dailyBalances(data, scope, range);
    const opening = balanceAt(data, scope, addDays(range.start, -1));
    return {
      account,
      range,
      lines,
      points,
      opening,
      contact,
      balances: accountBalances(data),
      min: points.reduce((a, p) => (p.balance < a.balance ? p : a), points[0]),
    };
  }, [data, id, ref]);

  if (!data || !today) return <LoadingState error={error} />;
  if (!computed)
    return (
      <div className="mt-20 text-center text-[13px] text-muted-foreground">
        Conta não encontrada. <Link href="/contas" className="text-brand-foreground underline">Voltar</Link>
      </div>
    );

  const { account, range, lines, points, opening, contact, balances, min } = computed;
  const done = lines.filter((l) => l.kind === "transfer" || l.m.paid);
  const pendingCount = lines.length - done.length;
  const visible = showPending ? lines : done;
  const [y, mo] = range.start.split("-").map(Number);
  const monthTitle = `${monthLong(mo - 1).replace(/^./, (c) => c.toUpperCase())} de ${y}`;

  // Saldo corrente: só o que foi baixado entra no saldo; pendentes aparecem sem alterar.
  const withBalance = visible.reduce<{ l: Line; balance: number; lastOfDay: boolean; counts: boolean }[]>((acc, l, i) => {
    const counts = l.kind === "transfer" || l.m.paid;
    const prev = acc.at(-1)?.balance ?? opening;
    const balance = Math.round((prev + (counts ? l.signed : 0)) * 100) / 100;
    const lastOfDay = i === visible.length - 1 || visible[i + 1].date !== l.date;
    acc.push({ l, balance, lastOfDay, counts });
    return acc;
  }, []);
  const ins = done.filter((l) => l.signed > 0).reduce((s, l) => s + l.signed, 0);
  const outs = done.filter((l) => l.signed < 0).reduce((s, l) => s - l.signed, 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button size="icon" asChild>
            <Link href="/contas" aria-label="Voltar para contas">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="text-title">Extrato — {account.name}</h1>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
          <button className="rounded-md p-1.5 hover:bg-accent" onClick={() => setMonth(addMonths(range.start, -1))} aria-label="Mês anterior">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-[13px] font-medium">{monthTitle}</span>
          <button className="rounded-md p-1.5 hover:bg-accent" onClick={() => setMonth(addMonths(range.start, 1))} aria-label="Próximo mês">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="text-[15px] font-semibold">Contas</h2>
            <p className="text-[12.5px] text-muted-foreground">{data.accounts.length} contas</p>
          </div>
          <ul>
            {data.accounts.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/contas/${a.id}`}
                  className={cn("flex items-center gap-3 border-t px-5 py-3 text-[13px] transition-colors hover:bg-accent/50", a.id === id && "bg-brand-soft/70")}
                >
                  <AccountAvatar name={a.name} index={a.position} />
                  <span className="flex-1 truncate font-medium">{a.name}</span>
                  <span className="text-[12.5px] font-semibold tabular">{formatBRL(balances[a.id] ?? 0)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t bg-muted px-5 py-4">
            <span className="text-eyebrow uppercase text-muted-foreground">Saldo atual</span>
            <span className="text-[16px] font-semibold text-brand-foreground tabular">{formatBRL(balances[id] ?? 0)}</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Saldo em caixa</h2>
          <p className="text-[12.5px] text-muted-foreground">{monthTitle} — o que de fato entrou e saiu do banco</p>
          <div className="mt-2">
            <CashflowChart points={points} mode="saldo" today={today} height={220} />
          </div>
          <ChartLegend mode="saldo" />
          <div className="mt-3 grid grid-cols-3 gap-4 border-t pt-3">
            <div>
              <div className="text-[11.5px] text-muted-foreground">Saldo no início do mês</div>
              <div className="text-[13px] font-semibold tabular">{formatBRL(opening)}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted-foreground">Saldo em {formatDayMonth(range.end)}</div>
              <div className="text-[13px] font-semibold tabular">{formatBRL(points.at(-1)?.balance ?? 0)}</div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted-foreground">Menor saldo · {min && formatDayMonth(min.date)}</div>
              <div className="text-[13px] font-semibold tabular">{formatBRL(min?.balance ?? 0)}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold">Extrato da conta</h2>
            <p className="text-[12.5px] text-muted-foreground">
              {monthTitle} — {showPending ? "efetuados e pendentes" : "somente efetuados"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
              Mostrar pendentes <CountPill tone="warning">{pendingCount}</CountPill>
              <Switch.Root checked={showPending} onCheckedChange={setShowPending} className="relative h-[18px] w-8 rounded-full bg-input transition-colors data-[state=checked]:bg-primary">
                <Switch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px]" />
              </Switch.Root>
            </label>
            <Button variant="primary" size="md" onClick={() => open({ kind: "inflow" })}>
              <Plus /> Novo lançamento
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table key={`${range.start}-${showPending}`} className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="w-24 py-2.5 pl-5 font-medium">Data</th>
                <th className="py-2.5 font-medium">Nome</th>
                <th className="py-2.5 font-medium">Descrição</th>
                <th className="py-2.5 text-right font-medium">Entrada</th>
                <th className="py-2.5 text-right font-medium">Saída</th>
                <th className="py-2.5 pr-5 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b bg-muted/20 text-muted-foreground">
                <td className="py-2.5 pl-5">{formatDayMonth(addDays(range.start, -1))}</td>
                <td />
                <td className="py-2.5">Saldo anterior</td>
                <td />
                <td />
                <td className="py-2.5 pr-5 text-right font-semibold text-foreground tabular">{formatBRL(opening)}</td>
              </tr>
              {withBalance.map(({ l, balance, lastOfDay, counts }, i) => {
                const first = i === 0 || withBalance[i - 1].l.date !== l.date;
                const isTransfer = l.kind === "transfer";
                return (
                  <tr
                    key={isTransfer ? `t-${l.id}-${l.signed}` : l.m.id}
                    onClick={() => !isTransfer && open({ kind: l.m.type, movement: l.m })}
                    style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}
                    className={cn("border-b animate-row-in", !isTransfer && "cursor-pointer hover:bg-accent/50", !counts && "text-muted-foreground")}
                  >
                    <td className="py-2.5 pl-5 tabular">{first ? formatDayMonth(l.date) : ""}</td>
                    <td className="max-w-[220px] truncate py-2.5 pr-3">{isTransfer ? l.other : contact.get(l.m.contactId ?? "") ?? ""}</td>
                    <td className="max-w-[300px] py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        {isTransfer && <ArrowLeftRight className="size-3.5 shrink-0 text-info-foreground" />}
                        <span className="truncate font-medium">{isTransfer ? l.description || "Transferência" : l.m.description}</span>
                        {isTransfer && <Badge tone="info">Transferência</Badge>}
                        {!counts && <Badge tone="warning">Pendente</Badge>}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium text-success-foreground tabular">{l.signed > 0 ? formatBRL(l.signed) : ""}</td>
                    <td className="py-2.5 text-right font-medium text-destructive-foreground tabular">{l.signed < 0 ? formatBRL(-l.signed) : ""}</td>
                    <td className="py-2.5 pr-5 text-right font-semibold tabular">{lastOfDay ? formatBRL(balance) : ""}</td>
                  </tr>
                );
              })}
              {withBalance.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[12.5px] text-muted-foreground">
                    Nenhuma movimentação neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-2 px-5 py-3 text-[12px] text-muted-foreground">
          <span>{done.length} movimentações efetuadas</span>
          {!showPending && pendingCount > 0 && <span>{pendingCount} pendentes ocultos</span>}
          <span className="tabular">
            {formatBRL(ins)} entradas · {formatBRL(outs)} saídas
          </span>
        </div>
      </Card>
    </>
  );
}
