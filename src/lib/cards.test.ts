import { describe, expect, it } from "vitest";
import { buildPurchase, closingForDue, datesOfInvoiceMonth, invoiceFor, invoiceStatus } from "./cards";
import type { CreditCard } from "./types";

const card: CreditCard = { id: "c1", name: "Visa", brand: "Visa", limit: 5000, closingDay: 3, dueDay: 10, payerAccountId: "a1", autoDebit: false };
const lateDue: CreditCard = { ...card, closingDay: 25, dueDay: 5 };

describe("faturas", () => {
  it("compra antes do fechamento cai na fatura do mês", () => {
    expect(invoiceFor(card, "2026-10-02")).toEqual({ closing: "2026-10-03", due: "2026-10-10" });
  });
  it("compra no dia do fechamento vai para a próxima", () => {
    expect(invoiceFor(card, "2026-10-03")).toEqual({ closing: "2026-11-03", due: "2026-11-10" });
  });
  it("vencimento antes do fechamento é no mês seguinte", () => {
    expect(invoiceFor(lateDue, "2026-10-16")).toEqual({ closing: "2026-10-25", due: "2026-11-05" });
    expect(invoiceFor(lateDue, "2026-12-26")).toEqual({ closing: "2027-01-25", due: "2027-02-05" });
    expect(datesOfInvoiceMonth(lateDue, "2026-12-01")).toEqual({ closing: "2026-12-25", due: "2027-01-05" });
  });
  it("fechamento a partir do vencimento", () => {
    expect(closingForDue(card, "2026-11-10")).toBe("2026-11-03");
    expect(closingForDue(lateDue, "2027-01-05")).toBe("2026-12-25");
  });
  it("situação", () => {
    const inv = { closing: "2026-11-03", due: "2026-11-10", items: [] };
    expect(invoiceStatus(inv, "2026-10-16")).toBe("open");
    expect(invoiceStatus(inv, "2026-11-05")).toBe("closed");
    expect(invoiceStatus(inv, "2026-09-01")).toBe("future");
  });
});

describe("compras", () => {
  it("parcela com os centavos na primeira", () => {
    const items = buildPurchase(card, { amount: 100, date: "2026-10-16", installments: 3, description: "Notebook", categoryId: null, contactId: null, notes: null });
    expect(items.map((m) => m.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(items.map((m) => m.date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(items.every((m) => m.competenceDate === "2026-10-16" && m.origin === "card:c1" && m.bankAccountId === "a1")).toBe(true);
    expect(items.map((m) => m.installment)).toEqual([1, 2, 3]);
  });
});
