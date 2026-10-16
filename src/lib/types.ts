export type MovementType = "inflow" | "outflow";

export type RecurrencePeriod =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type DfcSection =
  | "operating_revenue"
  | "variable_costs"
  | "fixed_expenses"
  | "financial_other"
  | "investments"
  | "partners_loans";

/** Datas sempre como "YYYY-MM-DD" (sem fuso). */
export type ISODate = string;

export interface BankAccount {
  id: string;
  name: string;
  bank: string | null;
  branch: string | null;
  accountNumber: string | null;
  initialBalance: number;
  color: string | null;
  active: boolean;
  position: number;
}

export interface CategoryGroup {
  id: string;
  name: string;
  type: MovementType;
  section: DfcSection;
  color: string;
  position: number;
}

export interface Category {
  id: string;
  groupId: string;
  name: string;
  icon: string | null;
  position: number;
}

export interface Contact {
  id: string;
  name: string;
  isCustomer: boolean;
  isSupplier: boolean;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  deleted: boolean;
}

export interface Recurrence {
  id: string;
  type: MovementType;
  startDate: ISODate;
  amount: number;
  period: RecurrencePeriod;
  quantity: number | null;
  fixed: boolean;
  active: boolean;
  nextDate: ISODate | null;
  bankAccountId: string | null;
  categoryId: string | null;
  contactId: string | null;
  description: string;
}

export interface Movement {
  id: string;
  type: MovementType;
  date: ISODate;
  competenceDate: ISODate | null;
  dueDate: ISODate | null;
  amount: number;
  description: string;
  bankAccountId: string;
  categoryId: string | null;
  contactId: string | null;
  recurrenceId: string | null;
  paid: boolean;
  installment: number;
  totalInstallments: number;
  documentNumber: string | null;
  notes: string | null;
}

export interface Transfer {
  id: string;
  date: ISODate;
  amount: number;
  description: string;
  sourceAccountId: string;
  destinationAccountId: string;
}

export interface FinanceData {
  companyName: string;
  accounts: BankAccount[];
  groups: CategoryGroup[];
  categories: Category[];
  contacts: Contact[];
  recurrences: Recurrence[];
  movements: Movement[];
  transfers: Transfer[];
}

export interface DateRange {
  start: ISODate;
  end: ISODate;
}
