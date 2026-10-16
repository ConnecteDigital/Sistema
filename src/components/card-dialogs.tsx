"use client";

import { Loader2, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/primitives";
import { buildPurchase, invoiceFor } from "@/lib/cards";
import { addMonths } from "@/lib/dates";
import { formatBRL, formatDate, monthLong } from "@/lib/format";
import { deleteCard, insertCard, insertMovements, updateCard } from "@/lib/mutations";
import type { CreditCard } from "@/lib/types";
import { useFinance } from "./finance-provider";
import { useToast } from "./toast";

const inputClass =
  "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";
const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maskMoney = (raw: string) => {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  return digits ? money.format(Number(digits) / 100) : "";
};
const parseMoney = (s: string) => Number(s.replace(/\D/g, "") || 0) / 100;

export const CARD_BRANDS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"];

/** Gradiente do cartão por bandeira. */
export function cardGradient(brand: string | null): string {
  switch (brand) {
    case "Visa":
      return "linear-gradient(135deg, #1a1f71 0%, #2b4bb3 100%)";
    case "Mastercard":
      return "linear-gradient(135deg, #1f1f1f 0%, #4a2a12 100%)";
    case "Elo":
      return "linear-gradient(135deg, #111 0%, #3a3a3a 100%)";
    case "American Express":
      return "linear-gradient(135deg, #0b5f74 0%, #2fa3b8 100%)";
    case "Hipercard":
      return "linear-gradient(135deg, #8d1515 0%, #d13a2f 100%)";
    default:
      return "linear-gradient(135deg, #c94f17 0%, #f08a4b 100%)";
  }
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: React.ReactNode }) {
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

/** "novembro/2026" a partir do vencimento. */
export const invoiceLabel = (due: string) => `${monthLong(Number(due.slice(5, 7)) - 1)}/${due.slice(0, 4)}`;

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function useSaver(onClose: () => void) {
  const { reload } = useFinance();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done: string) => {
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
  };
  return { busy, message, setMessage, run };
}

export function CardDialog({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  const { data } = useFinance();
  const accounts = (data?.accounts ?? []).filter((a) => a.active || a.id === card?.payerAccountId);
  const [name, setName] = React.useState(card?.name ?? "");
  const [brand, setBrand] = React.useState(card?.brand ?? "Mastercard");
  const [limit, setLimit] = React.useState(card ? money.format(card.limit) : "");
  const [closingDay, setClosingDay] = React.useState(card?.closingDay ?? 3);
  const [dueDay, setDueDay] = React.useState(card?.dueDay ?? 10);
  const [payer, setPayer] = React.useState(card?.payerAccountId ?? accounts[0]?.id ?? "");
  const [autoDebit, setAutoDebit] = React.useState(card?.autoDebit ?? false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const { busy, message, setMessage, run } = useSaver(onClose);
  const purchases = card ? (data?.movements.filter((m) => m.origin === `card:${card.id}`).length ?? 0) : 0;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (confirmDelete && card) return run(() => deleteCard(card.id), "Cartão excluído");
    if (!name.trim()) return setMessage("Dê um nome para o cartão.");
    if (!payer) return setMessage("Escolha a conta que paga a fatura.");
    const input = { name: name.trim(), brand, limit: parseMoney(limit), closingDay, dueDay, payerAccountId: payer, autoDebit };
    run(() => (card ? updateCard(card.id, input) : insertCard(input)), card ? "Cartão atualizado" : "Cartão criado");
  }

  const example = invoiceFor({ closingDay, dueDay }, `2026-01-${String(Math.max(1, closingDay - 1)).padStart(2, "0")}`);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
        <form onSubmit={save}>
          <div className="border-b px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold">{confirmDelete ? "Excluir cartão" : card ? "Editar cartão" : "Novo cartão"}</DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {confirmDelete ? `“${card?.name}” sai da lista de cartões.` : "As compras viram despesas da conta pagadora, no vencimento da fatura."}
            </DialogDescription>
          </div>
          {confirmDelete ? (
            <div className="p-5 text-[13px]">
              {purchases > 0 ? (
                <p>
                  As <b>{purchases}</b> parcelas já lançadas continuam como despesas comuns da conta — só deixam de aparecer agrupadas em fatura.
                </p>
              ) : (
                <p>Nenhuma compra lançada neste cartão.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3.5 p-5">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Field label="Nome do cartão" required>
                  <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bradesco Empresas Visa" />
                </Field>
                <Field label="Bandeira">
                  <select className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)}>
                    {CARD_BRANDS.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Limite">
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1.5 text-[12px] text-muted-foreground">R$</span>
                  <input inputMode="decimal" className={`${inputClass} pl-8 tabular`} value={limit} onChange={(e) => setLimit(maskMoney(e.target.value))} placeholder="0,00" />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dia do fechamento">
                  <select className={inputClass} value={closingDay} onChange={(e) => setClosingDay(Number(e.target.value))}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        Dia {d}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dia do vencimento">
                  <select className={inputClass} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        Dia {d}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
                Compras até o dia {closingDay - 1 || 28} entram na fatura que vence no dia {dueDay}
                {example.due.slice(5, 7) !== example.closing.slice(5, 7) ? " do mês seguinte" : " do mesmo mês"}. A partir do dia {closingDay}, vão para a próxima.
              </p>
              <Field label="Conta que paga a fatura" required>
                <select className={inputClass} value={payer} onChange={(e) => setPayer(e.target.value)}>
                  <option value="">Selecione a conta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={autoDebit} onChange={(e) => setAutoDebit(e.target.checked)} className="accent-[var(--primary)]" />
                Débito automático <span className="text-muted-foreground">(a fatura é baixada sozinha no vencimento)</span>
              </label>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-b-xl border-t bg-muted/60 px-5 py-3">
            {card && !confirmDelete && (
              <Button type="button" variant="ghost" size="md" className="text-destructive-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Excluir
              </Button>
            )}
            <span className="flex-1 text-[12px] text-destructive-foreground">{message}</span>
            <Button type="button" size="md" onClick={confirmDelete ? () => setConfirmDelete(false) : onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant={confirmDelete ? "danger" : "primary"} size="md" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {confirmDelete ? "Excluir cartão" : card ? "Salvar" : "Criar cartão"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseDialog({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const { data, today } = useFinance();
  const cards = data?.cards ?? [];
  const [card, setCard] = React.useState(cardId ?? cards[0]?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today ?? "");
  const [installments, setInstallments] = React.useState(1);
  const [description, setDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const { busy, message, setMessage, run } = useSaver(onClose);

  const selected = cards.find((c) => c.id === card) ?? null;
  const groups = new Map(data?.groups.map((g) => [g.id, g]) ?? []);
  const categories = (data?.categories ?? []).filter((c) => groups.get(c.groupId)?.type === "outflow").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const contacts = (data?.contacts ?? []).filter((c) => !c.deleted).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const value = parseMoney(amount);
  const first = selected && date ? invoiceFor(selected, date) : null;

  function save() {
    if (!selected) return setMessage("Escolha o cartão.");
    if (!value) return setMessage("Informe o valor da compra.");
    if (!description.trim() || !categoryId) return setMessage("Preencha descrição e categoria.");
    run(
      () =>
        insertMovements(
          buildPurchase(selected, {
            amount: value,
            date,
            installments,
            description: description.trim(),
            categoryId,
            contactId: contactId || null,
            notes: notes.trim() || null,
          }),
        ),
      installments > 1 ? `Compra lançada em ${installments}x` : "Compra lançada",
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-2rem))]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="relative border-b px-5 py-4">
            <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-destructive" />
            <DialogTitle className="text-[15px] font-semibold">Nova compra no cartão</DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">Cada parcela entra na fatura do mês certo, automaticamente.</DialogDescription>
          </div>
          <div className="space-y-3.5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cartão" required>
                <select className={inputClass} value={card} onChange={(e) => setCard(e.target.value)}>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data da compra" required>
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <Field label="Valor total" required>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1.5 text-[12px] text-muted-foreground">R$</span>
                  <input autoFocus inputMode="decimal" className={`${inputClass} pl-8 text-[15px] font-semibold tabular`} value={amount} onChange={(e) => setAmount(maskMoney(e.target.value))} placeholder="0,00" />
                </div>
              </Field>
              <Field label="Parcelas">
                <select className={inputClass} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "À vista" : `${n}x`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {first && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
                {installments > 1 ? (
                  <>
                    <b className="text-foreground">
                      {installments}x de {formatBRL(Math.floor((value * 100) / installments) / 100)}
                    </b>{" "}
                    — primeira na fatura de {invoiceLabel(first.due)} (vence {formatDate(first.due)}), última em {invoiceLabel(addMonths(first.due, installments - 1))}.
                  </>
                ) : (
                  <>
                    Entra na fatura de <b className="text-foreground">{invoiceLabel(first.due)}</b>, que fecha em {formatDate(first.closing)} e vence em {formatDate(first.due)}.
                  </>
                )}
              </p>
            )}
            <Field label="Descrição" required>
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Assinatura Adobe" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Categoria" required>
                <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Selecione a categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fornecedor">
                <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">Nenhum</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Observações">
              <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </Field>
          </div>
          <div className="flex items-center gap-2 rounded-b-xl border-t bg-muted/60 px-5 py-3">
            <span className="flex-1 text-[12px] text-destructive-foreground">{message}</span>
            <Button type="button" size="md" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Lançar compra
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
