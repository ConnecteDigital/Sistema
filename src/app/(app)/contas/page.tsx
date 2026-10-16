"use client";

import { FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AccountDialog } from "@/components/account-dialog";
import { AccountAvatar } from "@/components/avatars";
import { PeriodPicker } from "@/components/filters";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { inRange } from "@/lib/dates";
import { accountBalances } from "@/lib/finance";
import { formatBRL } from "@/lib/format";
import type { BankAccount } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ContasPage() {
  const { data, error, range } = useFinance();
  const [editing, setEditing] = React.useState<BankAccount | "new" | null>(null);

  const rows = React.useMemo(() => {
    if (!data) return [];
    const balances = accountBalances(data);
    return [...data.accounts]
      .sort((a, b) => a.position - b.position)
      .map((a) => {
        let net = 0;
        let count = 0;
        for (const m of data.movements) {
          if (m.bankAccountId !== a.id || !inRange(m.date, range)) continue;
          count++;
          if (m.paid) net += m.type === "inflow" ? m.amount : -m.amount;
        }
        for (const t of data.transfers) {
          if (!inRange(t.date, range)) continue;
          if (t.destinationAccountId === a.id) {
            net += t.amount;
            count++;
          }
          if (t.sourceAccountId === a.id) {
            net -= t.amount;
            count++;
          }
        }
        return { account: a, balance: balances[a.id] ?? 0, net: Math.round(net * 100) / 100, count };
      });
  }, [data, range]);

  if (!data) return <LoadingState error={error} />;
  const total = rows.reduce((s, r) => s + (r.account.active ? r.balance : 0), 0);
  const netTotal = rows.reduce((s, r) => s + r.net, 0);
  const activeCount = rows.filter((r) => r.account.active).length;

  return (
    <>
      <PageHeader
        title="Contas"
        accent="bancárias"
        description="Onde o dinheiro está. Cada conta tem saldo próprio e extrato próprio."
        actions={
          <>
            <PeriodPicker />
            <Button variant="primary" size="md" onClick={() => setEditing("new")}>
              <Plus /> Nova conta
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <HeroCard label="Saldo total" amount={total} sub={`${activeCount} contas ativas`} />
        <KpiCard label="Movimentação no período" tone={netTotal >= 0 ? "success" : "danger"} amount={netTotal} sub="Entradas − saídas baixadas ± transferências" />
        <KpiCard label="Lançamentos no período" tone="info" value={String(rows.reduce((s, r) => s + r.count, 0))} sub="Inclui transferências entre contas" />
      </div>

      <Card className="mt-3 overflow-hidden">
        <p className="px-5 pt-4 text-[12px] text-muted-foreground">O período define a movimentação somada — o saldo atual é o de hoje, e a lista traz todos os cadastros.</p>
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="border-y bg-muted/40 text-left text-[12px] text-muted-foreground">
              <th className="py-2.5 pl-5 font-medium">Conta</th>
              <th className="py-2.5 text-right font-medium">Movimentação</th>
              <th className="py-2.5 text-right font-medium">Lançamentos</th>
              <th className="py-2.5 text-right font-medium">Saldo atual</th>
              <th className="py-2.5 pl-8 font-medium">Situação</th>
              <th className="w-28 py-2.5 pr-5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ account: a, balance, net, count }, i) => (
              <tr key={a.id} className="group border-b animate-row-in hover:bg-accent/50" style={{ animationDelay: `${i * 30}ms` }}>
                <td className="py-3 pl-5">
                  <Link href={`/contas/${a.id}`} className="flex items-center gap-3">
                    <AccountAvatar name={a.name} index={a.position} className="size-8" />
                    <div>
                      <div className="font-medium group-hover:underline">{a.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {[a.bank, a.branch && `ag. ${a.branch}`, a.accountNumber && `cc ${a.accountNumber}`].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className={cn("py-3 text-right font-medium tabular", net < 0 ? "text-destructive-foreground" : "text-success-foreground")}>{formatBRL(net)}</td>
                <td className="py-3 text-right tabular">{count}</td>
                <td className="py-3 text-right text-[14px] font-semibold tabular">{formatBRL(balance)}</td>
                <td className="py-3 pl-8">
                  <Badge tone={a.active ? "success" : "neutral"} dot>
                    {a.active ? "Ativa" : "Inativa"}
                  </Badge>
                </td>
                <td className="py-3 pr-5 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild title="Extrato">
                      <Link href={`/contas/${a.id}`} aria-label="Extrato">
                        <FileText />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(a)} title="Editar" aria-label="Editar">
                      <Pencil />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="py-3 pl-5">
                {rows.length} conta{rows.length === 1 ? "" : "s"}
              </td>
              <td className={cn("py-3 text-right tabular", netTotal < 0 && "text-destructive-foreground")}>{formatBRL(netTotal)}</td>
              <td />
              <td className="py-3 text-right tabular">{formatBRL(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </Card>

      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
