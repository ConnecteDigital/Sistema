/**
 * Conciliação: compara as linhas do extrato do banco com o que está lançado no sistema.
 *
 * Para cada linha do banco procura, na mesma conta, algo com o mesmo valor (ao centavo) e data próxima:
 * um lançamento, uma transferência entre contas ou uma fatura de cartão inteira (o banco debita o total).
 */
import { cardIdOf } from "./cards";
import { daysBetween } from "./dates";
import type { OfxStatement, OfxTransaction } from "./ofx";
import type { FinanceData, ISODate } from "./types";

export const ofxOrigin = (fitId: string) => `ofx:${fitId}`;

export interface Candidate {
  kind: "movement" | "invoice" | "transfer";
  /** Ids dos lançamentos (vários numa fatura) ou da transferência. */
  ids: string[];
  date: ISODate;
  /** Com sinal: + entra na conta, − sai. */
  amount: number;
  paid: boolean;
  label: string;
  origin: string | null;
}

export type LineStatus = "reconciled" | "suggested" | "new";

export interface ReconLine {
  tx: OfxTransaction;
  status: LineStatus;
  candidate: Candidate | null;
}

export interface Reconciliation {
  lines: ReconLine[];
  /** Baixados no sistema dentro do período do extrato, mas que o banco não mostra. */
  onlyInSystem: Candidate[];
}

export function candidatesFor(data: FinanceData, accountId: string): Candidate[] {
  const out: Candidate[] = [];
  const invoices = new Map<string, Candidate>();
  for (const m of data.movements) {
    if (m.bankAccountId !== accountId) continue;
    const amount = m.type === "inflow" ? m.amount : -m.amount;
    const cardId = cardIdOf(m);
    if (cardId) {
      const key = `${cardId}|${m.date}`;
      const inv = invoices.get(key);
      const card = data.cards.find((c) => c.id === cardId);
      if (inv) {
        inv.ids.push(m.id);
        inv.amount = Math.round((inv.amount + amount) * 100) / 100;
        inv.paid = inv.paid && m.paid;
      } else {
        invoices.set(key, { kind: "invoice", ids: [m.id], date: m.date, amount, paid: m.paid, label: `Fatura ${card?.name ?? "do cartão"}`, origin: m.origin ?? null });
      }
      continue;
    }
    out.push({ kind: "movement", ids: [m.id], date: m.date, amount, paid: m.paid, label: m.description, origin: m.origin ?? null });
  }
  for (const t of data.transfers) {
    if (t.sourceAccountId === accountId) out.push({ kind: "transfer", ids: [t.id], date: t.date, amount: -t.amount, paid: true, label: t.description || "Transferência", origin: null });
    if (t.destinationAccountId === accountId) out.push({ kind: "transfer", ids: [t.id], date: t.date, amount: t.amount, paid: true, label: t.description || "Transferência", origin: null });
  }
  return [...out, ...invoices.values()];
}

export function reconcile(data: FinanceData, accountId: string, stmt: OfxStatement, toleranceDays = 5): Reconciliation {
  const candidates = candidatesFor(data, accountId);
  const used = new Set<Candidate>();
  const byOrigin = new Map(candidates.filter((c) => c.origin?.startsWith("ofx:")).map((c) => [c.origin!, c]));
  const lines: ReconLine[] = stmt.transactions.map((tx) => {
    const exact = byOrigin.get(ofxOrigin(tx.fitId));
    if (exact && !used.has(exact)) {
      used.add(exact);
      return { tx, status: exact.paid ? "reconciled" : "suggested", candidate: exact };
    }
    return { tx, status: "new", candidate: null };
  });

  // Primeiro os casamentos de mesma data, depois os mais distantes (evita roubar o par certo de outra linha).
  const pending = lines.filter((l) => !l.candidate);
  const pairs: { line: ReconLine; c: Candidate; score: number }[] = [];
  for (const line of pending) {
    for (const c of candidates) {
      if (Math.abs(c.amount - line.tx.amount) > 0.005) continue;
      const days = Math.abs(daysBetween(c.date, line.tx.date));
      if (days > toleranceDays) continue;
      // Já baixado na data certa é o melhor par; em aberto perto da data vem logo depois.
      pairs.push({ line, c, score: days + (c.paid ? 0 : 0.5) + (c.origin?.startsWith("ofx:") ? 100 : 0) });
    }
  }
  pairs.sort((a, b) => a.score - b.score);
  for (const { line, c } of pairs) {
    if (line.candidate || used.has(c)) continue;
    used.add(c);
    line.candidate = c;
    line.status = c.paid ? "reconciled" : "suggested";
  }

  const start = stmt.start ?? stmt.transactions[0]?.date;
  const end = stmt.end ?? stmt.transactions.at(-1)?.date;
  const onlyInSystem =
    start && end ? candidates.filter((c) => c.paid && !used.has(c) && c.date >= start && c.date <= end).sort((a, b) => a.date.localeCompare(b.date)) : [];
  return { lines, onlyInSystem };
}
