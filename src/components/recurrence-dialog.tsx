"use client";

import { Ban, Check, Loader2, RotateCcw } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/primitives";
import { formatBRL, formatDate } from "@/lib/format";
import { cancelRecurrence, logAmountChange, reactivateRecurrence, updateRecurrence } from "@/lib/mutations";
import { PERIOD_LABEL, type SeriesStats } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { useFinance } from "./finance-provider";
import { useMovementDialog } from "./movement-dialog";
import { useToast } from "./toast";

const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maskMoney = (raw: string) => {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  return digits ? money.format(Number(digits) / 100) : "";
};
const parseMoney = (s: string) => Number(s.replace(/\D/g, "") || 0) / 100;
const inputClass = "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40";

/** Editar, encerrar ou reativar uma série recorrente. */
export function RecurrenceDialog({ stats, onClose }: { stats: SeriesStats; onClose: () => void }) {
  const { data, today, reload } = useFinance();
  const { open: openMovement } = useMovementDialog();
  const toast = useToast();
  const r = stats.recurrence;
  const [description, setDescription] = React.useState(r.description);
  const [amount, setAmount] = React.useState(money.format(r.amount));
  const [categoryId, setCategoryId] = React.useState(r.categoryId ?? "");
  const [contactId, setContactId] = React.useState(r.contactId ?? "");
  const [accountId, setAccountId] = React.useState(r.bankAccountId ?? "");
  const [applyOpen, setApplyOpen] = React.useState(true);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const groups = new Map(data?.groups.map((g) => [g.id, g]) ?? []);
  const categories = (data?.categories ?? []).filter((c) => groups.get(c.groupId)?.type === r.type).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const contacts = (data?.contacts ?? []).filter((c) => !c.deleted).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const accounts = data?.accounts ?? [];
  const openCount = stats.movements.filter((m) => !m.paid && m.date >= today).length;
  const timeline = [...stats.movements.filter((m) => m.date < today).slice(-3), ...stats.movements.filter((m) => m.date >= today).slice(0, 4)];

  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      await reload();
      toast({ tone: "success", title: ok });
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    const value = parseMoney(amount);
    if (!description.trim() || value <= 0) return setMessage("Informe descrição e valor.");
    return act(async () => {
      await updateRecurrence(
        r.id,
        { description: description.trim(), amount: value, categoryId: categoryId || null, contactId: contactId || null, bankAccountId: accountId || null },
        applyOpen ? today : null,
      );
      if (Math.abs(value - r.amount) >= 0.005)
        await logAmountChange({
          movementId: null,
          recurrenceId: r.id,
          contactId: contactId || null,
          description: description.trim(),
          oldAmount: r.amount,
          newAmount: value,
          scope: "this_and_next",
          effectiveDate: today,
          affectedCount: applyOpen ? openCount : 0,
        });
    },
      applyOpen && openCount ? `Série atualizada · ${openCount} lançamentos em aberto ajustados` : "Série atualizada",
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(760px,calc(100vw-2rem))]">
        <div className="border-b px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold">{r.description || "Recorrência"}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            {r.type === "inflow" ? "Entrada" : "Saída"} · {PERIOD_LABEL[r.period]} {r.quantity ? `· ${r.quantity} parcelas` : "· sem fim"} · desde {formatDate(r.startDate)}
          </DialogDescription>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_250px]">
          <div className="space-y-3.5">
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">Descrição</span>
              <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium">Valor</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1.5 text-[12px] text-muted-foreground">R$</span>
                  <input inputMode="decimal" className={cn(inputClass, "pl-8 tabular")} value={amount} onChange={(e) => setAmount(maskMoney(e.target.value))} />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium">Conta</span>
                <select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">Categoria</span>
              <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">{r.type === "inflow" ? "Cliente" : "Fornecedor"}</span>
              <select className={inputClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Nenhum</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-[12.5px]">
              <input type="checkbox" checked={applyOpen} onChange={(e) => setApplyOpen(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
              <span>
                Aplicar também aos <b>{openCount} lançamentos em aberto</b> de hoje em diante
                <span className="block text-muted-foreground">Os já recebidos/pagos e os vencidos não mudam.</span>
              </span>
            </label>
          </div>

          <div>
            <div className="text-eyebrow uppercase text-muted-foreground">Linha do tempo</div>
            <ol className="mt-3 space-y-0">
              {timeline.map((m) => (
                <li key={m.id} className="relative flex gap-3 pb-3 pl-1">
                  <span className={cn("mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-card", m.paid ? "bg-success" : m.date < today ? "bg-destructive" : "bg-muted-foreground/40")} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => openMovement({ kind: m.type, movement: m })}>
                    <div className="flex justify-between gap-2 text-[12.5px]">
                      <span className="tabular">{formatDate(m.date)}</span>
                      <span className="font-medium tabular">{formatBRL(m.amount)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{m.paid ? "Quitado" : m.date < today ? "Vencido" : "Em aberto"}</div>
                  </button>
                </li>
              ))}
              {timeline.length === 0 && <li className="text-[12.5px] text-muted-foreground">Nenhum lançamento.</li>}
            </ol>
            <div className="mt-2 space-y-1 border-t pt-3 text-[12px] text-muted-foreground">
              <div className="flex justify-between"><span>Lançados até hoje</span><b className="text-foreground">{stats.launched}</b></div>
              <div className="flex justify-between"><span>Quitados</span><b className="text-foreground">{stats.paidCount}</b></div>
              <div className="flex justify-between"><span>A vencer</span><b className="text-foreground tabular">{formatBRL(stats.openFuture)}</b></div>
              {stats.overdue.length > 0 && (
                <div className="flex justify-between"><span>Em atraso</span><Badge tone="danger">{stats.overdue.length}</Badge></div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sticky bottom-0 z-10 rounded-b-xl border-t bg-card bg-[linear-gradient(var(--muted),var(--muted))] px-5 py-3">
          {r.active ? (
            <Button
              variant={confirmCancel ? "danger" : "ghost"}
              size="md"
              disabled={busy}
              className={cn(!confirmCancel && "text-destructive-foreground")}
              onBlur={() => setConfirmCancel(false)}
              onClick={() => (confirmCancel ? void act(() => cancelRecurrence(r.id, today), "Série encerrada") : setConfirmCancel(true))}
            >
              <Ban /> {confirmCancel ? `Encerrar e apagar ${openCount} em aberto` : "Encerrar série"}
            </Button>
          ) : (
            <Button variant="ghost" size="md" disabled={busy} onClick={() => void act(() => reactivateRecurrence(r.id), "Série reativada")}>
              <RotateCcw /> Reativar
            </Button>
          )}
          <span className={cn("flex-1 text-[12px]", message ? "text-destructive-foreground" : "text-muted-foreground")}>{message}</span>
          <Button size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} Salvar série
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
