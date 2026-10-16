/**
 * Cartões de crédito.
 *
 * Cada compra vira uma despesa (uma por parcela) na conta pagadora, com:
 *   date            = vencimento da fatura (quando o dinheiro sai do banco — regime de caixa)
 *   competenceDate  = data da compra
 *   origin          = "card:<id do cartão>"
 * Assim o saldo, o demonstrativo e os relatórios já enxergam o cartão sem regra especial,
 * e "pagar a fatura" é só baixar os lançamentos daquele vencimento.
 */
import { addMonths, startOfMonth } from "./dates";
import type { CreditCard, FinanceData, ISODate, Movement } from "./types";

export const cardOrigin = (cardId: string) => `card:${cardId}`;
export const cardIdOf = (m: Pick<Movement, "origin">) => (m.origin?.startsWith("card:") ? m.origin.slice(5) : null);

const pad = (n: number) => String(n).padStart(2, "0");
const withDay = (month: ISODate, day: number) => `${month.slice(0, 7)}-${pad(day)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface InvoiceDates {
  closing: ISODate;
  due: ISODate;
}

/** Fatura em que cai uma compra: no dia do fechamento ou depois, vai para a próxima. */
export function invoiceFor(card: Pick<CreditCard, "closingDay" | "dueDay">, purchase: ISODate): InvoiceDates {
  const month = startOfMonth(purchase);
  const invoiceMonth = purchase >= withDay(month, card.closingDay) ? addMonths(month, 1) : month;
  return datesOfInvoiceMonth(card, invoiceMonth);
}

/** Fatura que fecha no mês `month`. */
export function datesOfInvoiceMonth(card: Pick<CreditCard, "closingDay" | "dueDay">, month: ISODate): InvoiceDates {
  const closing = withDay(month, card.closingDay);
  const due = card.dueDay > card.closingDay ? withDay(month, card.dueDay) : withDay(addMonths(startOfMonth(month), 1), card.dueDay);
  return { closing, due };
}

/** Fechamento da fatura que vence em `due`. */
export function closingForDue(card: Pick<CreditCard, "closingDay" | "dueDay">, due: ISODate): ISODate {
  const month = startOfMonth(due);
  return withDay(card.dueDay > card.closingDay ? month : addMonths(month, -1), card.closingDay);
}

export type InvoiceStatus = "open" | "closed" | "overdue" | "paid" | "future";

export interface Invoice extends InvoiceDates {
  total: number;
  paidTotal: number;
  items: Movement[];
  status: InvoiceStatus;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  overdue: "Vencida",
  paid: "Paga",
  future: "Futura",
};

export function invoiceStatus(inv: InvoiceDates & { items: Movement[] }, today: ISODate): InvoiceStatus {
  if (inv.items.length > 0 && inv.items.every((m) => m.paid)) return "paid";
  if (today > inv.due) return inv.items.length ? "overdue" : "paid";
  if (today >= inv.closing) return "closed";
  const prevClosing = withDay(addMonths(startOfMonth(inv.closing), -1), Number(inv.closing.slice(8)));
  return today >= prevClosing ? "open" : "future";
}

/** Todas as faturas do cartão (com compras), mais a atual mesmo vazia; ordem por vencimento. */
export function cardInvoices(data: FinanceData, card: CreditCard, today: ISODate): Invoice[] {
  const origin = cardOrigin(card.id);
  const byDue = new Map<ISODate, Movement[]>();
  for (const m of data.movements) {
    if (m.origin !== origin) continue;
    const list = byDue.get(m.date) ?? [];
    list.push(m);
    byDue.set(m.date, list);
  }
  const current = invoiceFor(card, today);
  if (!byDue.has(current.due)) byDue.set(current.due, []);
  return [...byDue.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([due, items]) => {
      items.sort((a, b) => (a.competenceDate ?? a.date).localeCompare(b.competenceDate ?? b.date));
      const dates = { closing: closingForDue(card, due), due };
      return {
        ...dates,
        items,
        total: round2(items.reduce((s, m) => s + m.amount, 0)),
        paidTotal: round2(items.reduce((s, m) => s + (m.paid ? m.amount : 0), 0)),
        status: invoiceStatus({ ...dates, items }, today),
      };
    });
}

/** Limite comprometido = tudo que ainda não foi pago no cartão (inclui parcelas futuras). */
export function cardUsage(data: FinanceData, card: CreditCard) {
  const origin = cardOrigin(card.id);
  const used = round2(data.movements.reduce((s, m) => s + (m.origin === origin && !m.paid ? m.amount : 0), 0));
  return { used, available: round2(card.limit - used), pct: card.limit > 0 ? Math.min(100, (used / card.limit) * 100) : 0 };
}

export interface PurchaseInput {
  amount: number;
  date: ISODate;
  installments: number;
  description: string;
  categoryId: string | null;
  contactId: string | null;
  notes: string | null;
}

/** Gera os lançamentos de uma compra (centavos que sobram na divisão vão para a 1ª parcela). */
export function buildPurchase(card: CreditCard, p: PurchaseInput): Omit<Movement, "id">[] {
  if (!card.payerAccountId) throw new Error("Defina a conta que paga a fatura deste cartão.");
  const n = Math.max(1, Math.floor(p.installments));
  const cents = Math.round(p.amount * 100);
  const base = Math.floor(cents / n);
  const first = invoiceFor(card, p.date);
  return Array.from({ length: n }, (_, i) => ({
    type: "outflow" as const,
    date: addMonths(first.due, i),
    competenceDate: p.date,
    dueDate: addMonths(first.due, i),
    amount: (base + (i === 0 ? cents - base * n : 0)) / 100,
    description: p.description,
    bankAccountId: card.payerAccountId!,
    categoryId: p.categoryId,
    contactId: p.contactId,
    recurrenceId: null,
    paid: false,
    installment: n > 1 ? i + 1 : 0,
    totalInstallments: n > 1 ? n : 0,
    documentNumber: null,
    notes: p.notes,
    origin: cardOrigin(card.id),
  }));
}

/** Parcelas de cartões com débito automático cujo vencimento já chegou e que ainda estão em aberto. */
export function autoDebitDue(data: FinanceData, today: ISODate): string[] {
  const auto = new Set(data.cards.filter((c) => c.autoDebit).map((c) => cardOrigin(c.id)));
  if (!auto.size) return [];
  return data.movements.filter((m) => !m.paid && m.origin && auto.has(m.origin) && m.date <= today).map((m) => m.id);
}
