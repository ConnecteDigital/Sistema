import { createClient, supabaseConfigured } from "./supabase/client";
import type { Movement, Recurrence, Transfer } from "./types";

export class DemoModeError extends Error {
  constructor() {
    super("Modo de demonstração: conecte o Supabase para gravar.");
  }
}

function db() {
  if (!supabaseConfigured) throw new DemoModeError();
  return createClient();
}

export type MovementInput = Omit<Movement, "id">;

function toRow(m: Partial<MovementInput>) {
  const row: Record<string, unknown> = {};
  if (m.type !== undefined) row.type = m.type;
  if (m.date !== undefined) row.date = m.date;
  if (m.competenceDate !== undefined) row.competence_date = m.competenceDate;
  if (m.dueDate !== undefined) row.due_date = m.dueDate;
  if (m.amount !== undefined) row.amount = m.amount;
  if (m.description !== undefined) row.description = m.description;
  if (m.bankAccountId !== undefined) row.bank_account_id = m.bankAccountId;
  if (m.categoryId !== undefined) row.category_id = m.categoryId;
  if (m.contactId !== undefined) row.contact_id = m.contactId;
  if (m.recurrenceId !== undefined) row.recurrence_id = m.recurrenceId;
  if (m.paid !== undefined) row.paid = m.paid;
  if (m.installment !== undefined) row.installment = m.installment;
  if (m.totalInstallments !== undefined) row.total_installments = m.totalInstallments;
  if (m.documentNumber !== undefined) row.document_number = m.documentNumber;
  if (m.notes !== undefined) row.notes = m.notes;
  return row;
}

async function check<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function insertMovements(items: MovementInput[]): Promise<string[]> {
  const rows = await check(db().from("movements").insert(items.map((m) => ({ ...toRow(m), origin: "web" }))).select("id"));
  return (rows as { id: string }[]).map((r) => r.id);
}

export async function updateMovement(id: string, patch: Partial<MovementInput>) {
  await check(db().from("movements").update(toRow(patch)).eq("id", id));
}

export async function deleteMovements(ids: string[]) {
  await check(db().from("movements").delete().in("id", ids));
}

export async function setMovementsPaid(ids: string[], paid: boolean) {
  await check(db().from("movements").update({ paid }).in("id", ids));
}

export async function insertTransfer(t: Omit<Transfer, "id">): Promise<string> {
  const row = await check(
    db()
      .from("transfers")
      .insert({
        date: t.date,
        amount: t.amount,
        description: t.description,
        source_account_id: t.sourceAccountId,
        destination_account_id: t.destinationAccountId,
      })
      .select("id")
      .single(),
  );
  return (row as { id: string }).id;
}

export async function deleteTransfer(id: string) {
  await check(db().from("transfers").delete().eq("id", id));
}

/** Reinsere lançamentos excluídos mantendo os mesmos ids (usado no "Desfazer"). */
export async function restoreMovements(items: Movement[]) {
  await check(db().from("movements").insert(items.map((m) => ({ id: m.id, ...toRow(m), origin: "web" }))));
}

export async function insertRecurrence(r: Omit<Recurrence, "id">): Promise<string> {
  const row = await check(
    db()
      .from("recurrences")
      .insert({
        type: r.type,
        start_date: r.startDate,
        amount: r.amount,
        period: r.period,
        quantity: r.quantity,
        fixed: r.fixed,
        active: r.active,
        next_date: r.nextDate,
        bank_account_id: r.bankAccountId,
        category_id: r.categoryId,
        contact_id: r.contactId,
        description: r.description,
      })
      .select("id")
      .single(),
  );
  return (row as { id: string }).id;
}

export interface RecurrencePatch {
  description?: string;
  amount?: number;
  categoryId?: string | null;
  contactId?: string | null;
  bankAccountId?: string | null;
}

/** Atualiza a série e, se pedido, os lançamentos dela ainda em aberto a partir de `fromDate`. */
export async function updateRecurrence(id: string, patch: RecurrencePatch, applyFrom: string | null) {
  const sb = db();
  const row: Record<string, unknown> = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.contactId !== undefined) row.contact_id = patch.contactId;
  if (patch.bankAccountId !== undefined) row.bank_account_id = patch.bankAccountId;
  await check(sb.from("recurrences").update(row).eq("id", id));
  if (applyFrom) {
    const m: Record<string, unknown> = {};
    if (patch.description !== undefined) m.description = patch.description;
    if (patch.amount !== undefined) m.amount = patch.amount;
    if (patch.categoryId !== undefined) m.category_id = patch.categoryId;
    if (patch.contactId !== undefined) m.contact_id = patch.contactId;
    if (patch.bankAccountId) m.bank_account_id = patch.bankAccountId;
    await check(sb.from("movements").update(m).eq("recurrence_id", id).eq("paid", false).gte("date", applyFrom));
  }
}

/** Encerra a série; opcionalmente apaga os lançamentos futuros ainda em aberto. */
export async function cancelRecurrence(id: string, deleteFrom: string | null) {
  const sb = db();
  await check(sb.from("recurrences").update({ active: false }).eq("id", id));
  if (deleteFrom) await check(sb.from("movements").delete().eq("recurrence_id", id).eq("paid", false).gte("date", deleteFrom));
}

export async function reactivateRecurrence(id: string) {
  await check(db().from("recurrences").update({ active: true }).eq("id", id));
}

export interface AccountInput {
  name: string;
  bank: string | null;
  branch: string | null;
  accountNumber: string | null;
  initialBalance: number;
  active: boolean;
  position?: number;
}

const accountRow = (a: Partial<AccountInput>) => {
  const row: Record<string, unknown> = {};
  if (a.name !== undefined) row.name = a.name;
  if (a.bank !== undefined) row.bank = a.bank;
  if (a.branch !== undefined) row.branch = a.branch;
  if (a.accountNumber !== undefined) row.account_number = a.accountNumber;
  if (a.initialBalance !== undefined) row.initial_balance = a.initialBalance;
  if (a.active !== undefined) row.active = a.active;
  if (a.position !== undefined) row.position = a.position;
  return row;
};

export async function insertAccount(a: AccountInput) {
  await check(db().from("bank_accounts").insert(accountRow(a)));
}

export async function updateAccount(id: string, a: Partial<AccountInput>) {
  await check(db().from("bank_accounts").update(accountRow(a)).eq("id", id));
}
