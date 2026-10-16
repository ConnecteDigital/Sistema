import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceData } from "../types";

/** Lê todas as linhas de uma tabela (o PostgREST pagina em 1000). */
async function all<T>(sb: SupabaseClient, table: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

type Row = Record<string, unknown> & { id: string };
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? null : String(v));

export async function loadFinanceData(sb: SupabaseClient): Promise<FinanceData> {
  const [company, accounts, groups, categories, contacts, recurrences, movements, transfers] = await Promise.all([
    sb.from("company").select("name").maybeSingle(),
    all<Row>(sb, "bank_accounts"),
    all<Row>(sb, "category_groups"),
    all<Row>(sb, "categories"),
    all<Row>(sb, "contacts"),
    all<Row>(sb, "recurrences"),
    all<Row>(sb, "movements"),
    all<Row>(sb, "transfers"),
  ]);
  return {
    companyName: (company.data?.name as string) ?? "Connect Digital",
    accounts: accounts.map((r) => ({
      id: r.id,
      name: String(r.name),
      bank: str(r.bank),
      branch: str(r.branch),
      accountNumber: str(r.account_number),
      initialBalance: num(r.initial_balance),
      color: str(r.color),
      active: Boolean(r.active),
      position: num(r.position),
    })),
    groups: groups.map((r) => ({
      id: r.id,
      name: String(r.name),
      type: r.type as "inflow" | "outflow",
      section: r.section as FinanceData["groups"][number]["section"],
      color: String(r.color),
      position: num(r.position),
    })),
    categories: categories.map((r) => ({
      id: r.id,
      groupId: String(r.group_id),
      name: String(r.name),
      icon: str(r.icon),
      position: num(r.position),
    })),
    contacts: contacts.map((r) => ({
      id: r.id,
      name: String(r.name),
      isCustomer: Boolean(r.is_customer),
      isSupplier: Boolean(r.is_supplier),
      personType: r.person_type === "legal" ? "legal" : "natural",
      taxId: str(r.tax_id),
      email: str(r.email),
      phone: str(r.phone),
      address: (r.address as FinanceData["contacts"][number]["address"]) ?? {},
      notes: str(r.notes),
      deleted: Boolean(r.deleted),
    })),
    recurrences: recurrences.map((r) => ({
      id: r.id,
      type: r.type as "inflow" | "outflow",
      startDate: String(r.start_date),
      amount: num(r.amount),
      period: r.period as FinanceData["recurrences"][number]["period"],
      quantity: r.quantity == null ? null : num(r.quantity),
      fixed: Boolean(r.fixed),
      active: Boolean(r.active),
      nextDate: str(r.next_date),
      bankAccountId: str(r.bank_account_id),
      categoryId: str(r.category_id),
      contactId: str(r.contact_id),
      description: String(r.description ?? ""),
    })),
    movements: movements.map((r) => ({
      id: r.id,
      type: r.type as "inflow" | "outflow",
      date: String(r.date),
      competenceDate: str(r.competence_date),
      dueDate: str(r.due_date),
      amount: num(r.amount),
      description: String(r.description ?? ""),
      bankAccountId: String(r.bank_account_id),
      categoryId: str(r.category_id),
      contactId: str(r.contact_id),
      recurrenceId: str(r.recurrence_id),
      paid: Boolean(r.paid),
      installment: num(r.installment),
      totalInstallments: num(r.total_installments),
      documentNumber: str(r.document_number),
      notes: str(r.notes),
    })),
    transfers: transfers.map((r) => ({
      id: r.id,
      date: String(r.date),
      amount: num(r.amount),
      description: String(r.description ?? ""),
      sourceAccountId: String(r.source_account_id),
      destinationAccountId: String(r.destination_account_id),
    })),
  };
}
