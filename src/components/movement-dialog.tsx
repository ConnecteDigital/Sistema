"use client";

import { ArrowLeftRight, CalendarDays, Info, Paperclip, Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/primitives";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import type { MovementType, RecurrencePeriod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinance } from "./finance-provider";

type Kind = MovementType | "transfer";
interface OpenOptions {
  kind: Kind;
}

const DialogCtx = React.createContext<{ open: (o: OpenOptions) => void } | null>(null);

export function useMovementDialog() {
  const ctx = React.use(DialogCtx);
  if (!ctx) throw new Error("useMovementDialog fora do MovementDialogHost");
  return ctx;
}

export function MovementDialogHost({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ open: boolean; kind: Kind; key: number }>({ open: false, kind: "inflow", key: 0 });
  const ctx = React.useMemo(() => ({ open: (o: OpenOptions) => setState((s) => ({ open: true, kind: o.kind, key: s.key + 1 })) }), []);
  return (
    <DialogCtx value={ctx}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
        <DialogContent aria-describedby={undefined}>
          <MovementForm key={state.key} initialKind={state.kind} onDone={() => setState((s) => ({ ...s, open: false }))} />
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
      <span className="text-[13px] font-medium">
        {label}
        {required && <span className="text-success"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";

/** Converte "1.234,56" → 1234.56 */
function parseMoney(s: string): number {
  const v = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? v : 0;
}

function MovementForm({ initialKind, onDone }: { initialKind: Kind; onDone: () => void }) {
  const { data, today, reload } = useFinance();
  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [tab, setTab] = React.useState<"dados" | "recorrencia" | "adicionais" | "documentos">("dados");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [paid, setPaid] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [destAccountId, setDestAccountId] = React.useState("");
  const [competence, setCompetence] = React.useState<string | null>(null);
  const [contactId, setContactId] = React.useState("");
  const [period, setPeriod] = React.useState<RecurrencePeriod | "none">("none");
  const [documentNumber, setDocumentNumber] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const isIn = kind === "inflow";
  const groupType = new Map(data?.groups.map((g) => [g.id, g]) ?? []);
  const categories = (data?.categories ?? [])
    .filter((c) => kind !== "transfer" && groupType.get(c.groupId)?.type === kind)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const contacts = (data?.contacts ?? []).filter((c) => !c.deleted && (isIn ? c.isCustomer : c.isSupplier || c.isCustomer));
  const accounts = (data?.accounts ?? []).filter((a) => a.active);

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
    if (!supabaseConfigured) return setMessage("Modo de demonstração: conecte o Supabase para gravar lançamentos.");
    setSaving(true);
    const sb = createClient();
    const { error } =
      kind === "transfer"
        ? await sb.from("transfers").insert({
            date,
            amount: value,
            description: description.trim() || "Transferência",
            source_account_id: accountId,
            destination_account_id: destAccountId,
          })
        : await sb.from("movements").insert({
            type: kind,
            date,
            competence_date: competence ?? date,
            due_date: date,
            amount: value,
            description: description.trim(),
            bank_account_id: accountId,
            category_id: categoryId,
            contact_id: contactId || null,
            paid,
            document_number: documentNumber || null,
            notes: notes || null,
            origin: "web",
          });
    setSaving(false);
    if (error) return setMessage(error.message);
    await reload();
    if (keepOpen) {
      setAmount("");
      setDescription("");
      setMessage("Lançamento adicionado.");
    } else onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <DialogTitle className="sr-only">{isIn ? "Conta a receber" : kind === "outflow" ? "Conta a pagar" : "Transferência"}</DialogTitle>
      <DialogDescription className="sr-only">Preencha os dados do lançamento.</DialogDescription>
      <div className="px-5 pt-4">
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(
            [
              ["inflow", "Conta a receber"],
              ["outflow", "Conta a pagar"],
              ["transfer", "Transferência"],
            ] as const
          ).map(([k, label]) => (
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
              <span className="text-success"> *</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-medium text-muted-foreground">R$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full bg-transparent text-[34px] font-light tracking-tight outline-none placeholder:text-muted-foreground/50 tabular"
              />
            </div>
            <div className={cn("mt-1 h-[2px] rounded-full", accent)} />
          </div>
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
                  ["recorrencia", "Recorrência"],
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
                    <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputClass}>
                      <option value="">{isIn ? "Sem cliente" : "Sem fornecedor"}</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
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
                        period === p.value ? "border-success/40 bg-success-soft font-medium text-success-foreground" : "hover:bg-accent",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  {period !== "none" && (
                    <p className="w-full pt-2 text-[12px] text-muted-foreground">A geração automática das próximas parcelas entra na Fase 3.</p>
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

      <div className="flex items-center gap-2 rounded-b-xl border-t bg-muted/60 px-5 py-3">
        <div className="flex flex-1 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Info className="size-3.5" />
          {message ?? (
            <>
              Campos com <span className="text-success">*</span> são obrigatórios
            </>
          )}
        </div>
        <Button type="button" variant="outline" size="md" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="button" variant="soft" size="md" disabled={saving} onClick={() => void submit(true)}>
          <Plus /> Adicionar e continuar
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={saving}>
          Adicionar {noun}
        </Button>
      </div>
    </form>
  );
}

