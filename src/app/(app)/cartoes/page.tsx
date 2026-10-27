"use client";

import { Check, ChevronLeft, ChevronRight, CreditCard as CardIcon, Pencil, Plus, RotateCcw, ShoppingBag, Trash2, Zap } from "lucide-react";
import * as React from "react";
import { cardGradient, CardDialog, invoiceLabel, PurchaseDialog } from "@/components/card-dialogs";
import { useFinanceActions } from "@/components/finance-actions";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { useMovementDialog } from "@/components/movement-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { cardInvoices, cardUsage, type Invoice, INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/cards";
import { daysBetween } from "@/lib/dates";
import { formatBRL, formatDate, formatDayMonth } from "@/lib/format";
import type { CreditCard } from "@/lib/types";
import { cn, groupColor } from "@/lib/utils";

const STATUS_TONE: Record<InvoiceStatus, "success" | "danger" | "info" | "warning" | "neutral"> = {
  open: "info",
  closed: "warning",
  overdue: "danger",
  paid: "success",
  future: "neutral",
};

function PlasticCard({ card, invoice, usage, selected, onClick, onEdit }: { card: CreditCard; invoice: Invoice | undefined; usage: ReturnType<typeof cardUsage>; selected: boolean; onClick: () => void; onEdit: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative w-[300px] shrink-0 cursor-pointer select-none overflow-hidden rounded-2xl p-5 text-white transition-all duration-300 animate-pop-in",
        selected ? "-translate-y-1 shadow-[0_18px_36px_-14px_rgb(0_0_0/0.55)] ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 shadow-md hover:-translate-y-0.5 hover:opacity-100",
      )}
      style={{ background: cardGradient(card.brand), aspectRatio: "1.586" }}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-black/20 blur-2xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{card.name}</div>
            <div className="text-[11px] uppercase tracking-wider text-white/60">{card.brand ?? "Cartão"}</div>
          </div>
          <button
            className="rounded-md p-1 text-white/60 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Editar cartão"
            title="Editar cartão"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
        <div className="mt-3 h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-500 opacity-90 shadow-inner" />
        <div className="mt-auto">
          <div className="text-[10.5px] uppercase tracking-wider text-white/60">Fatura de {invoice ? invoiceLabel(invoice.due).split("/")[0] : "—"}</div>
          <div className="text-[22px] font-light tabular leading-tight">{formatBRL(invoice?.total ?? 0)}</div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${usage.pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-white/70 tabular">
            <span>Disponível {formatBRL(usage.available)}</span>
            <span>
              fecha {card.closingDay} · vence {card.dueDay}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CartoesPage() {
  const { data, error, today } = useFinance();
  const { open } = useMovementDialog();
  const { setPaid, remove } = useFinanceActions();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [invoiceIdx, setInvoiceIdx] = React.useState<Record<string, number>>({});
  const [editing, setEditing] = React.useState<CreditCard | "new" | null>(null);
  const [buying, setBuying] = React.useState(false);

  const cards = React.useMemo(() => [...(data?.cards ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [data]);
  const perCard = React.useMemo(() => {
    if (!data || !today) return new Map<string, { invoices: Invoice[]; currentIdx: number; usage: ReturnType<typeof cardUsage> }>();
    return new Map(
      cards.map((c) => {
        const invoices = cardInvoices(data, c, today);
        // Fatura "atual": a primeira que ainda não venceu (ou a última, se todas venceram).
        const idx = invoices.findIndex((i) => i.due >= today);
        return [c.id, { invoices, currentIdx: idx < 0 ? invoices.length - 1 : idx, usage: cardUsage(data, c) }];
      }),
    );
  }, [data, today, cards]);

  if (!data || !today) return <LoadingState error={error} />;

  const selected = cards.find((c) => c.id === selectedId) ?? cards[0] ?? null;
  const info = selected ? perCard.get(selected.id) : undefined;
  const idx = selected && info ? Math.min(info.invoices.length - 1, Math.max(0, invoiceIdx[selected.id] ?? info.currentIdx)) : 0;
  const invoice = info?.invoices[idx];

  const current = [...perCard.values()].map((p) => p.invoices[p.currentIdx]).filter(Boolean);
  const currentTotal = current.reduce((s, i) => s + i.total - i.paidTotal, 0);
  const available = [...perCard.values()].reduce((s, p) => s + p.usage.available, 0);
  const totalLimit = cards.reduce((s, c) => s + c.limit, 0);
  const overdue = [...perCard.values()].flatMap((p) => p.invoices.filter((i) => i.status === "overdue"));
  const nextDue = current.filter((i) => i.status !== "paid" && i.total > 0).sort((a, b) => a.due.localeCompare(b.due))[0];
  const upcoming = info ? info.invoices.filter((i) => i.due >= today).slice(0, 8) : [];
  const maxUpcoming = Math.max(1, ...upcoming.map((i) => i.total));

  const lookup = {
    cat: new Map(data.categories.map((c) => [c.id, c])),
    grp: new Map(data.groups.map((g) => [g.id, g])),
    contact: new Map(data.contacts.map((c) => [c.id, c])),
  };

  const go = (delta: number) => selected && setInvoiceIdx((s) => ({ ...s, [selected.id]: idx + delta }));
  const unpaid = invoice ? invoice.items.filter((m) => !m.paid) : [];

  return (
    <>
      <PageHeader
        title="Cartões de"
        accent="crédito"
        description="Compras parceladas caem na fatura certa; pagar a fatura baixa tudo de uma vez."
        actions={
          <>
            <Button size="md" onClick={() => setEditing("new")}>
              <Plus /> Novo cartão
            </Button>
            <Button variant="primary" size="md" disabled={!cards.length} onClick={() => setBuying(true)}>
              <ShoppingBag /> Nova compra
            </Button>
          </>
        }
      />

      {cards.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center animate-pop-in">
          <div className="relative h-[120px] w-[190px]">
            <div className="absolute inset-0 rotate-[-8deg] rounded-xl opacity-40" style={{ background: cardGradient("Visa") }} />
            <div className="absolute inset-0 rotate-[4deg] rounded-xl shadow-lg" style={{ background: cardGradient(null) }}>
              <div className="ml-4 mt-10 h-6 w-9 rounded bg-gradient-to-br from-amber-200 to-amber-500" />
            </div>
          </div>
          <h2 className="mt-8 text-[16px] font-semibold">Nenhum cartão cadastrado</h2>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
            Cadastre o cartão da empresa com o dia de fechamento e de vencimento. Cada compra entra na fatura certa e aparece no fluxo de caixa no dia do vencimento.
          </p>
          <Button variant="primary" size="md" className="mt-5" onClick={() => setEditing("new")}>
            <CardIcon /> Cadastrar cartão
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            <HeroCard label="Faturas atuais" amount={currentTotal} sub={`${cards.length} ${cards.length === 1 ? "cartão" : "cartões"} · em aberto`} />
            <KpiCard label="Limite disponível" tone="info" amount={available} sub={`de ${formatBRL(totalLimit)}`} />
            <KpiCard
              label="Próximo vencimento"
              tone="warning"
              value={nextDue ? formatBRL(nextDue.total - nextDue.paidTotal) : "—"}
              sub={nextDue ? `${formatDate(nextDue.due)} · em ${daysBetween(today, nextDue.due)} dias` : "Nada a pagar"}
            />
            <KpiCard
              label="Faturas vencidas"
              tone={overdue.length ? "danger" : "neutral"}
              value={overdue.length ? formatBRL(overdue.reduce((s, i) => s + i.total - i.paidTotal, 0)) : "0"}
              sub={overdue.length ? `${overdue.length} fatura${overdue.length === 1 ? "" : "s"} sem baixa` : "Tudo em dia"}
            />
          </div>

          <div className="-mx-3 mt-3 flex gap-4 overflow-x-auto px-3 pb-6 pt-3">
            {cards.map((c) => {
              const p = perCard.get(c.id)!;
              return <PlasticCard key={c.id} card={c} invoice={p.invoices[p.currentIdx]} usage={p.usage} selected={c.id === selected?.id} onClick={() => setSelectedId(c.id)} onEdit={() => setEditing(c)} />;
            })}
            <button
              onClick={() => setEditing("new")}
              className="flex w-[180px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              style={{ aspectRatio: "1.13" }}
            >
              <Plus className="size-5" /> Novo cartão
            </button>
          </div>

          {selected && invoice && (
            <div className="grid items-start gap-3 lg:grid-cols-[1fr_300px]">
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => go(-1)} aria-label="Fatura anterior">
                      <ChevronLeft />
                    </Button>
                    <div className="min-w-[170px] text-center">
                      <div className="text-[14px] font-semibold">Fatura de {invoiceLabel(invoice.due)}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        fecha {formatDayMonth(invoice.closing)} · vence {formatDayMonth(invoice.due)}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" disabled={idx >= info!.invoices.length - 1} onClick={() => go(1)} aria-label="Próxima fatura">
                      <ChevronRight />
                    </Button>
                  </div>
                  <Badge tone={STATUS_TONE[invoice.status]} dot>
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </Badge>
                  {selected.autoDebit && (
                    <Badge tone="neutral">
                      <Zap className="size-3" /> Débito automático
                    </Badge>
                  )}
                  <div className="flex-1" />
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">Total</div>
                    <div className="text-[18px] font-semibold tabular">{formatBRL(invoice.total)}</div>
                  </div>
                  {unpaid.length > 0 ? (
                    <Button variant="primary" size="md" onClick={() => setPaid(unpaid.map((m) => m.id), true)}>
                      <Check /> Pagar fatura
                    </Button>
                  ) : (
                    invoice.items.length > 0 && (
                      <Button size="md" onClick={() => setPaid(invoice.items.map((m) => m.id), false)}>
                        <RotateCcw /> Reabrir
                      </Button>
                    )
                  )}
                </div>
                {invoice.items.length === 0 ? (
                  <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                    Nenhuma compra nesta fatura.{" "}
                    <button className="font-medium text-primary hover:underline" onClick={() => setBuying(true)}>
                      Lançar compra
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                        <th className="py-2 pl-5 font-medium">Compra</th>
                        <th className="py-2 font-medium">Descrição</th>
                        <th className="hidden py-2 font-medium md:table-cell">Categoria</th>
                        <th className="py-2 text-right font-medium">Valor</th>
                        <th className="w-20 py-2 pr-5" />
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((m, i) => {
                        const cat = lookup.cat.get(m.categoryId ?? "");
                        const grp = cat && lookup.grp.get(cat.groupId);
                        const contact = lookup.contact.get(m.contactId ?? "");
                        return (
                          <tr key={m.id} className="group border-b last:border-b-0 hover:bg-accent/40 animate-row-in" style={{ animationDelay: `${i * 20}ms` }}>
                            <td className="py-2.5 pl-5 tabular text-muted-foreground">{formatDayMonth(m.competenceDate ?? m.date)}</td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{m.description}</span>
                                {m.totalInstallments > 1 && (
                                  <span className="rounded bg-muted px-1 text-[10.5px] font-medium text-muted-foreground tabular">
                                    {m.installment}/{m.totalInstallments}
                                  </span>
                                )}
                                {m.paid && <Check className="size-3.5 text-success-foreground" />}
                              </div>
                              {contact && <div className="text-[11.5px] text-muted-foreground">{contact.name}</div>}
                            </td>
                            <td className="hidden py-2.5 md:table-cell">
                              {cat ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="size-2 rounded-full" style={{ background: groupColor(grp?.color) }} />
                                  {cat.name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right font-medium tabular">{formatBRL(m.amount)}</td>
                            <td className="py-2.5 pr-5">
                              <div className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                                <button onClick={() => open({ kind: "outflow", movement: m })} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Editar">
                                  <Pencil className="size-3.5" />
                                </button>
                                <button onClick={() => remove([m])} className="rounded p-1 text-muted-foreground hover:bg-destructive-soft hover:text-destructive-foreground" title="Excluir">
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50 font-semibold">
                        <td className="py-2.5 pl-5" colSpan={2}>
                          {invoice.items.length} lançamento{invoice.items.length === 1 ? "" : "s"}
                        </td>
                        <td className="hidden md:table-cell" />
                        <td className="py-2.5 text-right tabular">{formatBRL(invoice.total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </Card>

              <Card className="p-5">
                <div className="text-[13px] font-semibold">Próximas faturas</div>
                <p className="text-[11.5px] text-muted-foreground">Parcelas já comprometidas em {selected.name}</p>
                <div className="mt-4 space-y-2.5">
                  {upcoming.map((inv) => {
                    const i = info!.invoices.indexOf(inv);
                    return (
                      <button key={inv.due} className={cn("block w-full rounded-md text-left transition-colors", i === idx && "bg-accent/60")} onClick={() => setInvoiceIdx((s) => ({ ...s, [selected.id]: i }))}>
                        <div className="flex justify-between px-1 text-[12px]">
                          <span className="capitalize">{invoiceLabel(inv.due)}</span>
                          <span className="font-medium tabular">{formatBRL(inv.total)}</span>
                        </div>
                        <div className="mx-1 mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full origin-left rounded-full bg-primary animate-[bar-grow_0.7s_cubic-bezier(0.16,1,0.3,1)_both]" style={{ width: `${(inv.total / maxUpcoming) * 100}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 space-y-1.5 border-t pt-4 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Limite</span>
                    <span className="tabular">{formatBRL(selected.limit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Comprometido</span>
                    <span className="tabular">{formatBRL(info!.usage.used)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Disponível</span>
                    <span className={cn("tabular", info!.usage.available < 0 && "text-destructive-foreground")}>{formatBRL(info!.usage.available)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paga com</span>
                    <span>{data.accounts.find((a) => a.id === selected.payerAccountId)?.name ?? "—"}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {editing && <CardDialog card={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {buying && <PurchaseDialog cardId={selected?.id ?? null} onClose={() => setBuying(false)} />}
    </>
  );
}
