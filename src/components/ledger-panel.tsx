"use client";

import { Check, ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Checkbox, CountPill, UnderlineTabs } from "@/components/ui/primitives";
import { formatBRL, formatDayMonth } from "@/lib/format";
import type { Movement, MovementType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinanceActions } from "./finance-actions";
import { useFinance } from "./finance-provider";
import { useMovementDialog } from "./movement-dialog";

export type Tab = "open" | "paid" | "overdue";

const subscribeWidth = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 640px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Card "O que entra" / "O que sai" do painel. */
export function LedgerPanel({
  type,
  movements,
  today,
  initialTab = "open",
  className,
  wide,
}: {
  type: MovementType;
  movements: Movement[];
  today: string;
  initialTab?: Tab;
  className?: string;
  /** Versão larga (visão detalhada do card): mais colunas e 15 por página. */
  wide?: boolean;
}) {
  const { data } = useFinance();
  const PAGE = wide ? 15 : 10;
  const names = React.useMemo(
    () => ({
      contact: new Map(data?.contacts.map((c) => [c.id, c.name]) ?? []),
      category: new Map(data?.categories.map((c) => [c.id, c.name]) ?? []),
      account: new Map(data?.accounts.map((a) => [a.id, a.name]) ?? []),
    }),
    [data],
  );
  const isIn = type === "inflow";
  // No celular as colunas Status (e Categoria) somem; as colunas mescladas do rodapé acompanham.
  const desktop = React.useSyncExternalStore(subscribeWidth, () => window.matchMedia("(min-width: 640px)").matches, () => true);
  const hiddenCols = desktop ? 0 : wide ? 2 : 1;
  const { open } = useMovementDialog();
  const { setPaid, remove } = useFinanceActions();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [page, setPage] = React.useState(0);
  // Seleção de várias linhas para somar (e baixar de uma vez).
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const lists = React.useMemo(() => {
    // Todas as abas em ordem de data, da mais próxima para a mais distante.
    const asc = (a: Movement, b: Movement) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, "pt-BR");
    return {
      open: movements.filter((m) => !m.paid).sort(asc),
      paid: movements.filter((m) => m.paid).sort(asc),
      overdue: movements.filter((m) => !m.paid && m.date < today).sort(asc),
    };
  }, [movements, today]);
  const list = lists[tab];
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice(page * PAGE, page * PAGE + PAGE);
  const total = list.reduce((s, m) => s + m.amount, 0);
  const openTotal = lists.open.reduce((s, m) => s + m.amount, 0);
  const picked = list.filter((m) => selected.has(m.id));
  const pickedTotal = picked.reduce((s, m) => s + m.amount, 0);
  const pickedOpen = picked.filter((m) => !m.paid);
  const allPicked = list.length > 0 && picked.length === list.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const valueColor = isIn ? "text-foreground" : "text-destructive-foreground";

  return (
    <Card className={cn("flex flex-col p-5 animate-pop-in", className)}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">{wide ? (isIn ? "Contas a receber" : "Contas a pagar") : isIn ? "O que entra" : "O que sai"}</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {wide ? "Lançamentos do período · " : ""}
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
            setSelected(new Set());
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
            <th className="w-7 py-2.5 pl-2 font-normal">
              <Checkbox
                checked={allPicked ? true : picked.length ? "indeterminate" : false}
                onCheckedChange={() => setSelected(allPicked ? new Set() : new Set(list.map((m) => m.id)))}
                aria-label="Selecionar todos"
              />
            </th>
            <th className="py-2.5 pl-1 font-normal">Data</th>
            <th className="py-2.5 font-normal">{wide ? (isIn ? "Cliente" : "Fornecedor") : isIn ? "Cliente / descrição" : "Fornecedor / descrição"}</th>
            {wide && desktop && <th className="py-2.5 font-normal">Categoria</th>}
            {desktop && <th className="py-2.5 font-normal">Status</th>}
            <th className="py-2.5 pr-2 text-right font-normal">Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const overdue = !m.paid && m.date < today;
            return (
              <tr
                key={m.id}
                onClick={(e) => {
                  // Clicar na linha marca/desmarca (menos nos botões de ação); no celular abre o lançamento.
                  if ((e.target as HTMLElement).closest("button")) return;
                  if (window.matchMedia("(max-width: 639px)").matches) open({ kind: m.type, movement: m });
                  else toggle(m.id);
                }}
                className={cn("group cursor-pointer border-b last:border-0 hover:bg-accent/50", selected.has(m.id) && "bg-brand-soft/60 hover:bg-brand-soft")}
              >
                <td className="w-7 py-2.5 pl-2">
                  <Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggle(m.id)} aria-label="Selecionar" />
                </td>
                <td className="w-14 py-2.5 pl-1 text-muted-foreground tabular">{formatDayMonth(m.date)}</td>
                {wide ? (
                  <>
                    {/* Nome completo do cliente; a descrição fica no título (quase sempre repete a categoria). */}
                    <td className="py-2 pr-3 font-medium" title={m.description}>
                      {names.contact.get(m.contactId ?? "") ?? m.description}
                    </td>
                    {desktop && <td className="w-[22%] py-2.5 pr-3 text-muted-foreground">{names.category.get(m.categoryId ?? "") ?? "—"}</td>}
                  </>
                ) : (
                  <td className="max-w-0 py-2 pr-2">
                    {!m.contactId ? (
                      <div className="truncate">{m.description}</div>
                    ) : (
                      <>
                        <div className="font-medium leading-snug [overflow-wrap:anywhere]">{names.contact.get(m.contactId) ?? m.description}</div>
                        <div className="truncate text-[11.5px] text-muted-foreground">{m.description}</div>
                      </>
                    )}
                  </td>
                )}
                {desktop && (
                <td className="relative w-28 py-2.5">
                  {/* No hover as ações tomam o lugar do status, sem empurrar o nome nem o valor. */}
                  <div className="transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0">
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
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                    <button onClick={() => void setPaid([m.id], !m.paid)} className="rounded p-1 text-muted-foreground hover:bg-success-soft hover:text-success-foreground" title={m.paid ? "Desfazer baixa" : isIn ? "Marcar como recebido" : "Marcar como pago"}>
                      {m.paid ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
                    </button>
                    <button onClick={() => open({ kind: m.type, movement: m })} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Editar">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => void remove([m])} className="rounded p-1 text-muted-foreground hover:bg-destructive-soft hover:text-destructive-foreground" title="Excluir">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
                )}
                <td className="whitespace-nowrap py-2.5 pl-2 pr-2 text-right sm:w-28">
                  <span className={cn("font-semibold tabular", valueColor)}>{formatBRL(m.amount)}</span>
                  {/* No celular o status vai embaixo do valor. */}
                  <div className={cn("mt-0.5 text-[11px] font-medium sm:hidden", m.paid ? "text-success-foreground" : overdue ? "text-destructive-foreground" : "text-warning-foreground")}>
                    {m.paid ? (isIn ? "Recebido" : "Pago") : overdue ? "Vencido" : isIn ? "A receber" : "A pagar"}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={(wide ? 6 : 5) - hiddenCols} className="py-10 text-center text-[12.5px] text-muted-foreground">
                Nada por aqui no período.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            {picked.length > 0 && (
              <tr className="bg-brand-soft animate-fade-in">
                <td colSpan={(wide ? 5 : 4) - hiddenCols} className="py-2 pl-2">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="font-medium">
                      {picked.length} selecionado{picked.length === 1 ? "" : "s"}
                    </span>
                    {pickedOpen.length > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          void setPaid(pickedOpen.map((m) => m.id), true);
                          setSelected(new Set());
                        }}
                      >
                        <Check /> {isIn ? "Receber" : "Pagar"} {pickedOpen.length}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Limpar
                    </Button>
                  </div>
                </td>
                <td className={cn("py-2 pr-2 text-right font-semibold tabular", valueColor)}>{formatBRL(pickedTotal)}</td>
              </tr>
            )}
            <tr className="bg-muted/70">
              <td colSpan={(wide ? 5 : 4) - hiddenCols} className="py-2.5 pl-2 text-eyebrow uppercase text-muted-foreground">
                Total
              </td>
              <td className={cn("whitespace-nowrap py-2.5 pr-2 text-right font-semibold tabular", valueColor)}>{formatBRL(total)}</td>
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
