/**
 * Converte o arquivo de exportação do FCS V1 (schemaVersion 1) para o modelo do sistema.
 * Usado pelo script de importação para o Supabase e pelo modo de dados local em desenvolvimento.
 */
import type {
  BankAccount,
  Category,
  CategoryGroup,
  Contact,
  DfcSection,
  FinanceData,
  Movement,
  MovementType,
  Recurrence,
  RecurrencePeriod,
  Transfer,
} from "./types";

export interface LegacyExport {
  schemaVersion: number;
  workspace: { name: string; taxId: string | null; plan: string };
  categoriesGroups: { name: string; index: number; reportSection: string; color: string; isRevenue: boolean }[];
  categories: { name: string; type: "Inflow" | "Outflow"; groupName: string }[];
  costCenters: unknown[];
  bankAccounts: {
    name: string;
    initialBalance: number;
    currentBalance: number;
    accountNumber: string | null;
    branch: string | null;
    active: boolean;
  }[];
  stakeholders: {
    name: string;
    taxId: string | null;
    personType: string;
    email: string | null;
    phone: string | null;
    types: string[];
    notes: string | null;
    deleted: boolean;
  }[];
  recurrences: {
    ref: string;
    type: "Inflow" | "Outflow";
    date: string;
    value: number;
    period: string;
    quantity: number | null;
    fixed: boolean;
    active: boolean;
    nextMovementDate: string | null;
    bankAccountName: string | null;
    categoryName: string | null;
    stakeholderRef: string | null;
    description: string;
  }[];
  cashTransfers: {
    date: string;
    value: number;
    description: string;
    sourceBankAccountName: string;
    destinationBankAccountName: string;
  }[];
  movements: {
    movementType: "Inflow" | "Outflow";
    date: string;
    value: number;
    description: string;
    bankAccountName: string;
    categoryName: string | null;
    stakeholderRef: string | null;
    reference: string | null;
    notes: string | null;
    competenceDate: string | null;
    dueDate: string | null;
    isCompleted: boolean;
    installment: number;
    totalInstallment: number;
    recurrenceRef: string | null;
  }[];
}

const PERIODS: Record<string, RecurrencePeriod> = {
  Daily: "daily",
  Weekly: "weekly",
  Biweekly: "biweekly",
  Monthly: "monthly",
  Quarterly: "quarterly",
  Semiannual: "semiannual",
  Semester: "semiannual",
  Yearly: "annual",
  Annual: "annual",
};

function sectionOf(g: LegacyExport["categoriesGroups"][number]): DfcSection {
  switch (g.reportSection) {
    case "OperationalActivities":
      return g.isRevenue ? "operating_revenue" : "variable_costs";
    case "FinancialResult":
      return g.index === 0 ? "fixed_expenses" : "financial_other";
    case "CashierActivities":
      return g.index === 0 ? "investments" : "partners_loans";
    default:
      return g.isRevenue ? "operating_revenue" : "fixed_expenses";
  }
}

const type = (t: "Inflow" | "Outflow"): MovementType => (t === "Inflow" ? "inflow" : "outflow");
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

export interface ConvertResult {
  data: FinanceData;
  /** Chaves de origem por id gerado (para importação idempotente). */
  legacyKeys: { contacts: Record<string, string>; recurrences: Record<string, string> };
  warnings: string[];
}

export function convertLegacyExport(src: LegacyExport, newId: () => string = () => crypto.randomUUID()): ConvertResult {
  if (src.schemaVersion !== 1) throw new Error(`Versão de exportação não suportada: ${src.schemaVersion}`);
  const warnings: string[] = [];

  const groupByName = new Map<string, CategoryGroup>();
  const groups: CategoryGroup[] = src.categoriesGroups.map((g, i) => {
    const group: CategoryGroup = {
      id: newId(),
      name: g.name.trim(),
      type: g.isRevenue ? "inflow" : "outflow",
      section: sectionOf(g),
      color: g.color,
      position: i,
    };
    groupByName.set(g.name, group);
    return group;
  });

  const catByName = new Map<string, Category>();
  const categories: Category[] = src.categories.map((c, i) => {
    const group = groupByName.get(c.groupName);
    if (!group) throw new Error(`Categoria "${c.name}" aponta para grupo inexistente "${c.groupName}"`);
    const cat: Category = { id: newId(), groupId: group.id, name: c.name.trim(), icon: null, position: i };
    catByName.set(c.name, cat);
    return cat;
  });

  const accByName = new Map<string, BankAccount>();
  const accounts: BankAccount[] = src.bankAccounts.map((a, i) => {
    const acc: BankAccount = {
      id: newId(),
      name: a.name.trim(),
      bank: null,
      branch: clean(a.branch),
      accountNumber: clean(a.accountNumber),
      initialBalance: a.initialBalance,
      color: null,
      active: a.active,
      position: i,
    };
    accByName.set(a.name, acc);
    return acc;
  });

  const contactKeys: Record<string, string> = {};
  const contactByName = new Map<string, Contact>();
  const contacts: Contact[] = [];
  for (const s of src.stakeholders) {
    const existing = contactByName.get(s.name);
    // Nome duplicado: o registro ativo vence o excluído.
    if (existing && !(existing.deleted && !s.deleted)) {
      warnings.push(`Contato duplicado ignorado: "${s.name.trim()}"`);
      continue;
    }
    const c: Contact = {
      id: existing?.id ?? newId(),
      name: s.name.trim(),
      isCustomer: s.types.includes("Customer"),
      isSupplier: s.types.includes("Supplier") || s.types.includes("Provider"),
      personType: s.personType === "LegalPerson" ? "legal" : "natural",
      taxId: clean(s.taxId),
      email: clean(s.email),
      phone: clean(s.phone),
      address: {},
      notes: clean(s.notes),
      deleted: s.deleted,
    };
    if (existing) contacts[contacts.indexOf(existing)] = c;
    else contacts.push(c);
    contactByName.set(s.name, c);
    contactKeys[c.id] = s.name;
  }

  const refAccount = (name: string | null, ctx: string) => {
    if (!name) return null;
    const a = accByName.get(name);
    if (!a) warnings.push(`${ctx}: conta "${name}" não encontrada`);
    return a?.id ?? null;
  };
  const refCategory = (name: string | null) => (name ? catByName.get(name)?.id ?? null : null);
  const refContact = (name: string | null) => (name ? contactByName.get(name)?.id ?? null : null);

  const recurrenceKeys: Record<string, string> = {};
  const recByRef = new Map<string, Recurrence>();
  const recurrences: Recurrence[] = src.recurrences.map((r) => {
    const rec: Recurrence = {
      id: newId(),
      type: type(r.type),
      startDate: r.date,
      amount: r.value,
      period: PERIODS[r.period] ?? "monthly",
      quantity: r.quantity,
      fixed: r.fixed,
      active: r.active,
      nextDate: r.nextMovementDate,
      bankAccountId: refAccount(r.bankAccountName, "Recorrência"),
      categoryId: refCategory(r.categoryName),
      contactId: refContact(r.stakeholderRef),
      description: r.description.trim(),
    };
    if (!PERIODS[r.period]) warnings.push(`Periodicidade desconhecida "${r.period}" tratada como mensal`);
    recByRef.set(r.ref, rec);
    recurrenceKeys[rec.id] = r.ref;
    return rec;
  });

  const movements: Movement[] = src.movements.map((m) => {
    const accountId = refAccount(m.bankAccountName, "Lançamento");
    if (!accountId) throw new Error(`Lançamento sem conta válida: ${m.date} ${m.description}`);
    return {
      id: newId(),
      type: type(m.movementType),
      date: m.date,
      competenceDate: m.competenceDate,
      dueDate: m.dueDate,
      amount: m.value,
      description: m.description.trim(),
      bankAccountId: accountId,
      categoryId: refCategory(m.categoryName),
      contactId: refContact(m.stakeholderRef),
      recurrenceId: m.recurrenceRef ? recByRef.get(m.recurrenceRef)?.id ?? null : null,
      paid: m.isCompleted,
      installment: m.installment,
      totalInstallments: m.totalInstallment,
      documentNumber: clean(m.reference),
      notes: clean(m.notes),
    };
  });

  const transfers: Transfer[] = src.cashTransfers.map((t) => {
    const s = refAccount(t.sourceBankAccountName, "Transferência");
    const d = refAccount(t.destinationBankAccountName, "Transferência");
    if (!s || !d) throw new Error(`Transferência com conta inválida em ${t.date}`);
    return { id: newId(), date: t.date, amount: t.value, description: t.description.trim(), sourceAccountId: s, destinationAccountId: d };
  });

  return {
    data: { companyName: src.workspace.name.trim(), companyTaxId: src.workspace.taxId, accounts, groups, categories, contacts, recurrences, movements, transfers, cards: [] },
    legacyKeys: { contacts: contactKeys, recurrences: recurrenceKeys },
    warnings,
  };
}

/** Confere os saldos calculados contra os saldos que o próprio export informa. */
export function verifyBalances(src: LegacyExport, computed: Record<string, number>, data: FinanceData) {
  return src.bankAccounts.map((a) => {
    const acc = data.accounts.find((x) => x.name === a.name.trim())!;
    const got = computed[acc.id];
    return { account: acc.name, expected: a.currentBalance, computed: got, ok: Math.abs(got - a.currentBalance) < 0.005 };
  });
}
