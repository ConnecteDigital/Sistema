"use client";

import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import * as React from "react";
import { ContactAvatar } from "@/components/avatars";
import { PeriodPicker } from "@/components/filters";
import { useFinanceActions } from "@/components/finance-actions";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { useMovementDialog } from "@/components/movement-dialog";
import { PageHeader } from "@/components/page-header";
import { TransfersPanel } from "@/components/transfers-panel";
import { Button } from "@/components/ui/button";
import { Badge, Card, Checkbox, Popover, PopoverContent, PopoverTrigger, Segmented } from "@/components/ui/primitives";
import { inRange } from "@/lib/dates";
import { transfersIn } from "@/lib/finance";
import { formatBRL, formatDate, weekday } from "@/lib/format";
import type { Movement } from "@/lib/types";
import { cn, groupColor } from "@/lib/utils";

const PAGE_SIZE = 20;

type SortKey = "date" | "description" | "amount";
type TypeFilter = "all" | "inflow" | "outflow";
type Status = "all" | "paid" | "open" | "overdue";

interface Filters {
  accountId: string;
  status: Status;
  regime: "cash" | "competence";
  groupId: string;
  categoryId: string;
  contactId: string;
  min: string;
  max: string;
}
const EMPTY_FILTERS: Filters = { accountId: "", status: "all", regime: "cash", groupId: "", categoryId: "", contactId: "", min: "", max: "" };

const selectClass = "h-8 w-full rounded-md border border-input bg-card px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring/40";

function statusOf(m: Movement, today: string) {
  if (m.paid) return { tone: "success" as const, label: m.type === "inflow" ? "Recebido" : "Pago" };
  if (m.date < today) return { tone: "danger" as const, label: "Vencido" };
  return { tone: "warning" as const, label: m.type === "inflow" ? "A receber" : "A pagar" };
}

function toCSV(rows: Movement[], names: { account: (id: string) => string; category: (id: string | null) => string; contact: (id: string | null) => string }) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["Data", "Tipo", "Descrição", "Cliente/Fornecedor", "Categoria", "Conta", "Valor", "Situação"];
  const lines = rows.map((m) =>
    [
      m.date.split("-").reverse().join("/"),
      m.type === "inflow" ? "Entrada" : "Saída",
      esc(m.description),
      esc(names.contact(m.contactId)),
      esc(names.category(m.categoryId)),
      esc(names.account(m.bankAccountId)),
      (m.type === "inflow" ? m.amount : -m.amount).toFixed(2).replace(".", ","),
      m.paid ? "Efetuado" : "Em aberto",
    ].join(";"),
  );
  return "﻿" + [header.join(";"), ...lines].join("\n");
}

export default function MovimentosPage() {
  const { data, error, today, range, setRange } = useFinance();
  const { open } = useMovementDialog();
  const { setPaid, remove, duplicate } = useFinanceActions();

  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState<TypeFilter>("all");
  const params = useSearchParams();
  // Links de outras telas: /movimentos?categoria=…&grupo=…&contato=…
  const [filters, setFilters] = React.useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    categoryId: params.get("categoria") ?? "",
    groupId: params.get("grupo") ?? "",
    contactId: params.get("contato") ?? "",
  }));
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [showTransfers, setShowTransfers] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Atalhos: "/" busca, "n" novo lançamento.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n") {
        e.preventDefault();
        open({ kind: "inflow" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const lookups = React.useMemo(() => {
    if (!data) return null;
    const cat = new Map(data.categories.map((c) => [c.id, c]));
    const grp = new Map(data.groups.map((g) => [g.id, g]));
    const contact = new Map(data.contacts.map((c) => [c.id, c]));
    const account = new Map(data.accounts.map((a) => [a.id, a]));
    return { cat, grp, contact, account };
  }, [data]);

  // Lançamentos do período (base dos cards).
  const inPeriod = React.useMemo(() => {
    if (!data) return [];
    const dateOf = (m: Movement) => (filters.regime === "competence" ? m.competenceDate ?? m.date : m.date);
    return data.movements.filter((m) => inRange(dateOf(m), range));
  }, [data, range, filters.regime]);

  const filtered = React.useMemo(() => {
    if (!lookups) return [];
    const q = query.trim().toLowerCase();
    const min = filters.min ? Number(filters.min.replace(",", ".")) : null;
    const max = filters.max ? Number(filters.max.replace(",", ".")) : null;
    const rows = inPeriod.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (filters.accountId && m.bankAccountId !== filters.accountId) return false;
      if (filters.status === "paid" && !m.paid) return false;
      if (filters.status === "open" && m.paid) return false;
      if (filters.status === "overdue" && (m.paid || m.date >= today)) return false;
      if (filters.categoryId && m.categoryId !== filters.categoryId) return false;
      if (filters.groupId && lookups.cat.get(m.categoryId ?? "")?.groupId !== filters.groupId) return false;
      if (filters.contactId && m.contactId !== filters.contactId) return false;
      if (min !== null && m.amount < min) return false;
      if (max !== null && m.amount > max) return false;
      if (q) {
        const hay = [m.description, lookups.contact.get(m.contactId ?? "")?.name, lookups.cat.get(m.categoryId ?? "")?.name, m.documentNumber, m.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === "amount") return (a.amount - b.amount) * dir;
      if (sort.key === "description") return a.description.localeCompare(b.description, "pt-BR") * dir;
      return (a.date.localeCompare(b.date) || a.description.localeCompare(b.description, "pt-BR")) * dir;
    });
  }, [inPeriod, lookups, query, type, filters, sort, today]);

  if (!data || !lookups) return <LoadingState error={error} />;

  const sum = (ms: { amount: number }[]) => ms.reduce((s, m) => s + m.amount, 0);
  const ins = inPeriod.filter((m) => m.type === "inflow");
  const outs = inPeriod.filter((m) => m.type === "outflow");
  const overdue = inPeriod.filter((m) => !m.paid && m.date < today);
  const transfers = transfersIn(data, { accountIds: [] }, range);
  const balance = sum(ins) - sum(outs);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const total = filtered.reduce((s, m) => s + (m.type === "inflow" ? m.amount : -m.amount), 0);

  const activeFilters = (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => filters[k] !== EMPTY_FILTERS[k]).length;
  const selectedRows = filtered.filter((m) => selected.has(m.id));
  const allOnPage = rows.length > 0 && rows.every((m) => selected.has(m.id));

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "amount" ? "desc" : "asc" }));

  const exportCSV = () => {
    const csv = toCSV(filtered, {
      account: (id) => lookups.account.get(id)?.name ?? "",
      category: (id) => lookups.cat.get(id ?? "")?.name ?? "",
      contact: (id) => lookups.contact.get(id ?? "")?.name ?? "",
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `movimentos_${range.start}_${range.end}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  // Card selecionado no topo (atalho para os filtros de tipo e situação).
  const cardFocus: null | "inflow" | "outflow" | "transfer" | "overdue" = showTransfers
    ? "transfer"
    : filters.status === "overdue" && type === "all"
      ? "overdue"
      : filters.status === "all" && type !== "all"
        ? type
        : null;
  function focusCard(f: typeof cardFocus) {
    const next = f === cardFocus ? null : f;
    setShowTransfers(next === "transfer");
    setType(next === "inflow" || next === "outflow" ? next : "all");
    setFilters((cur) => ({ ...cur, status: next === "overdue" ? "overdue" : "all" }));
    setPage(0);
    setSelected(new Set());
  }

  const resetPage = () => {
    setPage(0);
    setSelected(new Set());
  };
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const categories = data.categories
    .filter((c) => !filters.groupId || c.groupId === filters.groupId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const contacts = data.contacts.filter((c) => !c.deleted).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <>
      <PageHeader
        title="Entradas e"
        accent="saídas"
        description="Histórico completo de tudo que entrou e saiu das suas contas."
        actions={
          <Button variant="primary" size="md" onClick={() => open({ kind: "inflow" })} title="Atalho: N">
            <Plus /> Novo lançamento
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HeroCard
          label="Total de lançamentos"
          count={inPeriod.length}
          sub={`Saldo · ${formatBRL(balance)}`}
          dimmed={cardFocus !== null}
          onClick={cardFocus ? () => focusCard(null) : undefined}
        />
        <KpiCard
          label="Entradas"
          tone="success"
          amount={sum(ins)}
          sub={`${ins.length} lançamentos`}
          active={cardFocus === "inflow"}
          dimmed={cardFocus !== null && cardFocus !== "inflow"}
          onClick={() => focusCard("inflow")}
        />
        <KpiCard
          label="Saídas"
          tone="danger"
          amount={sum(outs)}
          sub={`${outs.length} lançamentos`}
          active={cardFocus === "outflow"}
          dimmed={cardFocus !== null && cardFocus !== "outflow"}
          onClick={() => focusCard("outflow")}
        />
        <KpiCard
          label="Transferências"
          tone="info"
          amount={sum(transfers)}
          sub={`${transfers.length} entre contas`}
          active={cardFocus === "transfer"}
          dimmed={cardFocus !== null && cardFocus !== "transfer"}
          onClick={() => focusCard("transfer")}
        />
        <KpiCard
          label="Atrasados"
          tone="warning"
          amount={sum(overdue)}
          sub={`${overdue.length} vencidos até hoje`}
          active={cardFocus === "overdue"}
          dimmed={cardFocus !== null && cardFocus !== "overdue"}
          onClick={() => focusCard("overdue")}
        />
      </div>

      {showTransfers ? (
        <div className="mt-3 grid">
          <TransfersPanel transfers={[...transfers].sort((a, b) => a.date.localeCompare(b.date))} accountName={(id) => lookups.account.get(id)?.name ?? "—"} />
        </div>
      ) : (
      <Card key={cardFocus ?? "all"} className="mt-3 overflow-hidden animate-pop-in">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <PeriodPicker
            value={range}
            onChange={(r) => {
              setRange(r);
              resetPage();
            }}
          />
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
              placeholder="Buscar descrição, cliente…"
              className="h-7 w-full rounded-[7px] border bg-card pl-8 pr-7 text-[12.5px] outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
            />
            {query ? (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground" aria-label="Limpar busca">
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="absolute right-2 top-1.5 rounded border px-1 text-[10px] text-muted-foreground">/</kbd>
            )}
          </div>
          <FiltersPopover
            value={filters}
            count={activeFilters}
            onApply={(f) => {
              setFilters(f);
              resetPage();
            }}
            accounts={data.accounts}
            groups={groups}
            categories={categories}
            contacts={contacts}
          />
          <Segmented
            value={type}
            onChange={(t) => {
              setType(t);
              resetPage();
            }}
            options={[
              { value: "all", label: "Todos" },
              { value: "inflow", label: "Entradas" },
              { value: "outflow", label: "Saídas" },
            ]}
          />
          <div className="flex-1" />
          <Button size="icon" onClick={exportCSV} title="Exportar CSV" aria-label="Exportar CSV">
            <Download />
          </Button>
        </div>

        {selectedRows.length > 0 && (
          <div className="flex items-center gap-2 border-y bg-brand-soft px-4 py-2 text-[12.5px] animate-pop-in">
            <span className="font-medium">
              {selectedRows.length} selecionado{selectedRows.length > 1 ? "s" : ""} · {formatBRL(selectedRows.reduce((s, m) => s + (m.type === "inflow" ? m.amount : -m.amount), 0))}
            </span>
            <div className="flex-1" />
            <Button
              onClick={() => {
                void setPaid(selectedRows.filter((m) => !m.paid).map((m) => m.id), true);
                setSelected(new Set());
              }}
            >
              <Check /> Marcar como efetuado
            </Button>
            <Button
              className="text-destructive-foreground"
              onClick={() => {
                void remove(selectedRows);
                setSelected(new Set());
              }}
            >
              <Trash2 /> Excluir
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())} aria-label="Limpar seleção">
              <X />
            </Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="w-10 py-2.5 pl-4">
                  <Checkbox
                    checked={allOnPage}
                    onCheckedChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        rows.forEach((m) => (allOnPage ? n.delete(m.id) : n.add(m.id)));
                        return n;
                      })
                    }
                    aria-label="Selecionar página"
                  />
                </th>
                <th className="w-32 py-2.5 font-medium">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("date")}>
                    Data <SortIcon active={sort.key === "date"} dir={sort.dir} />
                  </button>
                </th>
                <th className="py-2.5 font-medium">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("description")}>
                    Descrição <SortIcon active={sort.key === "description"} dir={sort.dir} />
                  </button>
                </th>
                <th className="py-2.5 font-medium">Cliente / Fornecedor</th>
                <th className="py-2.5 font-medium">Categoria</th>
                <th className="py-2.5 text-right font-medium">
                  <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("amount")}>
                    Valor <SortIcon active={sort.key === "amount"} dir={sort.dir} />
                  </button>
                </th>
                <th className="w-28 py-2.5 pl-4 font-medium">Status</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const contact = lookups.contact.get(m.contactId ?? "");
                const cat = lookups.cat.get(m.categoryId ?? "");
                const grp = cat && lookups.grp.get(cat.groupId);
                const st = statusOf(m, today);
                const isIn = m.type === "inflow";
                return (
                  <tr
                    key={m.id}
                    onClick={() => open({ kind: m.type, movement: m })}
                    style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}
                    className={cn(
                      "group cursor-pointer border-b transition-colors animate-row-in hover:bg-accent/60",
                      selected.has(m.id) && "bg-brand-soft/60 hover:bg-brand-soft",
                    )}
                  >
                    <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(m.id)}
                        onCheckedChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (n.has(m.id)) n.delete(m.id);
                            else n.add(m.id);
                            return n;
                          })
                        }
                        aria-label={`Selecionar ${m.description}`}
                      />
                    </td>
                    <td className="py-2.5">
                      <div className="tabular">{formatDate(m.date)}</div>
                      <div className="text-[11px] text-muted-foreground">{weekday(m.date)}</div>
                    </td>
                    <td className="max-w-[280px] py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-md transition-transform group-hover:scale-110",
                            isIn ? "bg-success-soft text-success-foreground" : "bg-destructive-soft text-destructive-foreground",
                          )}
                        >
                          {isIn ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{m.description || "—"}</div>
                          {m.totalInstallments > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              Parcela {m.installment}/{m.totalInstallments}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[240px] py-2.5 pr-3">
                      {contact ? (
                        <div className="flex items-center gap-2">
                          <ContactAvatar name={contact.name} />
                          <span className="truncate">{contact.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {cat ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ background: groupColor(grp?.color) }} />
                          <span className="truncate">{cat.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem categoria</span>
                      )}
                    </td>
                    <td className={cn("py-2.5 text-right font-semibold tabular", isIn ? "text-foreground" : "text-destructive-foreground")}>
                      {formatBRL(m.amount)}
                    </td>
                    <td className="py-2.5 pl-4">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <RowMenu
                        movement={m}
                        onEdit={() => open({ kind: m.type, movement: m })}
                        onTogglePaid={() => void setPaid([m.id], !m.paid)}
                        onDuplicate={() => void duplicate(m)}
                        onDelete={() => void remove([m])}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Search className="size-4" />
                    </div>
                    <div className="mt-3 text-[14px] font-medium">Nenhum lançamento encontrado</div>
                    <div className="text-[12.5px] text-muted-foreground">Mude o período, a busca ou os filtros.</div>
                    {(query || activeFilters > 0 || type !== "all") && (
                      <Button
                        className="mt-3"
                        onClick={() => {
                          setQuery("");
                          setFilters(EMPTY_FILTERS);
                          setType("all");
                        }}
                      >
                        <RotateCcw /> Limpar filtros
                      </Button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50">
                  <td colSpan={5} className="py-3 pl-4 text-[13px] font-semibold">
                    Total geral
                  </td>
                  <td className={cn("py-3 text-right font-semibold tabular", total < 0 && "text-destructive-foreground")}>
                    {total >= 0 ? "+ " : ""}
                    {formatBRL(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-muted-foreground">
          <span>
            {filtered.length} lançamento{filtered.length === 1 ? "" : "s"}
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
      )}
    </>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[12px] font-medium">{children}</span>;
}

function RowMenu({
  movement,
  onEdit,
  onTogglePaid,
  onDuplicate,
  onDelete,
}: {
  movement: Movement;
  onEdit: () => void;
  onTogglePaid: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const item =
    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-accent [&_svg]:size-3.5 [&_svg]:text-muted-foreground";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="rounded-md p-1 text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground group-hover:opacity-100" aria-label="Ações">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-xl border bg-popover p-1 shadow-xl animate-pop-in">
          <DropdownMenu.Item className={item} onSelect={onEdit}>
            <Pencil /> Editar
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onTogglePaid}>
            {movement.paid ? <RotateCcw /> : <Check />}
            {movement.paid ? "Desfazer baixa" : movement.type === "inflow" ? "Marcar como recebido" : "Marcar como pago"}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={onDuplicate}>
            <Copy /> Duplicar
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={cn(item, "text-destructive-foreground [&_svg]:text-destructive-foreground")} onSelect={onDelete}>
            <Trash2 /> Excluir
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FiltersPopover({
  value,
  count,
  onApply,
  accounts,
  groups,
  categories,
  contacts,
}: {
  value: Filters;
  count: number;
  onApply: (f: Filters) => void;
  accounts: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button className={cn(count > 0 && "border-brand/50 bg-brand-soft text-brand-foreground")}>
          <Filter /> Filtros
          {count > 0 && <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0">
        <div className="space-y-4 p-4">
          <div className="text-eyebrow uppercase text-muted-foreground">Conta e situação</div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <FieldLabel>Conta</FieldLabel>
              <select className={selectClass} value={draft.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">Todas as contas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel>Status</FieldLabel>
              <select className={selectClass} value={draft.status} onChange={(e) => set("status", e.target.value as Status)}>
                <option value="all">Todos</option>
                <option value="paid">Efetuados</option>
                <option value="open">Em aberto</option>
                <option value="overdue">Vencidos</option>
              </select>
            </label>
            <label className="col-span-2">
              <FieldLabel>Regime do período</FieldLabel>
              <select className={selectClass} value={draft.regime} onChange={(e) => set("regime", e.target.value as Filters["regime"])}>
                <option value="cash">Caixa (data do lançamento)</option>
                <option value="competence">Competência (mês de referência)</option>
              </select>
            </label>
          </div>
          <div className="text-eyebrow uppercase text-muted-foreground">Classificação</div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <FieldLabel>Grupo de categoria</FieldLabel>
              <select className={selectClass} value={draft.groupId} onChange={(e) => setDraft((d) => ({ ...d, groupId: e.target.value, categoryId: "" }))}>
                <option value="">Todos os grupos</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel>Categoria</FieldLabel>
              <select className={selectClass} value={draft.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Todas as categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2">
              <FieldLabel>Cliente / Fornecedor</FieldLabel>
              <select className={selectClass} value={draft.contactId} onChange={(e) => set("contactId", e.target.value)}>
                <option value="">Todos</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-eyebrow uppercase text-muted-foreground">Valor do lançamento</div>
          <div className="grid grid-cols-2 gap-3">
            {(["min", "max"] as const).map((k) => (
              <label key={k}>
                <FieldLabel>{k === "min" ? "Mínimo" : "Máximo"}</FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1.5 text-[12px] text-muted-foreground">R$</span>
                  <input inputMode="decimal" className={cn(selectClass, "pl-8")} value={draft[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d,]/g, ""))} />
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sticky bottom-0 z-10 rounded-b-xl border-t bg-card bg-[linear-gradient(var(--muted),var(--muted))] px-4 py-3">
          <button className="text-[12.5px] text-muted-foreground hover:text-foreground" onClick={() => setDraft(EMPTY_FILTERS)}>
            Limpar tudo
          </button>
          <div className="flex-1" />
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Aplicar filtros
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
