/**
 * Importa o export do FCS V1 (arquivo .json) para o Supabase e confere os saldos.
 *
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npx tsx scripts/import-legacy.ts /caminho/dados.json
 *
 * Tudo roda numa única transação pela Management API do Supabase: se o banco já tiver
 * lançamentos, ou se o saldo de alguma conta não bater com o informado no export,
 * nada é gravado.
 */
import { readFileSync } from "node:fs";
import { accountBalances } from "../src/lib/finance";
import { convertLegacyExport, verifyBalances, type LegacyExport } from "../src/lib/legacy-import";

const [file] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!file || !token || !ref) {
  console.error("Uso: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npx tsx scripts/import-legacy.ts dados.json");
  process.exit(1);
}

async function query<T = unknown>(sql: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body}`);
  return JSON.parse(body) as T;
}

/** Literal SQL seguro para um JSON (dollar-quoting com marcador que não aparece no texto). */
function jsonLiteral(rows: unknown): string {
  const text = JSON.stringify(rows);
  let tag = "j";
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$::json`;
}

const insert = (table: string, rows: Record<string, unknown>[]) =>
  rows.length ? `insert into ${table} select * from json_populate_recordset(null::${table}, ${jsonLiteral(rows)});` : "";

async function main() {
  const src = JSON.parse(readFileSync(file, "utf8")) as LegacyExport;
  const { data, legacyKeys, warnings } = convertLegacyExport(src);

  const local = verifyBalances(src, accountBalances(data), data);
  if (!local.every((c) => c.ok)) {
    console.table(local);
    throw new Error("Os saldos recalculados do arquivo não batem com os saldos do próprio export.");
  }

  const now = new Date().toISOString();
  const expected = Object.fromEntries(data.accounts.map((a) => [a.id, src.bankAccounts.find((b) => b.name.trim() === a.name)!.currentBalance]));
  const sql = `
begin;
do $$ begin
  if exists (select 1 from movements) then raise exception 'O banco já tem lançamentos — a importação é feita uma única vez.'; end if;
end $$;
insert into company (id, name, tax_id) values (1, ${jsonLiteral(data.companyName)}::jsonb #>> '{}', ${jsonLiteral(src.workspace.taxId)}::jsonb #>> '{}')
  on conflict (id) do update set name = excluded.name, tax_id = excluded.tax_id;
${insert("bank_accounts", data.accounts.map((a) => ({
    id: a.id, name: a.name, bank: a.bank, branch: a.branch, account_number: a.accountNumber,
    initial_balance: a.initialBalance, color: a.color, active: a.active, position: a.position, created_at: now,
  })))}
${insert("category_groups", data.groups.map((g) => ({
    id: g.id, name: g.name, type: g.type, section: g.section, color: g.color, position: g.position, created_at: now,
  })))}
${insert("categories", data.categories.map((c) => ({
    id: c.id, group_id: c.groupId, name: c.name, icon: c.icon, position: c.position, created_at: now,
  })))}
${insert("contacts", data.contacts.map((c) => ({
    id: c.id, name: c.name, is_customer: c.isCustomer, is_supplier: c.isSupplier, person_type: "natural", foreign_: false,
    tax_id: c.taxId, email: c.email, phone: c.phone, address: {}, notes: c.notes, deleted: c.deleted,
    legacy_key: legacyKeys.contacts[c.id], created_at: now,
  })))}
${insert("recurrences", data.recurrences.map((r) => ({
    id: r.id, type: r.type, start_date: r.startDate, amount: r.amount, period: r.period, quantity: r.quantity,
    fixed: r.fixed, active: r.active, next_date: r.nextDate, bank_account_id: r.bankAccountId,
    category_id: r.categoryId, contact_id: r.contactId, description: r.description, document_number: null,
    notes: null, legacy_ref: legacyKeys.recurrences[r.id], created_at: now,
  })))}
${insert("movements", data.movements.map((m) => ({
    id: m.id, type: m.type, date: m.date, competence_date: m.competenceDate, due_date: m.dueDate,
    amount: m.amount, description: m.description, bank_account_id: m.bankAccountId, category_id: m.categoryId,
    contact_id: m.contactId, recurrence_id: m.recurrenceId, paid: m.paid, installment: m.installment,
    total_installments: m.totalInstallments, document_number: m.documentNumber, notes: m.notes, fees: [],
    origin: "fcs-v1", created_at: now, updated_at: now,
  })))}
${insert("transfers", data.transfers.map((t) => ({
    id: t.id, date: t.date, amount: t.amount, description: t.description,
    source_account_id: t.sourceAccountId, destination_account_id: t.destinationAccountId, created_at: now,
  })))}
do $$
declare r record;
begin
  for r in
    select b.name, b.balance, e.value::numeric as expected
    from account_balances b join json_each_text(${jsonLiteral(expected)}) e on e.key::uuid = b.id
  loop
    if r.balance <> r.expected then
      raise exception 'Saldo de % não confere: banco % × export %', r.name, r.balance, r.expected;
    end if;
  end loop;
end $$;
insert into import_batches (source, summary) values ('fcs-v1', ${jsonLiteral({
    file: file.split("/").pop(),
    movements: data.movements.length,
    transfers: data.transfers.length,
    recurrences: data.recurrences.length,
    contacts: data.contacts.length,
    balances: local,
    warnings,
  })}::jsonb);
commit;`;

  console.log("Importando em uma transação…");
  await query(sql);
  const balances = await query<{ name: string; balance: string }[]>("select name, balance from account_balances order by name");
  const counts = await query<Record<string, number>[]>(
    "select (select count(*) from movements) movimentos, (select count(*) from transfers) transferencias, (select count(*) from recurrences) recorrencias, (select count(*) from contacts) contatos, (select count(*) from categories) categorias",
  );
  console.table(balances);
  console.table(counts);
  if (warnings.length) console.log("Avisos:\n - " + warnings.join("\n - "));
  console.log("Importação concluída e saldos conferidos.");
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
