import { describe, expect, it } from "vitest";
import { parseOfx } from "./ofx";
import { reconcile } from "./reconcile";
import type { FinanceData, Movement } from "./types";

const SGML = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0237<BRANCHID>1234<ACCTID>56789-0</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261015
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005120000[-3:BRT]<TRNAMT>1500.00<FITID>A1<MEMO>PIX RECEBIDO CLIENTE X
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-320,50<FITID>A2<MEMO>PAGTO FATURA CARTAO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261012<TRNAMT>-99.90<FITID>A3<MEMO>TARIFA BANCARIA
</BANKTRANLIST>
<LEDGERBAL><BALAMT>10000.00<DTASOF>20261015</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const mv = (p: Partial<Movement>): Movement => ({
  id: "m", type: "outflow", date: "2026-10-01", competenceDate: null, dueDate: null, amount: 0, description: "", bankAccountId: "a1",
  categoryId: null, contactId: null, recurrenceId: null, paid: false, installment: 0, totalInstallments: 0, documentNumber: null, notes: null, ...p,
});

describe("OFX", () => {
  it("lê SGML sem tags de fechamento, vírgula decimal e saldo", () => {
    const s = parseOfx(SGML);
    expect(s.accountId).toBe("56789-0");
    expect(s.transactions.map((t) => [t.fitId, t.date, t.amount])).toEqual([
      ["A1", "2026-10-05", 1500],
      ["A2", "2026-10-10", -320.5],
      ["A3", "2026-10-12", -99.9],
    ]);
    expect(s.balance).toBe(10000);
    expect(s.start).toBe("2026-10-01");
  });
});

describe("conciliação", () => {
  it("casa lançamento em aberto, fatura do cartão e aponta o que falta", () => {
    const data = {
      accounts: [], groups: [], categories: [], contacts: [], recurrences: [], transfers: [], companyName: "",
      cards: [{ id: "k1", name: "Visa", brand: null, limit: 0, closingDay: 3, dueDay: 10, payerAccountId: "a1", autoDebit: false }],
      movements: [
        mv({ id: "r1", type: "inflow", date: "2026-10-03", amount: 1500 }),
        mv({ id: "c1", date: "2026-10-10", amount: 300, origin: "card:k1" }),
        mv({ id: "c2", date: "2026-10-10", amount: 20.5, origin: "card:k1" }),
        mv({ id: "x", date: "2026-10-08", amount: 50, paid: true }),
      ],
    } as FinanceData;
    const r = reconcile(data, "a1", parseOfx(SGML));
    expect(r.lines.map((l) => [l.tx.fitId, l.status, l.candidate?.ids.join(",") ?? null])).toEqual([
      ["A1", "suggested", "r1"],
      ["A2", "suggested", "c1,c2"],
      ["A3", "new", null],
    ]);
    expect(r.onlyInSystem.map((c) => c.ids[0])).toEqual(["x"]);
  });
});

describe("decodificação", () => {
  it("aceita 1252 e UTF-8", async () => {
    const { decodeOfx } = await import("./ofx");
    const latin = new Uint8Array([0x53, 0x45, 0x52, 0x56, 0x49, 0xc7, 0x4f]); // "SERVIÇO" em 1252
    expect(decodeOfx(latin.buffer)).toBe("SERVIÇO");
    expect(decodeOfx(new TextEncoder().encode("SERVIÇO").buffer as ArrayBuffer)).toBe("SERVIÇO");
  });
});
