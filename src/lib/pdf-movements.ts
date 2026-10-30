/** Relatório de lançamentos em PDF (A4 deitado), gerado no navegador. */
import type { Movement } from "./types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (d: string) => d.split("-").reverse().join("/");
const ORANGE: [number, number, number] = [227, 95, 32];
const GRAY: [number, number, number] = [110, 110, 110];
const RED: [number, number, number] = [200, 40, 40];
const GREEN: [number, number, number] = [21, 128, 61];

export interface PdfOptions {
  company: string;
  period: { start: string; end: string };
  /** Linhas de texto com os filtros aplicados (ex.: "Categorias: Mensalidade, Freelancer"). */
  filters: string[];
  rows: Movement[];
  names: { account: (id: string) => string; category: (id: string | null) => string; contact: (id: string | null) => string };
  today: string;
}

export async function downloadMovementsPdf(o: PdfOptions) {
  // Carrega a biblioteca só quando alguém pede o PDF.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  const inflow = o.rows.filter((m) => m.type === "inflow").reduce((s, m) => s + m.amount, 0);
  const outflow = o.rows.filter((m) => m.type === "outflow").reduce((s, m) => s + m.amount, 0);
  const open = o.rows.filter((m) => !m.paid).reduce((s, m) => s + (m.type === "inflow" ? m.amount : -m.amount), 0);

  // Cabeçalho
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, W, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text("Entradas e saídas", M, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text(`${o.company} · Período: ${dateBR(o.period.start)} a ${dateBR(o.period.end)}`, M, 22);
  doc.text(`Gerado em ${dateBR(o.today)}`, W - M, 16, { align: "right" });
  let y = 27;
  for (const f of o.filters) {
    const lines = doc.splitTextToSize(f, W - 2 * M);
    doc.text(lines, M, y);
    y += 4.5 * lines.length;
  }

  // Resumo
  const boxes: [string, string, [number, number, number]][] = [
    ["Lançamentos", String(o.rows.length), [30, 30, 30]],
    ["Entradas", brl.format(inflow), GREEN],
    ["Saídas", brl.format(outflow), RED],
    ["Resultado", brl.format(inflow - outflow), inflow - outflow < 0 ? RED : [30, 30, 30]],
    ["Em aberto (saldo)", brl.format(open), [161, 98, 7]],
  ];
  const bw = (W - 2 * M - 4 * 4) / boxes.length;
  y += 1;
  boxes.forEach(([label, value, color], i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(225, 225, 225);
    doc.setFillColor(250, 248, 246);
    doc.roundedRect(x, y, bw, 15, 2, 2, "FD");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(label.toUpperCase(), x + 3.5, y + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(value, x + 3.5, y + 11.8);
    doc.setFont("helvetica", "normal");
  });
  y += 21;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 14 },
    head: [["Data", "Descrição", "Cliente / Fornecedor", "Categoria", "Conta", "Situação", "Valor"]],
    body: o.rows.map((m) => [
      dateBR(m.date),
      m.description + (m.totalInstallments > 0 ? ` (${m.installment}/${m.totalInstallments})` : ""),
      o.names.contact(m.contactId) || "-",
      o.names.category(m.categoryId) || "-",
      o.names.account(m.bankAccountId),
      m.paid ? (m.type === "inflow" ? "Recebido" : "Pago") : m.date < o.today ? "Vencido" : m.type === "inflow" ? "A receber" : "A pagar",
      (m.type === "outflow" ? "- " : "") + brl.format(m.amount),
    ]),
    foot: [["", "", "", "", "", "Total", brl.format(inflow - outflow)]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, textColor: [40, 40, 40], lineColor: [235, 235, 235], lineWidth: 0.1 },
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [245, 242, 239], textColor: [30, 30, 30], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 251, 250] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 62 },
      2: { cellWidth: 62 },
      3: { cellWidth: 38 },
      4: { cellWidth: 32 },
      5: { cellWidth: 20 },
      6: { cellWidth: "auto", halign: "right" },
    },
    didParseCell: (h) => {
      // A fonte padrão do PDF não tem "−" nem "—": usamos hífen comum.
      if (h.section !== "body" && h.column.index === 6) h.cell.styles.halign = "right";
      if (h.section !== "body") return;
      const m = o.rows[h.row.index];
      if (h.column.index === 6 && m.type === "outflow") h.cell.styles.textColor = RED;
      if (h.column.index === 5) h.cell.styles.textColor = m.paid ? GREEN : m.date < o.today ? RED : [161, 98, 7];
    },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text(`${o.company} · Connect Financeiro`, M, H - 7);
      doc.text(`Página ${doc.getNumberOfPages()}`, W - M, H - 7, { align: "right" });
    },
  });

  doc.save(`movimentos_${o.period.start}_${o.period.end}.pdf`);
}
