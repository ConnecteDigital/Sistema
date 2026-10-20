"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, Segmented } from "@/components/ui/primitives";
import { SECTION_LABEL, SECTION_ORDER } from "@/lib/finance";
import { deleteCategory, deleteGroup, insertCategory, insertGroup, updateCategory, updateGroup } from "@/lib/mutations";
import type { Category, CategoryGroup, DfcSection, MovementType } from "@/lib/types";
import { cn, GROUP_COLORS } from "@/lib/utils";
import { useFinance } from "./finance-provider";
import { useToast } from "./toast";

const inputClass = "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40";

/** Seções que fazem sentido para cada tipo (as demais continuam disponíveis em "outras"). */
const DEFAULT_SECTION: Record<MovementType, DfcSection> = { inflow: "operating_revenue", outflow: "fixed_expenses" };
const SECTION_HINT: Record<DfcSection, string> = {
  operating_revenue: "Vendas e serviços — o dinheiro que a operação gera.",
  variable_costs: "Impostos sobre venda, comissões, insumos: sobem junto com o faturamento.",
  fixed_expenses: "Aluguel, salários, sistemas: o custo para manter a empresa aberta.",
  financial_other: "Juros, tarifas bancárias, rendimentos e outros.",
  investments: "Compra de equipamentos, aplicações e bens.",
  partners_loans: "Retiradas e aportes de sócios, empréstimos tomados e pagos.",
};

function DialogFooter({
  message,
  busy,
  onClose,
  submitLabel,
  onDelete,
  deleteTitle,
  danger,
}: {
  message: string | null;
  busy: boolean;
  onClose: () => void;
  submitLabel: string;
  onDelete?: () => void;
  deleteTitle?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 sticky bottom-0 z-10 rounded-b-xl border-t bg-card bg-[linear-gradient(var(--muted),var(--muted))] px-5 py-3">
      {onDelete && (
        <Button type="button" variant="ghost" size="md" className="text-destructive-foreground" onClick={onDelete} title={deleteTitle} disabled={busy}>
          <Trash2 /> Excluir
        </Button>
      )}
      <span className="flex-1 text-[12px] text-destructive-foreground">{message}</span>
      <Button type="button" size="md" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} size="md" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} {submitLabel}
      </Button>
    </div>
  );
}

export function GroupDialog({ group, defaultType, onClose }: { group: CategoryGroup | null; defaultType: MovementType; onClose: () => void }) {
  const { data, reload } = useFinance();
  const toast = useToast();
  const [name, setName] = React.useState(group?.name ?? "");
  const [type, setType] = React.useState<MovementType>(group?.type ?? defaultType);
  const [section, setSection] = React.useState<DfcSection>(group?.section ?? DEFAULT_SECTION[defaultType]);
  const [color, setColor] = React.useState(group?.color ?? (defaultType === "inflow" ? "green" : "red"));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const catCount = group ? (data?.categories.filter((c) => c.groupId === group.id).length ?? 0) : 0;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      await reload();
      toast({ tone: "success", title: done });
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMessage("Dê um nome para o grupo.");
    const input = { name: name.trim(), type, section, color };
    run(
      () => (group ? updateGroup(group.id, input) : insertGroup({ ...input, position: data?.groups.length ?? 0 })),
      group ? "Grupo atualizado" : "Grupo criado",
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(540px,calc(100vw-2rem))]">
        <form onSubmit={save}>
          <div className="border-b px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold">{group ? "Editar grupo" : "Novo grupo"}</DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">Grupos juntam categorias parecidas e definem onde elas entram no demonstrativo.</DialogDescription>
          </div>
          <div className="space-y-4 p-5">
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">Nome do grupo</span>
              <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Despesas administrativas" />
            </label>
            <div className="space-y-1.5">
              <span className="block text-[13px] font-medium">Tipo</span>
              <Segmented
                value={type}
                onChange={(t) => {
                  setType(t);
                  if (!group) {
                    setSection(DEFAULT_SECTION[t]);
                    setColor(t === "inflow" ? "green" : "red");
                  }
                }}
                options={[
                  { value: "inflow", label: "Receita" },
                  { value: "outflow", label: "Despesa" },
                ]}
              />
              {group && catCount > 0 && type !== group.type && (
                <span className="block text-[11.5px] text-warning-foreground">As {catCount} categorias do grupo passam a contar como {type === "inflow" ? "receita" : "despesa"} nos filtros.</span>
              )}
            </div>
            <div className="space-y-1.5">
              <span className="block text-[13px] font-medium">Seção do demonstrativo</span>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {SECTION_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSection(s)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors",
                      section === s ? "border-primary bg-brand-soft font-medium" : "hover:bg-accent/60",
                    )}
                  >
                    {SECTION_LABEL[s]}
                  </button>
                ))}
              </div>
              <span className="block text-[11.5px] text-muted-foreground">{SECTION_HINT[section]}</span>
            </div>
            <div className="space-y-1.5">
              <span className="block text-[13px] font-medium">Cor</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(GROUP_COLORS).map(([key, hex]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    onClick={() => setColor(key)}
                    className={cn("grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110", color === key && "ring-2 ring-foreground/60")}
                    style={{ background: hex }}
                  >
                    {color === key && <Check className="size-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter
            message={message}
            busy={busy}
            onClose={onClose}
            submitLabel={group ? "Salvar" : "Criar grupo"}
            onDelete={
              group
                ? () => (catCount > 0 ? setMessage(`Mova ou exclua as ${catCount} categorias antes de excluir o grupo.`) : run(() => deleteGroup(group.id), "Grupo excluído"))
                : undefined
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDialog({ category, groupId, onClose }: { category: Category | null; groupId: string; onClose: () => void }) {
  const { data, reload } = useFinance();
  const toast = useToast();
  const [name, setName] = React.useState(category?.name ?? "");
  const [group, setGroup] = React.useState(category?.groupId ?? groupId);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [moveTo, setMoveTo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const groups = React.useMemo(() => [...(data?.groups ?? [])].sort((a, b) => a.position - b.position), [data]);
  const currentType = groups.find((g) => g.id === group)?.type;
  const usage = React.useMemo(() => {
    if (!category || !data) return { movements: 0, recurrences: 0 };
    return {
      movements: data.movements.filter((m) => m.categoryId === category.id).length,
      recurrences: data.recurrences.filter((r) => r.categoryId === category.id).length,
    };
  }, [category, data]);
  const destinations = React.useMemo(
    () =>
      groups
        .filter((g) => g.type === currentType)
        .flatMap((g) =>
          (data?.categories ?? [])
            .filter((c) => c.groupId === g.id && c.id !== category?.id)
            .sort((a, b) => a.position - b.position)
            .map((c) => ({ id: c.id, label: `${g.name} › ${c.name}` })),
        ),
    [groups, data, currentType, category],
  );

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      await reload();
      toast({ tone: "success", title: done });
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (confirmDelete && category) return run(() => deleteCategory(category.id, moveTo || null), "Categoria excluída");
    if (!name.trim()) return setMessage("Dê um nome para a categoria.");
    if (!group) return setMessage("Escolha o grupo.");
    const position = data?.categories.filter((c) => c.groupId === group).length ?? 0;
    run(
      () =>
        category
          ? updateCategory(category.id, { name: name.trim(), groupId: group, ...(group !== category.groupId ? { position } : {}) })
          : insertCategory({ name: name.trim(), groupId: group, position }),
      category ? "Categoria atualizada" : "Categoria criada",
    );
  }

  const used = usage.movements + usage.recurrences > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(480px,calc(100vw-2rem))]">
        <form onSubmit={save}>
          <div className="border-b px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold">{confirmDelete ? "Excluir categoria" : category ? "Editar categoria" : "Nova categoria"}</DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {confirmDelete ? `“${category?.name}” será removida do plano.` : "Categorias classificam cada entrada e saída."}
            </DialogDescription>
          </div>
          {confirmDelete ? (
            <div className="space-y-3 p-5 text-[13px]">
              {used ? (
                <>
                  <p>
                    Ela está em <b>{usage.movements}</b> lançamento{usage.movements === 1 ? "" : "s"}
                    {usage.recurrences > 0 && (
                      <>
                        {" "}
                        e <b>{usage.recurrences}</b> recorrência{usage.recurrences === 1 ? "" : "s"}
                      </>
                    )}
                    . Para onde eles vão?
                  </p>
                  <select className={inputClass} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">Deixar sem categoria</option>
                    {destinations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p>Nenhum lançamento usa esta categoria.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3.5 p-5">
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium">Nome da categoria</span>
                <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Tráfego pago" />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium">Grupo</span>
                <select className={inputClass} value={group} onChange={(e) => setGroup(e.target.value)}>
                  {(["inflow", "outflow"] as const).map((t) => (
                    <optgroup key={t} label={t === "inflow" ? "Receitas" : "Despesas"}>
                      {groups
                        .filter((g) => g.type === t)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                {category && used && (
                  <span className="block text-[11.5px] text-muted-foreground">
                    Usada em {usage.movements} lançamentos{usage.recurrences ? ` e ${usage.recurrences} recorrências` : ""}. Renomear vale para todos.
                  </span>
                )}
              </label>
            </div>
          )}
          <DialogFooter
            message={message}
            busy={busy}
            onClose={confirmDelete ? () => setConfirmDelete(false) : onClose}
            submitLabel={confirmDelete ? "Excluir categoria" : category ? "Salvar" : "Criar categoria"}
            onDelete={category && !confirmDelete ? () => setConfirmDelete(true) : undefined}
            danger={confirmDelete}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
