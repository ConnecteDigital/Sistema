import { createClient, supabaseConfigured } from "./supabase/client";
import type { CategoryGroup, CreditCard, Movement, Recurrence, Transfer } from "./types";

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
  if (m.origin !== undefined) row.origin = m.origin;
  return row;
}

async function check<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function insertMovements(items: MovementInput[]): Promise<string[]> {
  const rows = await check(db().from("movements").insert(items.map((m) => ({ ...toRow(m), origin: m.origin ?? "web" }))).select("id"));
  return (rows as { id: string }[]).map((r) => r.id);
}

export async function updateMovement(id: string, patch: Partial<MovementInput>) {
  await check(db().from("movements").update(toRow(patch)).eq("id", id));
}

export async function deleteMovements(ids: string[]) {
  await check(db().from("movements").delete().in("id", ids));
}

/** Apaga lançamentos e encerra as séries deles, para o sistema não gerar os meses seguintes de novo. */
export async function deleteMovementsAndStop(ids: string[], recurrenceIds: string[]) {
  const sb = db();
  if (recurrenceIds.length) await check(sb.from("recurrences").update({ active: false }).in("id", recurrenceIds));
  for (let i = 0; i < ids.length; i += 200) await check(sb.from("movements").delete().in("id", ids.slice(i, i + 200)));
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
  await check(db().from("movements").insert(items.map((m) => ({ id: m.id, ...toRow(m), origin: m.origin ?? "web" }))));
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

/** Leva um novo valor para os próximos lançamentos (e para a série, que gera os meses seguintes). */
export async function applyAmountToNext(ids: string[], amount: number, recurrenceId: string | null) {
  const sb = db();
  if (ids.length) await check(sb.from("movements").update({ amount }).in("id", ids));
  if (recurrenceId) await check(sb.from("recurrences").update({ amount }).eq("id", recurrenceId));
}

export interface AmountChange {
  id: string;
  movementId: string | null;
  recurrenceId: string | null;
  contactId: string | null;
  description: string;
  oldAmount: number;
  newAmount: number;
  scope: "only_this" | "this_and_next";
  effectiveDate: string;
  affectedCount: number;
  createdAt: string;
}

/** Registra no histórico. Não impede o salvamento se a tabela ainda não existir. */
export async function logAmountChange(c: Omit<AmountChange, "id" | "createdAt">) {
  if (!supabaseConfigured) return;
  const { error } = await createClient().from("amount_changes").insert({
    movement_id: c.movementId,
    recurrence_id: c.recurrenceId,
    contact_id: c.contactId,
    description: c.description,
    old_amount: c.oldAmount,
    new_amount: c.newAmount,
    scope: c.scope,
    effective_date: c.effectiveDate,
    affected_count: c.affectedCount,
  });
  if (error) console.warn("Histórico de valores não gravado:", error.message);
}

export async function listAmountChanges(movementId: string, recurrenceId: string | null): Promise<AmountChange[]> {
  if (!supabaseConfigured) return [];
  let q = createClient().from("amount_changes").select("*").order("created_at", { ascending: false }).limit(30);
  q = recurrenceId ? q.or(`movement_id.eq.${movementId},recurrence_id.eq.${recurrenceId}`) : q.eq("movement_id", movementId);
  const { data, error } = await q;
  if (error) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    movementId: (r.movement_id as string | null) ?? null,
    recurrenceId: (r.recurrence_id as string | null) ?? null,
    contactId: (r.contact_id as string | null) ?? null,
    description: String(r.description ?? ""),
    oldAmount: Number(r.old_amount),
    newAmount: Number(r.new_amount),
    scope: r.scope as AmountChange["scope"],
    effectiveDate: String(r.effective_date),
    affectedCount: Number(r.affected_count),
    createdAt: String(r.created_at),
  }));
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

export interface ContactInput {
  name: string;
  isCustomer: boolean;
  isSupplier: boolean;
  personType: "natural" | "legal";
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, string | undefined>;
  notes: string | null;
  deleted?: boolean;
}

const contactRow = (c: Partial<ContactInput>) => {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.isCustomer !== undefined) row.is_customer = c.isCustomer;
  if (c.isSupplier !== undefined) row.is_supplier = c.isSupplier;
  if (c.personType !== undefined) row.person_type = c.personType;
  if (c.taxId !== undefined) row.tax_id = c.taxId;
  if (c.email !== undefined) row.email = c.email;
  if (c.phone !== undefined) row.phone = c.phone;
  if (c.address !== undefined) row.address = c.address;
  if (c.notes !== undefined) row.notes = c.notes;
  if (c.deleted !== undefined) row.deleted = c.deleted;
  return row;
};

export async function insertContact(c: ContactInput): Promise<string> {
  const row = await check(db().from("contacts").insert(contactRow(c)).select("id").single());
  return (row as { id: string }).id;
}

export async function updateContact(id: string, c: Partial<ContactInput>) {
  await check(db().from("contacts").update(contactRow(c)).eq("id", id));
}

/* ---------------- Plano de categorias ---------------- */

export interface GroupInput {
  name: string;
  type: "inflow" | "outflow";
  section: CategoryGroup["section"];
  color: string;
  position?: number;
}

export async function insertGroup(g: GroupInput): Promise<string> {
  const row = await check(db().from("category_groups").insert(g).select("id").single());
  return (row as { id: string }).id;
}

export async function updateGroup(id: string, g: Partial<GroupInput>) {
  await check(db().from("category_groups").update(g).eq("id", id));
}

export async function deleteGroup(id: string) {
  await check(db().from("category_groups").delete().eq("id", id));
}

export interface CategoryInput {
  name: string;
  groupId: string;
  position?: number;
}

const categoryRow = (c: Partial<CategoryInput>) => {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.groupId !== undefined) row.group_id = c.groupId;
  if (c.position !== undefined) row.position = c.position;
  return row;
};

export async function insertCategory(c: CategoryInput): Promise<string> {
  const row = await check(db().from("categories").insert(categoryRow(c)).select("id").single());
  return (row as { id: string }).id;
}

export async function updateCategory(id: string, c: Partial<CategoryInput>) {
  await check(db().from("categories").update(categoryRow(c)).eq("id", id));
}

/** Exclui a categoria; os lançamentos e recorrências dela passam para `moveTo` (ou ficam sem categoria). */
export async function deleteCategory(id: string, moveTo: string | null) {
  await check(db().from("movements").update({ category_id: moveTo }).eq("category_id", id));
  await check(db().from("recurrences").update({ category_id: moveTo }).eq("category_id", id));
  await check(db().from("categories").delete().eq("id", id));
}

/** Grava a nova ordem (position = índice). */
export async function reorder(table: "categories" | "category_groups", ids: string[]) {
  await Promise.all(ids.map((id, position) => check(db().from(table).update({ position }).eq("id", id))));
}

/* ---------------- Cartões de crédito ---------------- */

export type CardInput = Omit<CreditCard, "id">;

const cardRow = (c: Partial<CardInput>) => {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.brand !== undefined) row.brand = c.brand;
  if (c.limit !== undefined) row.credit_limit = c.limit;
  if (c.closingDay !== undefined) row.closing_day = c.closingDay;
  if (c.dueDay !== undefined) row.due_day = c.dueDay;
  if (c.payerAccountId !== undefined) row.payer_account_id = c.payerAccountId;
  if (c.autoDebit !== undefined) row.auto_debit = c.autoDebit;
  return row;
};

export async function insertCard(c: CardInput): Promise<string> {
  const row = await check(db().from("credit_cards").insert(cardRow(c)).select("id").single());
  return (row as { id: string }).id;
}

export async function updateCard(id: string, c: Partial<CardInput>) {
  await check(db().from("credit_cards").update(cardRow(c)).eq("id", id));
}

/** Exclui o cartão; as compras já lançadas continuam como despesas comuns da conta pagadora. */
export async function deleteCard(id: string) {
  await check(db().from("movements").update({ origin: "web" }).eq("origin", `card:${id}`));
  await check(db().from("credit_cards").delete().eq("id", id));
}

/* ---------------- Conciliações ---------------- */

export interface ReconciliationRecord {
  id: string;
  bankAccountId: string;
  name: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalance: number | null;
  createdAt: string;
}

export async function listReconciliations(): Promise<ReconciliationRecord[]> {
  const rows = (await check(db().from("reconciliations").select("*").order("created_at", { ascending: false }).limit(50))) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    bankAccountId: String(r.bank_account_id),
    name: r.name == null ? null : String(r.name),
    periodStart: r.period_start == null ? null : String(r.period_start),
    periodEnd: r.period_end == null ? null : String(r.period_end),
    closingBalance: r.closing_balance == null ? null : Number(r.closing_balance),
    createdAt: String(r.created_at),
  }));
}

export async function insertReconciliation(r: Omit<ReconciliationRecord, "id" | "createdAt">) {
  await check(
    db().from("reconciliations").insert({
      bank_account_id: r.bankAccountId,
      name: r.name,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      closing_balance: r.closingBalance,
    }),
  );
}

/* ---------------- Empresa ---------------- */

export async function saveCompany(c: { name: string; taxId: string | null }) {
  await check(db().from("company").upsert({ id: 1, name: c.name, tax_id: c.taxId }));
}
