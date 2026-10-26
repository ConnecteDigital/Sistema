"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, CircleAlert, Download, Mail, Phone, Plus, Search, X } from "lucide-react";
import * as React from "react";
import { ContactAvatar } from "@/components/avatars";
import { ContactDialog } from "@/components/contact-dialog";
import { PeriodPicker } from "@/components/filters";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card, Segmented } from "@/components/ui/primitives";
import { maskTaxId, taxIdStatus } from "@/lib/br";
import { addMonths, endOfMonth, inRange, startOfMonth } from "@/lib/dates";
import { formatBRL, formatDate } from "@/lib/format";
import type { Contact, DateRange } from "@/lib/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
type SortKey = "name" | "inflow" | "outflow" | "volume" | "last";
type Kind = "all" | "customer" | "supplier" | "nodoc" | "archived";

interface Row {
  contact: Contact;
  inflow: number;
  outflow: number;
  last: string | null;
  docStatus: ReturnType<typeof taxIdStatus>;
}

function SortHead({ k, sort, onSort, children, right }: { k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void; children: React.ReactNode; right?: boolean }) {
  return (
    <button className={cn("inline-flex items-center gap-1 hover:text-foreground", right && "flex-row-reverse")} onClick={() => onSort(k)}>
      {children}
      {sort.key !== k ? <ArrowUpDown className="size-3 opacity-40" /> : sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
    </button>
  );
}

export default function ContatosPage() {
  const { data, error, today } = useFinance();
  const [range, setRange] = React.useState<DateRange | null>(null);
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<Kind>("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = React.useState(0);
  const [editing, setEditing] = React.useState<Contact | "new" | null>(null);
  // Cadastro recém-criado: a lista vai até ele e o destaca.
  const [created, setCreated] = React.useState<string | null>(null);
  const onCreated = (id: string, name: string) => {
    setKind("all");
    setQuery(name);
    setPage(0);
    setCreated(id);
    setTimeout(() => setCreated((c) => (c === id ? null : c)), 4000);
  };
  const period = React.useMemo(
    () => range ?? (today ? { start: startOfMonth(addMonths(today, -11)), end: endOfMonth(today) } : { start: "", end: "" }),
    [range, today],
  );

  const rows = React.useMemo<Row[]>(() => {
    if (!data) return [];
    const stats = new Map<string, { inflow: number; outflow: number; last: string | null }>();
    for (const m of data.movements) {
      if (!m.contactId) continue;
      const s = stats.get(m.contactId) ?? { inflow: 0, outflow: 0, last: null };
      if (inRange(m.date, period) && m.paid) {
        if (m.type === "inflow") s.inflow += m.amount;
        else s.outflow += m.amount;
      }
      if (m.paid && (!s.last || m.date > s.last)) s.last = m.date;
      stats.set(m.contactId, s);
    }
    return data.contacts.map((c) => {
      const s = stats.get(c.id) ?? { inflow: 0, outflow: 0, last: null };
      return { contact: c, inflow: Math.round(s.inflow * 100) / 100, outflow: Math.round(s.outflow * 100) / 100, last: s.last, docStatus: taxIdStatus(c.taxId) };
    });
  }, [data, period]);

  const live = rows.filter((r) => !r.contact.deleted);
  const counts = {
    customers: live.filter((r) => r.contact.isCustomer).length,
    suppliers: live.filter((r) => r.contact.isSupplier).length,
    both: live.filter((r) => r.contact.isCustomer && r.contact.isSupplier).length,
    noDoc: live.filter((r) => r.contact.isCustomer && (r.docStatus === "empty" || r.docStatus === "invalid")).length,
    active: live.filter((r) => r.inflow || r.outflow).length,
    archived: rows.length - live.length,
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = rows.filter((r) => {
      const c = r.contact;
      if (kind === "archived" ? !c.deleted : c.deleted) return false;
      if (kind === "customer" && !c.isCustomer) return false;
      if (kind === "supplier" && !c.isSupplier) return false;
      if (kind === "nodoc" && !(c.isCustomer && (r.docStatus === "empty" || r.docStatus === "invalid"))) return false;
      if (q) {
        const hay = [c.name, c.email, c.phone, c.address.city].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q) && !(digits.length >= 3 && (c.taxId ?? "").includes(digits))) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.contact.name.localeCompare(b.contact.name, "pt-BR") * dir;
        case "inflow":
          return (a.inflow - b.inflow) * dir;
        case "outflow":
          return (a.outflow - b.outflow) * dir;
        case "volume":
          return (a.inflow + a.outflow - b.inflow - b.outflow) * dir;
        case "last":
          return (a.last ?? "").localeCompare(b.last ?? "") * dir;
      }
    });
  }, [rows, query, kind, sort]);

  if (!data || !today) return <LoadingState error={error} />;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const onSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
    setPage(0);
  };
  const totalIn = live.reduce((s, r) => s + r.inflow, 0);
  const totalOut = live.reduce((s, r) => s + r.outflow, 0);

  const exportCSV = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = filtered.map((r) =>
      [r.contact.name, r.contact.taxId ?? "", r.contact.email ?? "", r.contact.phone ?? "", r.contact.address.city ?? "", r.contact.address.state ?? "", r.inflow.toFixed(2).replace(".", ","), r.outflow.toFixed(2).replace(".", ",")]
        .map(esc)
        .join(";"),
    );
    const csv = "﻿" + ["Nome;CPF/CNPJ;E-mail;Telefone;Cidade;UF;Entradas;Saídas", ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "clientes-e-fornecedores.csv" }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Clientes e"
        accent="fornecedores"
        description="Pessoas e empresas do seu fluxo financeiro."
        actions={
          <Button variant="primary" size="md" onClick={() => setEditing("new")}>
            <Plus /> Novo cadastro
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <HeroCard label="Total" count={live.length} sub={`${counts.active} com movimento no período`} onClick={kind !== "all" ? () => setKind("all") : undefined} dimmed={kind !== "all"} />
        <KpiCard label="Clientes" tone="success" value={String(counts.customers)} sub={`${formatBRL(totalIn)} recebidos`} active={kind === "customer"} dimmed={kind !== "all" && kind !== "customer"} onClick={() => setKind((k) => (k === "customer" ? "all" : "customer"))} />
        <KpiCard label="Fornecedores" tone="danger" value={String(counts.suppliers)} sub={`${formatBRL(totalOut)} pagos`} active={kind === "supplier"} dimmed={kind !== "all" && kind !== "supplier"} onClick={() => setKind((k) => (k === "supplier" ? "all" : "supplier"))} />
        <KpiCard label="Ambos" tone="info" value={String(counts.both)} sub="Cadastros nos dois papéis" />
        <KpiCard
          label="Sem CPF/CNPJ"
          tone="warning"
          icon={<CircleAlert />}
          value={String(counts.noDoc)}
          sub="Clientes que ainda não podem receber nota"
          active={kind === "nodoc"}
          dimmed={kind !== "all" && kind !== "nodoc"}
          onClick={() => setKind((k) => (k === "nodoc" ? "all" : "nodoc"))}
        />
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <PeriodPicker value={period} onChange={setRange} />
          <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar nome, e-mail, CPF/CNPJ, cidade…"
              className="h-7 w-full rounded-[7px] border bg-card pl-8 pr-7 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-muted-foreground" aria-label="Limpar">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Segmented
            value={kind === "archived" ? "archived" : "active"}
            onChange={(v) => {
              setKind(v === "archived" ? "archived" : "all");
              setPage(0);
            }}
            options={[
              { value: "active", label: "Ativos" },
              { value: "archived", label: `Arquivados (${counts.archived})` },
            ]}
          />
          <div className="flex-1" />
          <Button size="icon" onClick={exportCSV} title="Exportar CSV" aria-label="Exportar CSV">
            <Download />
          </Button>
        </div>
        <p className="px-4 pb-2 text-[12px] text-muted-foreground">O período define os valores somados (só o que foi baixado) — a lista traz todos os cadastros.</p>
        <div className="overflow-x-auto">
          <table key={kind} className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="py-2.5 pl-4 font-medium">
                  <SortHead k="name" sort={sort} onSort={onSort}>Nome</SortHead>
                </th>
                <th className="py-2.5 font-medium">Contato</th>
                <th className="py-2.5 font-medium">CPF / CNPJ</th>
                <th className="py-2.5 text-right font-medium">
                  <SortHead k="inflow" sort={sort} onSort={onSort} right>Entradas</SortHead>
                </th>
                <th className="py-2.5 text-right font-medium">
                  <SortHead k="outflow" sort={sort} onSort={onSort} right>Saídas</SortHead>
                </th>
                <th className="py-2.5 text-right font-medium">
                  <SortHead k="volume" sort={sort} onSort={onSort} right>Volume</SortHead>
                </th>
                <th className="py-2.5 pl-6 pr-4 font-medium">
                  <SortHead k="last" sort={sort} onSort={onSort}>Última atividade</SortHead>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const c = r.contact;
                return (
                  <tr key={c.id} onClick={() => setEditing(c)} style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }} className={cn("group cursor-pointer border-b animate-row-in hover:bg-accent/60", c.id === created && "bg-brand-soft animate-flash")}>
                    <td className="max-w-[300px] py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2.5">
                        <ContactAvatar name={c.name} className="size-7 text-[10px]" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="flex gap-1">
                            {c.isCustomer && <span className="text-[10.5px] font-medium text-success-foreground">Cliente</span>}
                            {c.isSupplier && <span className="text-[10.5px] font-medium text-info-foreground">Fornecedor</span>}
                            {c.address.city && <span className="text-[10.5px] text-muted-foreground">· {c.address.city}/{c.address.state}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-muted-foreground">
                      {c.phone && <div className="flex items-center gap-1"><Phone className="size-3" /> {c.phone}</div>}
                      {c.email && <div className="flex max-w-[200px] items-center gap-1 truncate"><Mail className="size-3 shrink-0" /> {c.email}</div>}
                      {!c.phone && !c.email && "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.docStatus === "empty" ? (
                        c.isCustomer ? <Badge tone="warning">Falta CPF/CNPJ</Badge> : <span className="text-muted-foreground">—</span>
                      ) : r.docStatus === "invalid" ? (
                        <Badge tone="danger">Inválido</Badge>
                      ) : (
                        <span className="text-[12.5px] tabular">{maskTaxId(c.taxId ?? "")}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-medium text-success-foreground tabular">{r.inflow ? formatBRL(r.inflow) : "—"}</td>
                    <td className="py-2.5 text-right font-medium text-destructive-foreground tabular">{r.outflow ? formatBRL(r.outflow) : "—"}</td>
                    <td className="py-2.5 text-right font-semibold tabular">{r.inflow + r.outflow ? formatBRL(r.inflow + r.outflow) : "—"}</td>
                    <td className="py-2.5 pl-6 pr-4 text-muted-foreground tabular">{r.last ? formatDate(r.last) : "—"}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-[13px] text-muted-foreground">
                    Nenhum cadastro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-muted-foreground">
          <span>
            {filtered.length} cadastro{filtered.length === 1 ? "" : "s"}
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

      {editing && <ContactDialog contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} onCreated={onCreated} />}
    </>
  );
}
