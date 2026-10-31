"use client";

import { ArrowLeftRight, CalendarDays, Info, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/primitives";
import { addDays, addMonths } from "@/lib/dates";
import { applyAmountToNext, deleteMovements, insertMovements, insertRecurrence, insertTransfer, listAmountChanges, logAmountChange, updateMovement, type AmountChange } from "@/lib/mutations";
import type { ISODate, Movement, MovementType, RecurrencePeriod } from "@/lib/types";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ContactPicker } from "./contact-picker";
import { useFinance } from "./finance-provider";
import { useToast } from "./toast";

type Kind = MovementType | "transfer";
interface OpenOptions {
  kind: Kind;
  /** Lançamento a editar (omitir para criar um novo). */
  movement?: Movement;
  /** Abre já na aba Recorrência, com repetição mensal. */
  recurring?: boolean;
}

const DialogCtx = React.createContext<{ open: (o: OpenOptions) => void } | null>(null);

export function useMovementDialog() {
  const ctx = React.use(DialogCtx);
  if (!ctx) throw new Error("useMovementDialog fora do MovementDialogHost");
  return ctx;
}

export function MovementDialogHost({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ open: boolean; kind: Kind; movement?: Movement; recurring?: boolean; key: number }>({ open: false, kind: "inflow", key: 0 });
  const ctx = React.useMemo(
    () => ({ open: (o: OpenOptions) => setState((s) => ({ open: true, kind: o.movement?.type ?? o.kind, movement: o.movement, recurring: o.recurring, key: s.key + 1 })) }),
    [],
  );
  return (
    <DialogCtx value={ctx}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
        <DialogContent aria-describedby={undefined}>
          <MovementForm key={state.key} initialKind={state.kind} editing={state.movement} recurring={state.recurring} onDone={() => setState((s) => ({ ...s, open: false }))} />
        </DialogContent>
      </Dialog>
    </DialogCtx>
  );
}

const PERIODS: { value: RecurrencePeriod | "none"; label: string }[] = [
  { value: "none", label: "Não repetir" },
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";

const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Máscara de dinheiro estilo app de banco: os dígitos digitados viram centavos. */
function maskMoney(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  return digits ? money.format(Number(digits) / 100) : "";
}
const parseMoney = (s: string) => Number(s.replace(/\D/g, "") || 0) / 100;

/** Próximas datas de uma série (inclui a primeira). */
function occurrences(start: ISODate, period: RecurrencePeriod, count: number): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < count; i++) {
    if (period === "daily") out.push(addDays(start, i));
    else if (period === "weekly") out.push(addDays(start, 7 * i));
    else if (period === "biweekly") out.push(addDays(start, 14 * i));
    else out.push(addMonths(start, i * { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[period]));
  }
  return out;
}
/** Quantos lançamentos gerar adiantado para uma série sem fim (~12 meses). */
const HORIZON: Record<RecurrencePeriod, number> = { daily: 31, weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };

function MovementForm({ initialKind, editing, recurring, onDone }: { initialKind: Kind; editing?: Movement; recurring?: boolean; onDone: () => void }) {
  const { data, today, reload, applyLocal } = useFinance();
  const toast = useToast();
  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [tab, setTab] = React.useState<"dados" | "recorrencia" | "adicionais" | "documentos">(recurring ? "recorrencia" : "dados");
  const [amount, setAmount] = React.useState(editing ? money.format(editing.amount) : "");
  const [date, setDate] = React.useState(editing?.date ?? today);
  const [paid, setPaid] = React.useState(editing?.paid ?? false);
  // Baixa com valor diferente (pagamento parcial, desconto ou juros) — só ao baixar algo que estava em aberto.
  const [received, setReceived] = React.useState("");
  const [shortfall, setShortfall] = React.useState<"partial" | "discount">("partial");
  const [remainderDate, setRemainderDate] = React.useState(editing?.date ?? today);
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [categoryId, setCategoryId] = React.useState(editing?.categoryId ?? "");
  const [accountId, setAccountId] = React.useState(editing?.bankAccountId ?? (data?.accounts.length === 1 ? data.accounts[0].id : ""));
  const [destAccountId, setDestAccountId] = React.useState("");
  const [competence, setCompetence] = React.useState<string | null>(editing && editing.competenceDate !== editing.date ? editing.competenceDate : null);
  const [contactId, setContactId] = React.useState(editing?.contactId ?? "");
  const [period, setPeriod] = React.useState<RecurrencePeriod | "none">(recurring ? "monthly" : "none");
  const [repeatCount, setRepeatCount] = React.useState("");
  const [documentNumber, setDocumentNumber] = React.useState(editing?.documentNumber ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  // Mudou o valor de algo que se repete: vale só para este mês ou também para os próximos?
  const [scope, setScope] = React.useState<"only_this" | "this_and_next">("only_this");
  const [history, setHistory] = React.useState<AmountChange[] | null>(null);

  const isIn = kind === "inflow";
  const groupType = new Map(data?.groups.map((g) => [g.id, g]) ?? []);
  const categories = (data?.categories ?? [])
    .filter((c) => kind !== "transfer" && groupType.get(c.groupId)?.type === kind)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const accounts = (data?.accounts ?? []).filter((a) => a.active);

  const settling = !!editing && !editing.paid && paid && kind !== "transfer";
  const receivedValue = received ? parseMoney(received) : parseMoney(amount);
  const settleDiff = Math.round((parseMoney(amount) - receivedValue) * 100) / 100;

  const newValue = parseMoney(amount);
  const amountChanged = !!editing && kind !== "transfer" && newValue > 0 && Math.abs(newValue - editing.amount) >= 0.005;
  // Próximos lançamentos em aberto da mesma série (ou, sem série, do mesmo cliente, categoria e descrição).
  const followers = React.useMemo(() => {
    if (!editing || !data) return [];
    return data.movements
      .filter(
        (m) =>
          m.id !== editing.id &&
          !m.paid &&
          m.type === editing.type &&
          m.date > editing.date &&
          (editing.recurrenceId
            ? m.recurrenceId === editing.recurrenceId
            : !!editing.contactId && !m.recurrenceId && m.contactId === editing.contactId && m.categoryId === editing.categoryId && m.description === editing.description),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, editing]);

  React.useEffect(() => {
    if (tab !== "adicionais" || !editing || history) return;
    let cancelled = false;
    void listAmountChanges(editing.id, editing.recurrenceId).then((h) => !cancelled && setHistory(h));
    return () => {
      cancelled = true;
    };
  }, [tab, editing, history]);

  const accent = kind === "inflow" ? "bg-success" : kind === "outflow" ? "bg-destructive" : "bg-info";
  const noun = kind === "inflow" ? "recebimento" : kind === "outflow" ? "pagamento" : "transferência";

  async function submit(keepOpen: boolean) {
    setMessage(null);
    const value = parseMoney(amount);
    if (value <= 0) return setMessage("Informe o valor.");
    if (kind === "transfer") {
      if (!accountId || !destAccountId || accountId === destAccountId) return setMessage("Escolha contas de origem e destino diferentes.");
    } else if (!description.trim() || !categoryId || !accountId) {
      return setMessage("Preencha descrição, categoria e conta.");
    }
    setSaving(true);
    try {
      if (kind === "transfer") {
        await insertTransfer({ date, amount: value, description: description.trim() || "Transferência", sourceAccountId: accountId, destinationAccountId: destAccountId });
      } else {
        const base = {
          type: kind,
          date,
          competenceDate: competence ?? date,
          dueDate: date,
          amount: value,
          description: description.trim(),
          bankAccountId: accountId,
          categoryId,
          contactId: contactId || null,
          paid,
          documentNumber: documentNumber.trim() || null,
          notes: notes.trim() || null,
        };
        const settledValue = settling && received ? parseMoney(received) : value;
        const diff = Math.round((value - settledValue) * 100) / 100;
        if (editing && settling && diff !== 0) {
          // Fica registrado na observação quanto era o valor original.
          const note =
            diff < 0
              ? `Juros/multa de ${formatBRL(-diff)} (valor original ${formatBRL(value)})`
              : shortfall === "discount"
                ? `Desconto de ${formatBRL(diff)} (valor original ${formatBRL(value)})`
                : `Pagamento parcial de ${formatBRL(value)}; restante de ${formatBRL(diff)} para ${remainderDate.split("-").reverse().join("/")}`;
          const patch = { ...base, amount: settledValue, notes: [base.notes, note].filter(Boolean).join("\n") };
          applyLocal((d) => ({ ...d, movements: d.movements.map((m) => (m.id === editing.id ? { ...m, ...patch } : m)) }));
          await updateMovement(editing.id, patch);
          if (diff > 0 && shortfall === "partial") {
            await insertMovements([
              {
                ...base,
                amount: diff,
                paid: false,
                date: remainderDate,
                dueDate: remainderDate,
                description: `${base.description} (restante)`,
                notes: `Restante do pagamento parcial de ${formatBRL(value)} recebido em ${date.split("-").reverse().join("/")}`,
                recurrenceId: null,
                installment: 0,
                totalInstallments: 0,
              },
            ]);
          }
        } else if (editing) {
          applyLocal((d) => ({ ...d, movements: d.movements.map((m) => (m.id === editing.id ? { ...m, ...base } : m)) }));
          await updateMovement(editing.id, base);
        } else if (period === "none") {
          await insertMovements([{ ...base, recurrenceId: null, installment: 0, totalInstallments: 0 }]);
        } else {
          const quantity = repeatCount ? Math.max(2, Number(repeatCount)) : null;
          const dates = occurrences(date, period, quantity ?? HORIZON[period]);
          const recurrenceId = await insertRecurrence({
            type: kind, startDate: date, amount: value, period, quantity, fixed: true, active: true,
            nextDate: occurrences(date, period, dates.length + 1).at(-1)!, bankAccountId: accountId, categoryId,
            contactId: contactId || null, description: base.description,
          });
          await insertMovements(
            dates.map((d, i) => ({
              ...base, date: d, dueDate: d, competenceDate: d, paid: i === 0 && paid, recurrenceId,
              installment: quantity ? i + 1 : 0, totalInstallments: quantity ?? 0,
            })),
          );
        }
        if (editing && amountChanged) {
          const next = scope === "this_and_next" ? followers : [];
          if (next.length || (scope === "this_and_next" && editing.recurrenceId)) {
            const ids = new Set(next.map((m) => m.id));
            applyLocal((d) => ({ ...d, movements: d.movements.map((m) => (ids.has(m.id) ? { ...m, amount: value } : m)) }));
            await applyAmountToNext([...ids], value, editing.recurrenceId);
          }
          await logAmountChange({
            movementId: editing.id,
            recurrenceId: editing.recurrenceId,
            contactId: contactId || null,
            description: base.description,
            oldAmount: editing.amount,
            newAmount: value,
            scope: next.length ? "this_and_next" : "only_this",
            effectiveDate: date,
            affectedCount: 1 + next.length,
          });
        }
      }
      await reload();
      toast({ tone: "success", title: amountChanged && scope === "this_and_next" && followers.length ? `Valor alterado neste e nos próximos ${followers.length} lançamento${followers.length === 1 ? "" : "s"}` : settling && settleDiff > 0 ? (shortfall === "partial" ? `Baixa parcial: ${formatBRL(settleDiff)} continuam em aberto` : `Baixado com desconto de ${formatBRL(settleDiff)}`) : editing ? "Lançamento atualizado" : kind === "transfer" ? "Transferência registrada" : period !== "none" ? "Série criada" : "Lançamento adicionado" });
      if (keepOpen) {
        setAmount("");
        setDescription("");
        setDocumentNumber("");
        setNotes("");
      } else onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
      if (editing) await reload();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    try {
      await deleteMovements([editing.id]);
      applyLocal((d) => ({ ...d, movements: d.movements.filter((m) => m.id !== editing.id) }));
      toast({ tone: "success", title: "Lançamento excluído" });
      onDone();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <DialogTitle className="sr-only">{editing ? "Editar lançamento" : isIn ? "Conta a receber" : kind === "outflow" ? "Conta a pagar" : "Transferência"}</DialogTitle>
      <DialogDescription className="sr-only">Preencha os dados do lançamento.</DialogDescription>
      <div className="px-5 pt-4">
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(
            [
              ["inflow", "Conta a receber"],
              ["outflow", "Conta a pagar"],
              ["transfer", "Transferência"],
            ] as const
          )
            .filter(([k]) => !editing || k !== "transfer")
            .map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-all",
                kind === k ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "transfer" ? (
                <ArrowLeftRight className="size-3.5" />
              ) : (
                <span className={cn("size-1.5 rounded-full", k === "inflow" ? "bg-success" : "bg-muted-foreground", kind === k && k === "outflow" && "bg-destructive")} />
              )}
              {label}
            </button>
          ))}
        </div>
        <div className={cn("mt-3 h-[3px] rounded-full opacity-80 transition-colors", accent)} />
      </div>

      <div className={cn("grid min-h-[372px]", kind !== "transfer" && "md:grid-cols-2")}>
        <div className="space-y-3.5 p-5 pt-4">
          <div className="rounded-xl border bg-card px-4 pb-2 pt-3 shadow-xs">
            <div className="text-[13px] font-medium">
              Valor {kind === "transfer" ? "da transferência" : `do ${noun}`}
              <span className="text-brand"> *</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium text-muted-foreground">R$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(maskMoney(e.target.value))}
                placeholder="0,00"
                className="w-full bg-transparent text-[34px] font-light tracking-tight outline-none placeholder:text-muted-foreground/50 tabular"
              />
            </div>
            <div className={cn("mt-1 h-[2px] rounded-full", accent)} />
          </div>
          {amountChanged && editing && (
            <div className="space-y-2 rounded-xl border border-dashed bg-muted/40 p-3 animate-fade-in">
              <div className="text-[12.5px]">
                Valor alterado de <b className="tabular">{formatBRL(editing.amount)}</b> para <b className="tabular">{formatBRL(newValue)}</b>.{" "}
                {followers.length ? "Essa alteração vale para:" : "Só este lançamento será alterado."}
              </div>
              {followers.length > 0 && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(
                    [
                      ["only_this", "Só este mês", "Os próximos continuam como estão"],
                      [
                        "this_and_next",
                        "Este e os próximos",
                        `Mais ${followers.length} lançamento${followers.length === 1 ? "" : "s"}, até ${followers.at(-1)!.date.split("-").reverse().join("/")}${editing.recurrenceId ? ", e os meses que vierem" : ""}`,
                      ],
                    ] as const
                  ).map(([k, title, sub]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setScope(k)}
                      aria-pressed={scope === k}
                      className={cn("rounded-lg border px-2.5 py-1.5 text-left transition-colors", scope === k ? "border-primary bg-brand-soft" : "bg-card hover:bg-accent/60")}
                    >
                      <div className="text-[12.5px] font-medium">{title}</div>
                      <div className="text-[11px] text-muted-foreground">{sub}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Field label="Data">
            <div className="flex items-center gap-3">
              <div className="relative w-[210px]">
                <CalendarDays className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "pl-8")} />
              </div>
              {kind !== "transfer" && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
                  {isIn ? "Já foi recebido" : "Já foi pago"}
                </label>
              )}
            </div>
          </Field>
          {settling && (
            <div className="space-y-2.5 rounded-xl border border-dashed bg-muted/40 p-3 animate-fade-in">
              <Field label={isIn ? "Valor recebido" : "Valor pago"} hint="Se veio diferente do previsto, ajuste aqui.">
                <div className="relative w-[210px]">
                  <span className="pointer-events-none absolute left-2.5 top-1.5 text-[12px] text-muted-foreground">R$</span>
                  <input inputMode="decimal" value={received || amount} onChange={(e) => setReceived(maskMoney(e.target.value))} className={cn(inputClass, "pl-8 font-medium tabular")} />
                </div>
              </Field>
              {settleDiff > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[12.5px]">
                    Faltam <b className="tabular">{formatBRL(settleDiff)}</b>. O que fazer com a diferença?
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(
                      [
                        ["partial", "Pagamento parcial", "O restante continua em aberto"],
                        ["discount", "Desconto", "O restante não será cobrado"],
                      ] as const
                    ).map(([k, title, sub]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setShortfall(k)}
                        className={cn("rounded-lg border px-2.5 py-1.5 text-left transition-colors", shortfall === k ? "border-primary bg-brand-soft" : "bg-card hover:bg-accent/60")}
                      >
                        <div className="text-[12.5px] font-medium">{title}</div>
                        <div className="text-[11px] text-muted-foreground">{sub}</div>
                      </button>
                    ))}
                  </div>
                  {shortfall === "partial" && (
                    <label className="flex items-center gap-2 text-[12.5px]">
                      Restante vence em
                      <input type="date" value={remainderDate} onChange={(e) => setRemainderDate(e.target.value)} className={cn(inputClass, "h-7 w-[150px]")} />
                    </label>
                  )}
                </div>
              )}
              {settleDiff < 0 && (
                <div className="text-[12.5px] text-muted-foreground">
                  Veio <b className="text-foreground tabular">{formatBRL(-settleDiff)}</b> a mais — fica registrado como juros/multa e o lançamento passa a {formatBRL(receivedValue)}.
                </div>
              )}
            </div>
          )}
          <Field label="Descrição" required={kind !== "transfer"}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva brevemente o lançamento..." className={inputClass} />
          </Field>
          {kind === "transfer" ? (
            <>
              <Field label="Conta de origem" required>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
                  <option value="">Escolha a conta de origem</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Conta de destino" required>
                <select value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)} className={inputClass}>
                  <option value="">Escolha a conta de destino</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="Categoria" required>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
                  <option value="">Selecione a categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Conta" required>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
                  <option value="">Selecione a conta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        {kind !== "transfer" && (
          <div className="border-t md:border-l md:border-t-0">
            <div className="flex gap-1 border-b px-4">
              {(
                [
                  ["dados", "Dados"],
                  ...(editing ? [] : ([["recorrencia", "Recorrência"]] as const)),
                  ["adicionais", "Adicionais"],
                  ["documentos", "Documentos"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    "relative -mb-px h-10 px-2.5 text-[13px]",
                    tab === k ? "font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-4 p-5">
              {tab === "dados" && (
                <>
                  <Field label="Competência" hint={competence ? undefined : "Acompanha a data do movimento."}>
                    <input type="date" value={competence ?? date} onChange={(e) => setCompetence(e.target.value)} className={inputClass} />
                  </Field>
                  <div className="border-t" />
                  <Field label={isIn ? "Cliente" : "Fornecedor"}>
                    <ContactPicker value={contactId} onChange={setContactId} kind={isIn ? "customer" : "supplier"} />
                  </Field>
                </>
              )}
              {tab === "recorrencia" && (
                <div className="flex flex-wrap gap-2">
                  {PERIODS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPeriod(p.value)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[12px] transition-colors",
                        period === p.value ? "border-brand/40 bg-brand-soft font-medium text-brand-foreground" : "hover:bg-accent",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  {period !== "none" && (
                    <div className="w-full space-y-3 pt-3 animate-pop-in">
                      <Field label="Quantas vezes?" hint="Deixe vazio para repetir sem fim (o sistema gera os próximos 12 meses e vai completando).">
                        <input
                          inputMode="numeric"
                          value={repeatCount}
                          onChange={(e) => setRepeatCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          placeholder="Sem fim"
                          className={cn(inputClass, "w-32")}
                        />
                      </Field>
                      <p className="rounded-lg bg-brand-soft px-3 py-2 text-[12px] text-brand-foreground">
                        {repeatCount
                          ? `Serão criados ${Math.max(2, Number(repeatCount))} lançamentos, numerados como parcelas.`
                          : `Série sem fim: serão criados os próximos ${HORIZON[period as RecurrencePeriod]} lançamentos.`}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {tab === "adicionais" && (
                <>
                  <Field label="Número do documento">
                    <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Observações">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={cn(inputClass, "h-auto py-2")} />
                  </Field>
                  {editing && history && history.length > 0 && (
                    <Field label="Histórico de valores">
                      <ul className="divide-y rounded-lg border text-[12px]">
                        {history.map((h) => (
                          <li key={h.id} className="flex items-baseline justify-between gap-3 px-2.5 py-1.5">
                            <span>
                              <span className="tabular text-muted-foreground line-through">{formatBRL(h.oldAmount)}</span> →{" "}
                              <b className="tabular">{formatBRL(h.newAmount)}</b>
                              <span className="text-muted-foreground">
                                {" "}
                                · {h.scope === "this_and_next" ? `a partir de ${h.effectiveDate.split("-").reverse().join("/")} (${h.affectedCount} lançamentos)` : `só ${h.effectiveDate.split("-").reverse().join("/")}`}
                              </span>
                            </span>
                            <span className="shrink-0 text-muted-foreground">{new Date(h.createdAt).toLocaleDateString("pt-BR")}</span>
                          </li>
                        ))}
                      </ul>
                    </Field>
                  )}
                </>
              )}
              {tab === "documentos" && (
                <div className="grid place-items-center gap-1 rounded-xl border border-dashed py-10 text-center">
                  <Paperclip className="size-5 text-muted-foreground" />
                  <div className="text-[13px] font-medium">Arraste ou clique para anexar</div>
                  <div className="text-[12px] text-muted-foreground">PDF, XML, imagem, planilha — até 25 MB</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sticky bottom-0 z-10 rounded-b-xl border-t bg-card bg-[linear-gradient(var(--muted),var(--muted))] px-5 py-3">
        {editing && (
          <Button
            type="button"
            variant={confirmDelete ? "danger" : "ghost"}
            size="md"
            disabled={saving}
            onClick={() => void remove()}
            onBlur={() => setConfirmDelete(false)}
            className={cn(!confirmDelete && "text-destructive-foreground")}
          >
            <Trash2 /> {confirmDelete ? "Confirmar exclusão" : "Excluir"}
          </Button>
        )}
        <div className={cn("flex flex-1 items-center gap-1.5 text-[11.5px]", message ? "text-destructive-foreground" : "text-muted-foreground")} role="status">
          <Info className="size-3.5 shrink-0" />
          {message ?? (
            <>
              Campos com <span className="text-brand">*</span> são obrigatórios
            </>
          )}
        </div>
        <Button type="button" variant="outline" size="md" onClick={onDone}>
          Cancelar
        </Button>
        {!editing && (
          <Button type="button" variant="soft" size="md" disabled={saving} onClick={() => void submit(true)}>
            <Plus /> Adicionar e continuar
          </Button>
        )}
        <Button type="submit" variant="primary" size="md" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Salvar alterações" : `Adicionar ${noun}`}
        </Button>
      </div>
    </form>
  );
}

