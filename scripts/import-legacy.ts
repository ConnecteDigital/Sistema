/**
 * Importa o export do FCS V1 (arquivo .json) para o Supabase e confere os saldos.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-legacy.ts /caminho/dados.json
 *
 * Exige banco vazio (roda uma vez). Se a conferência de saldos falhar, nada fica gravado
 * como "concluído" e o script sai com erro.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { accountBalances } from "../src/lib/finance";
import { convertLegacyExport, verifyBalances, type LegacyExport } from "../src/lib/legacy-import";

const [file] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !key) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-legacy.ts dados.json");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const src = JSON.parse(readFileSync(file, "utf8")) as LegacyExport;
const { data, legacyKeys, warnings } = convertLegacyExport(src);

async function insert(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ${table}: ${rows.length}`);
}

async function main() {
  const { count } = await sb.from("movements").select("id", { count: "exact", head: true });
  if (count) throw new Error(`O banco já tem ${count} lançamentos — a importação é feita uma única vez.`);

  console.log("Importando…");
  await sb.from("company").upsert({ id: 1, name: data.companyName, tax_id: src.workspace.taxId });
  await insert("bank_accounts", data.accounts.map((a) => ({
    id: a.id, name: a.name, bank: a.bank, branch: a.branch, account_number: a.accountNumber,
    initial_balance: a.initialBalance, color: a.color, active: a.active, position: a.position,
  })));
  await insert("category_groups", data.groups.map((g) => ({
    id: g.id, name: g.name, type: g.type, section: g.section, color: g.color, position: g.position,
  })));
  await insert("categories", data.categories.map((c) => ({
    id: c.id, group_id: c.groupId, name: c.name, icon: c.icon, position: c.position,
  })));
  await insert("contacts", data.contacts.map((c) => ({
    id: c.id, name: c.name, is_customer: c.isCustomer, is_supplier: c.isSupplier, tax_id: c.taxId,
    email: c.email, phone: c.phone, notes: c.notes, deleted: c.deleted, legacy_key: legacyKeys.contacts[c.id],
  })));
  await insert("recurrences", data.recurrences.map((r) => ({
    id: r.id, type: r.type, start_date: r.startDate, amount: r.amount, period: r.period, quantity: r.quantity,
    fixed: r.fixed, active: r.active, next_date: r.nextDate, bank_account_id: r.bankAccountId,
    category_id: r.categoryId, contact_id: r.contactId, description: r.description,
    legacy_ref: legacyKeys.recurrences[r.id],
  })));
  await insert("movements", data.movements.map((m) => ({
    id: m.id, type: m.type, date: m.date, competence_date: m.competenceDate, due_date: m.dueDate,
    amount: m.amount, description: m.description, bank_account_id: m.bankAccountId, category_id: m.categoryId,
    contact_id: m.contactId, recurrence_id: m.recurrenceId, paid: m.paid, installment: m.installment,
    total_installments: m.totalInstallments, document_number: m.documentNumber, notes: m.notes, origin: "fcs-v1",
  })));
  await insert("transfers", data.transfers.map((t) => ({
    id: t.id, date: t.date, amount: t.amount, description: t.description,
    source_account_id: t.sourceAccountId, destination_account_id: t.destinationAccountId,
  })));

  // Conferência: saldo calculado no banco (view) × saldo informado no export.
  const { data: dbBalances, error } = await sb.from("account_balances").select("id, balance");
  if (error) throw new Error(error.message);
  const fromDb = Object.fromEntries(dbBalances!.map((r) => [r.id, Number(r.balance)]));
  const checks = verifyBalances(src, fromDb, data);
  const local = verifyBalances(src, accountBalances(data), data);
  console.table(checks);
  if (!checks.every((c) => c.ok) || !local.every((c) => c.ok)) throw new Error("Saldos não conferem — revise antes de usar.");

  await sb.from("import_batches").insert({
    source: "fcs-v1",
    summary: {
      file: file.split("/").pop(),
      movements: data.movements.length,
      transfers: data.transfers.length,
      recurrences: data.recurrences.length,
      contacts: data.contacts.length,
      balances: checks,
      warnings,
    },
  });
  if (warnings.length) console.log("Avisos:\n - " + warnings.join("\n - "));
  console.log("Importação concluída e saldos conferidos.");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
