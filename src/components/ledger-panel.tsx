"use client";

import { Check, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CountPill, UnderlineTabs } from "@/components/ui/primitives";
import { formatBRL, formatDayMonth } from "@/lib/format";
import type { Movement, MovementType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinanceActions } from "./finance-actions";
import { useMovementDialog } from "./movement-dialog";

export type Tab = "open" | "paid" | "overdue";
const PAGE = 10;

/** Card "O que entra" / "O que sai" do painel. */
export function LedgerPanel({
  type,
  movements,
  today,
  initialTab = "open",
  className,
}: {
  type: MovementType;
  movements: Movement[];
  today: string;
  initialTab?: Tab;
  className?: string;
}) {
  const isIn = type === "inflow";
  const { open } = useMovementDialog();
  const { setPaid, remove } = useFinanceActions();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [page, setPage] = React.useState(0);

  const lists = React.useMemo(() => {
    const desc = (a: Movement, b: Movement) => b.date.localeCompare(a.date);
    return {
      open: movements.filter((m) => !m.paid).sort(desc),
      paid: movements.filter((m) => m.paid).sort(desc),
      overdue: movements.filter((m) => !m.paid && m.date < today).sort(desc),
    };
  }, [movements, today]);
  const list = lists[tab];
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice(page * PAGE, page * PAGE + PAGE);
  const total = list.reduce((s, m) => s + m.amount, 0);
  const openTotal = lists.open.reduce((s, m) => s + m.amount, 0);
  const valueColor = isIn ? "text-foreground" : "text-destructive-foreground";

  return (
    <Card className={cn("flex flex-col p-5 animate-pop-in", className)}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">{isIn ? "O que entra" : "O que sai"}</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {isIn ? "A receber" : "A pagar"}:{" "}
            <span className={cn("font-semibold tabular", isIn ? "text-foreground" : "text-destructive-foreground")}>{formatBRL(openTotal)}</span>
          </p>
        </div>
        <Button variant={isIn ? "primary" : "danger"} size="md" onClick={() => open({ kind: type })}>
          <Plus /> Lançar
        </Button>
      </div>
      <div className="mt-3">
        <UnderlineTabs
          value={tab}
          onChange={(t) => {
            setTab(t);
            setPage(0);
          }}
          options={[
            { value: "open", label: <>Em aberto <CountPill tone={isIn ? "success" : "danger"}>{lists.open.length}</CountPill></> },
            { value: "paid", label: <>Efetuados <CountPill>{lists.paid.length}</CountPill></> },
            { value: "overdue", label: <>Vencidos <CountPill tone="warning">{lists.overdue.length}</CountPill></> },
          ]}
        />
      </div>
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-[12px] text-muted-foreground">
            <th className="py-2.5 pl-2 font-normal">Data</th>
            <th className="py-2.5 font-normal">Descrição</th>
            <th className="py-2.5 font-normal">Status</th>
            <th className="py-2.5 pr-2 text-right font-normal">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const overdue = !m.paid && m.date < today;
            return (
              <tr key={m.id} className="group border-b last:border-0 hover:bg-accent/50">
                <td className="w-16 py-2.5 pl-2 text-muted-foreground tabular">{formatDayMonth(m.date)}</td>
                <td className="max-w-0 truncate py-2.5 pr-2">{m.description}</td>
                <td className="w-24 py-2.5">
                  {m.paid ? (
                    <Badge tone="success" dot>
                      {isIn ? "Recebido" : "Pago"}
                    </Badge>
                  ) : overdue ? (
                    <Badge tone="danger" dot>
                      Vencido
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      {isIn ? "A receber" : "A pagar"}
                    </Badge>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={cn("font-semibold tabular", valueColor)}>{formatBRL(m.amount)}</span>
                    <span className="flex w-0 gap-0.5 overflow-hidden opacity-0 transition-all duration-200 group-hover:w-[72px] group-hover:opacity-100 group-focus-within:w-[72px] group-focus-within:opacity-100">
                      <button onClick={() => void setPaid([m.id], !m.paid)} className="rounded p-1 text-muted-foreground hover:bg-success-soft hover:text-success-foreground" title={m.paid ? "Desfazer baixa" : isIn ? "Marcar como recebido" : "Marcar como pago"}>
                        {m.paid ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
                      </button>
                      <button onClick={() => open({ kind: m.type, movement: m })} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Editar">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => void remove([m])} className="rounded p-1 text-muted-foreground hover:bg-destructive-soft hover:text-destructive-foreground" title="Excluir">
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-10 text-center text-[12.5px] text-muted-foreground">
                Nada por aqui no período.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-muted/70">
              <td colSpan={3} className="py-2.5 pl-2 text-eyebrow uppercase text-muted-foreground">
                Total
              </td>
              <td className={cn("py-2.5 pr-2 text-right font-semibold tabular", valueColor)}>{formatBRL(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            {page * PAGE + 1}–{Math.min(list.length, page * PAGE + PAGE)} de {list.length}
          </span>
          <div className="flex items-center gap-2">
            <Button size="icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
            <span>
              {page + 1} de {pages}
            </span>
            <Button size="icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Próxima página">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
