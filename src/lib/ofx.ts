/** Leitura de extrato OFX (SGML 1.x ou XML 2.x), como o exportado pelo Bradesco Net Empresa. */
import type { ISODate } from "./types";

export interface OfxTransaction {
  fitId: string;
  date: ISODate;
  /** Positivo = crédito, negativo = débito. */
  amount: number;
  type: string;
  memo: string;
  checkNumber: string | null;
}

export interface OfxStatement {
  bankId: string | null;
  branchId: string | null;
  accountId: string | null;
  start: ISODate | null;
  end: ISODate | null;
  balance: number | null;
  balanceDate: ISODate | null;
  transactions: OfxTransaction[];
}

/**
 * Decodifica o arquivo. Bancos brasileiros costumam declarar CHARSET:1252, mas alguns mandam UTF-8 mesmo assim:
 * tenta UTF-8 estrito primeiro (texto 1252 com acento quase nunca é UTF-8 válido) e cai para 1252.
 */
export function decodeOfx(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** Valor de uma tag (funciona com ou sem a tag de fechamento). */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1].trim() : null;
}

const ofxDate = (s: string | null): ISODate | null => (s && /^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

/** "1.234,56" ou "1234.56" ou "-1234,56" → número. */
function ofxAmount(s: string | null): number {
  if (!s) return 0;
  const t = s.replace(/\s/g, "");
  const normalized = t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Math.round(Number(normalized) * 100) / 100;
}

const clean = (s: string | null) =>
  (s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export function parseOfx(text: string): OfxStatement {
  if (!/<OFX>/i.test(text)) throw new Error("O arquivo não parece ser um extrato OFX.");
  const transactions: OfxTransaction[] = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
  let m: RegExpExecArray | null;
  let seq = 0;
  while ((m = re.exec(text))) {
    const b = m[1];
    const date = ofxDate(tag(b, "DTPOSTED"));
    if (!date) continue;
    const amount = ofxAmount(tag(b, "TRNAMT"));
    const memo = clean(tag(b, "MEMO")) || clean(tag(b, "NAME")) || clean(tag(b, "PAYEE"));
    seq++;
    transactions.push({
      fitId: tag(b, "FITID") || `${date}-${amount}-${seq}`,
      date,
      amount,
      type: (tag(b, "TRNTYPE") ?? "").toUpperCase(),
      memo,
      checkNumber: tag(b, "CHECKNUM"),
    });
  }
  const ledger = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(text)?.[1] ?? "";
  return {
    bankId: tag(text, "BANKID"),
    branchId: tag(text, "BRANCHID"),
    accountId: tag(text, "ACCTID"),
    start: ofxDate(tag(text, "DTSTART")),
    end: ofxDate(tag(text, "DTEND")),
    balance: ledger ? ofxAmount(tag(ledger, "BALAMT")) : null,
    balanceDate: ledger ? ofxDate(tag(ledger, "DTASOF")) : null,
    transactions: transactions.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
