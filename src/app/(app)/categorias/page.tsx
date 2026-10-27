"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown, GripVertical, List, Pencil, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { CategoryDialog, GroupDialog } from "@/components/category-dialogs";
import { PeriodPicker } from "@/components/filters";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CountPill, Segmented } from "@/components/ui/primitives";
import { inRange } from "@/lib/dates";
import { SECTION_LABEL } from "@/lib/finance";
import { formatBRL } from "@/lib/format";
import { reorder, updateCategory } from "@/lib/mutations";
import type { Category, CategoryGroup, FinanceData, MovementType } from "@/lib/types";
import { cn, groupColor } from "@/lib/utils";

interface CatStats {
  paid: number;
  open: number;
  count: number;
}

type Editing = { kind: "group"; group: CategoryGroup | null; type: MovementType } | { kind: "category"; category: Category | null; groupId: string } | null;
type Drag = { kind: "group"; id: string; type: MovementType } | { kind: "category"; id: string; type: MovementType } | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CategoriasPage() {
  const { data, error, range, accountIds, applyLocal, reload } = useFinance();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"all" | MovementType>("all");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<Editing>(null);
  const [drag, setDrag] = React.useState<Drag>(null);
  const [over, setOver] = React.useState<string | null>(null);

  // Valores do período por categoria (regime de caixa; pagos e em aberto separados).
  const stats = React.useMemo(() => {
    const map = new Map<string, CatStats>();
    let uncategorized = 0;
    let inflow = 0;
    let outflow = 0;
    if (!data) return { map, uncategorized, inflow, outflow };
    for (const m of data.movements) {
      if (!inRange(m.date, range) || (accountIds.length && !accountIds.includes(m.bankAccountId))) continue;
      if (!m.categoryId) {
        uncategorized++;
        continue;
      }
      const s = map.get(m.categoryId) ?? { paid: 0, open: 0, count: 0 };
      s.count++;
      if (m.paid) s.paid += m.amount;
      else s.open += m.amount;
      map.set(m.categoryId, s);
      if (m.paid) {
        if (m.type === "inflow") inflow += m.amount;
        else outflow += m.amount;
      }
    }
    return { map, uncategorized, inflow: round2(inflow), outflow: round2(outflow) };
  }, [data, range, accountIds]);

  const tree = React.useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return [...data.groups]
      .sort((a, b) => a.position - b.position)
      .filter((g) => typeFilter === "all" || g.type === typeFilter)
      .map((g) => {
        const all = data.categories.filter((c) => c.groupId === g.id).sort((a, b) => a.position - b.position);
        const groupMatch = !q || g.name.toLowerCase().includes(q);
        const categories = groupMatch ? all : all.filter((c) => c.name.toLowerCase().includes(q));
        const totals = all.reduce(
          (t, c) => {
            const s = stats.map.get(c.id);
            return s ? { paid: t.paid + s.paid, open: t.open + s.open, count: t.count + s.count } : t;
          },
          { paid: 0, open: 0, count: 0 },
        );
        return { group: g, categories, totalCategories: all.length, totals, visible: groupMatch || categories.length > 0 };
      })
      .filter((x) => x.visible);
  }, [data, query, typeFilter, stats]);

  if (!data) return <LoadingState error={error} />;

  const result = round2(stats.inflow - stats.outflow);
  const allCollapsed = tree.length > 0 && tree.every((t) => collapsed.has(t.group.id));
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ---------- Arrastar para reordenar ---------- */

  async function persist(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      toast({ tone: "error", title: err instanceof Error ? `Não foi possível salvar a ordem: ${err.message}` : "Não foi possível salvar a ordem" });
      await reload();
    }
  }

  function dropGroup(targetId: string) {
    if (drag?.kind !== "group" || drag.id === targetId || !data) return;
    const ordered = [...data.groups].sort((a, b) => a.position - b.position).map((g) => g.id);
    const from = ordered.indexOf(drag.id);
    ordered.splice(from, 1);
    ordered.splice(ordered.indexOf(targetId), 0, drag.id);
    applyLocal((d) => ({ ...d, groups: d.groups.map((g) => ({ ...g, position: ordered.indexOf(g.id) })) }));
    persist(() => reorder("category_groups", ordered));
  }

  /** Solta a categoria antes de `targetId` (ou no fim do grupo, se `targetId` for nulo). */
  function dropCategory(groupId: string, targetId: string | null) {
    if (drag?.kind !== "category" || drag.id === targetId || !data) return;
    const target = data.groups.find((g) => g.id === groupId);
    if (!target || target.type !== drag.type) {
      toast({ tone: "error", title: "Categoria de receita só vai para grupo de receita (e despesa para despesa)." });
      return;
    }
    const moving = data.categories.find((c) => c.id === drag.id)!;
    const ordered = data.categories
      .filter((c) => c.groupId === groupId && c.id !== drag.id)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.id);
    const at = targetId ? ordered.indexOf(targetId) : ordered.length;
    ordered.splice(at < 0 ? ordered.length : at, 0, drag.id);
    applyLocal((d: FinanceData) => ({
      ...d,
      categories: d.categories.map((c) => (ordered.includes(c.id) ? { ...c, groupId, position: ordered.indexOf(c.id) } : c)),
    }));
    persist(async () => {
      if (moving.groupId !== groupId) await updateCategory(moving.id, { groupId });
      await reorder("categories", ordered);
    });
    if (moving.groupId !== groupId) toast({ tone: "success", title: `“${moving.name}” agora está em ${target.name}` });
  }

  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };

  const columns = (["inflow", "outflow"] as const).filter((t) => typeFilter === "all" || typeFilter === t);

  return (
    <>
      <PageHeader
        title="Plano de"
        accent="categorias"
        description="Como cada entrada e saída é classificada — e onde ela aparece no demonstrativo."
        actions={
          <>
            <PeriodPicker />
            <Button variant="primary" size="md" onClick={() => setEditing({ kind: "group", group: null, type: typeFilter === "inflow" ? "inflow" : "outflow" })}>
              <Plus /> Novo grupo
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <HeroCard label="Resultado do período" amount={result} sub="Receitas − despesas pagas" />
        <KpiCard label="Receitas" tone="success" amount={stats.inflow} sub="Pagas, por categoria" active={typeFilter === "inflow"} onClick={() => setTypeFilter((t) => (t === "inflow" ? "all" : "inflow"))} />
        <KpiCard label="Despesas" tone="danger" amount={stats.outflow} sub="Pagas, por categoria" active={typeFilter === "outflow"} onClick={() => setTypeFilter((t) => (t === "outflow" ? "all" : "outflow"))} />
        <KpiCard
          label="Sem categoria"
          tone={stats.uncategorized ? "warning" : "neutral"}
          value={String(stats.uncategorized)}
          sub={`${data.groups.length} grupos · ${data.categories.length} categorias`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo ou categoria"
            className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-7 text-[13px] outline-none focus:ring-2 focus:ring-ring/40"
          />
          {query && (
            <button className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")} aria-label="Limpar busca">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Segmented
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "Todas" },
            { value: "inflow", label: "Receitas" },
            { value: "outflow", label: "Despesas" },
          ]}
        />
        <div className="flex-1" />
        <Button size="md" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(tree.map((t) => t.group.id)))}>
          {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} {allCollapsed ? "Expandir tudo" : "Recolher tudo"}
        </Button>
      </div>

      <div className={cn("mt-3 grid items-start gap-3", columns.length === 2 && "lg:grid-cols-2")}>
        {columns.map((type) => {
          const groups = tree.filter((t) => t.group.type === type);
          const columnTotal = type === "inflow" ? stats.inflow : stats.outflow;
          return (
            <section key={type} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[13px] font-semibold">
                  {type === "inflow" ? "Receitas" : "Despesas"} <span className="font-normal text-muted-foreground">· {groups.length} grupo{groups.length === 1 ? "" : "s"}</span>
                </h2>
                <button className="inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline" onClick={() => setEditing({ kind: "group", group: null, type })}>
                  <Plus className="size-3.5" /> Grupo de {type === "inflow" ? "receita" : "despesa"}
                </button>
              </div>
              {groups.length === 0 && <Card className="p-6 text-center text-[13px] text-muted-foreground">Nenhum grupo encontrado.</Card>}
              {groups.map(({ group: g, categories, totalCategories, totals }, gi) => {
                const color = groupColor(g.color);
                const isCollapsed = collapsed.has(g.id) && !query;
                const share = columnTotal > 0 ? (totals.paid / columnTotal) * 100 : 0;
                return (
                  <Card
                    key={g.id}
                    className={cn(
                      "overflow-hidden animate-row-in transition-[box-shadow,opacity]",
                      drag?.id === g.id && "opacity-50",
                      over === g.id && drag?.kind === "group" && "ring-2 ring-primary/50",
                      over === g.id && drag?.kind === "category" && "ring-2 ring-primary/30",
                    )}
                    style={{ animationDelay: `${gi * 40}ms` }}
                    onDragOver={(e) => {
                      if (!drag || drag.type !== g.type) return;
                      e.preventDefault();
                      setOver(g.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === g.id ? null : o));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag?.kind === "group") dropGroup(g.id);
                      else dropCategory(g.id, null);
                      endDrag();
                    }}
                  >
                    <div className="flex items-center gap-2 border-l-[3px] py-2.5 pl-2 pr-3" style={{ borderLeftColor: color }}>
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          setDrag({ kind: "group", id: g.id, type: g.type });
                        }}
                        onDragEnd={endDrag}
                        className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                        title="Arraste para reordenar"
                      >
                        <GripVertical className="size-4" />
                      </span>
                      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(g.id)}>
                        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-semibold">{g.name}</span>
                            <CountPill>{totalCategories}</CountPill>
                          </div>
                          <div className="truncate text-[11.5px] text-muted-foreground">{SECTION_LABEL[g.section]}</div>
                        </div>
                      </button>
                      <div className="text-right">
                        <div className={cn("text-[13.5px] font-semibold tabular", g.type === "inflow" ? "text-success-foreground" : "text-destructive-foreground")}>{formatBRL(round2(totals.paid))}</div>
                        <div className="text-[11px] text-muted-foreground tabular">{share > 0 ? `${share.toFixed(1).replace(".", ",")}% das ${type === "inflow" ? "receitas" : "despesas"}` : "—"}</div>
                      </div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" title="Nova categoria" aria-label="Nova categoria" onClick={() => setEditing({ kind: "category", category: null, groupId: g.id })}>
                          <Plus />
                        </Button>
                        <Button variant="ghost" size="icon" title="Editar grupo" aria-label="Editar grupo" onClick={() => setEditing({ kind: "group", group: g, type: g.type })}>
                          <Pencil />
                        </Button>
                      </div>
                    </div>
                    {!isCollapsed && (
                      <div className="border-t">
                        {categories.length === 0 && (
                          <button
                            className="block w-full px-10 py-3 text-left text-[12.5px] text-muted-foreground hover:bg-accent/40"
                            onClick={() => setEditing({ kind: "category", category: null, groupId: g.id })}
                          >
                            Nenhuma categoria. <span className="text-primary">Adicionar</span>
                          </button>
                        )}
                        {categories.map((c, ci) => {
                          const s = stats.map.get(c.id);
                          const pct = totals.paid > 0 && s ? (s.paid / totals.paid) * 100 : 0;
                          return (
                            <div
                              key={c.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.effectAllowed = "move";
                                setDrag({ kind: "category", id: c.id, type: g.type });
                              }}
                              onDragEnd={endDrag}
                              onDragOver={(e) => {
                                if (drag?.kind !== "category" || drag.type !== g.type) return;
                                e.preventDefault();
                                e.stopPropagation();
                                setOver(c.id);
                              }}
                              onDrop={(e) => {
                                if (drag?.kind !== "category") return;
                                e.preventDefault();
                                e.stopPropagation();
                                dropCategory(g.id, c.id);
                                endDrag();
                              }}
                              className={cn(
                                "group/row relative flex items-center gap-2 border-b py-2 pl-2 pr-3 text-[13px] last:border-b-0 hover:bg-accent/40 animate-row-in",
                                drag?.id === c.id && "opacity-40",
                                over === c.id && "before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
                              )}
                              style={{ animationDelay: `${gi * 40 + ci * 15}ms` }}
                            >
                              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/0 group-hover/row:text-muted-foreground/50" />
                              <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                              <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => setEditing({ kind: "category", category: c, groupId: g.id })}>
                                {c.name}
                              </button>
                              <div className="hidden w-24 sm:block" title={`${pct.toFixed(1)}% do grupo`}>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full origin-left rounded-full animate-[bar-grow_0.7s_cubic-bezier(0.16,1,0.3,1)_both]" style={{ width: `${pct}%`, background: color }} />
                                </div>
                              </div>
                              <span className="w-10 text-right text-[11.5px] text-muted-foreground tabular" title="Lançamentos no período">
                                {s?.count ?? 0}
                              </span>
                              <div className="w-40 whitespace-nowrap text-right">
                                <div className="font-medium tabular">{formatBRL(round2(s?.paid ?? 0))}</div>
                                {!!s?.open && <div className="text-[11px] text-warning-foreground tabular">+ {formatBRL(round2(s.open))} a vencer</div>}
                              </div>
                              <div className="flex opacity-0 transition-opacity group-hover/row:opacity-100">
                                <Button variant="ghost" size="icon" asChild title="Ver lançamentos">
                                  <Link href={`/movimentos?categoria=${c.id}`} aria-label="Ver lançamentos">
                                    <List />
                                  </Link>
                                </Button>
                                <Button variant="ghost" size="icon" title="Editar" aria-label="Editar" onClick={() => setEditing({ kind: "category", category: c, groupId: g.id })}>
                                  <Pencil />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </section>
          );
        })}
      </div>

      {editing?.kind === "group" && <GroupDialog group={editing.group} defaultType={editing.type} onClose={() => setEditing(null)} />}
      {editing?.kind === "category" && <CategoryDialog category={editing.category} groupId={editing.groupId} onClose={() => setEditing(null)} />}
    </>
  );
}
