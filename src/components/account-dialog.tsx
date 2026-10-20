"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/primitives";
import { insertAccount, updateAccount } from "@/lib/mutations";
import type { BankAccount } from "@/lib/types";
import { useFinance } from "./finance-provider";
import { useToast } from "./toast";

const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputClass = "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40";

/** Saldo inicial aceita negativo: "-1.234,56". */
function maskSigned(raw: string) {
  const neg = raw.trim().startsWith("-");
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  if (!digits) return neg ? "-" : "";
  return (neg ? "-" : "") + money.format(Number(digits) / 100);
}
const parseSigned = (s: string) => (s.trim().startsWith("-") ? -1 : 1) * (Number(s.replace(/\D/g, "") || 0) / 100);

export function AccountDialog({ account, onClose }: { account: BankAccount | null; onClose: () => void }) {
  const { data, reload } = useFinance();
  const toast = useToast();
  const [name, setName] = React.useState(account?.name ?? "");
  const [bank, setBank] = React.useState(account?.bank ?? "");
  const [branch, setBranch] = React.useState(account?.branch ?? "");
  const [number, setNumber] = React.useState(account?.accountNumber ?? "");
  const [initial, setInitial] = React.useState(account ? money.format(account.initialBalance) : "");
  const [active, setActive] = React.useState(account?.active ?? true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setMessage("Dê um nome para a conta.");
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        bank: bank.trim() || null,
        branch: branch.trim() || null,
        accountNumber: number.trim() || null,
        initialBalance: parseSigned(initial),
        active,
      };
      if (account) await updateAccount(account.id, input);
      else await insertAccount({ ...input, position: data?.accounts.length ?? 0 });
      await reload();
      toast({ tone: "success", title: account ? "Conta atualizada" : "Conta criada" });
      onClose();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
        <form onSubmit={save}>
          <div className="border-b px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold">{account ? "Editar conta" : "Nova conta"}</DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">Preencha os dados da conta bancária.</DialogDescription>
          </div>
          <div className="space-y-3.5 p-5">
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">Nome da conta</span>
              <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bradesco Empresas" />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">Banco</span>
              <input className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Opcional" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium">Agência</span>
                <input className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-[13px] font-medium">Número da conta</span>
                <input className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium">Saldo inicial</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1.5 text-[12px] text-muted-foreground">R$</span>
                <input inputMode="decimal" className={`${inputClass} pl-8 tabular`} value={initial} onChange={(e) => setInitial(maskSigned(e.target.value))} placeholder="0,00" />
              </div>
              <span className="block text-[11.5px] text-muted-foreground">O saldo que a conta tinha antes do primeiro lançamento no sistema. Mudar isto muda o saldo de todos os dias.</span>
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--primary)]" />
              Conta ativa <span className="text-muted-foreground">(contas inativas não aparecem para novos lançamentos)</span>
            </label>
          </div>
          <div className="flex items-center gap-2 sticky bottom-0 z-10 rounded-b-xl border-t bg-card bg-[linear-gradient(var(--muted),var(--muted))] px-5 py-3">
            <span className="flex-1 text-[12px] text-destructive-foreground">{message}</span>
            <Button type="button" size="md" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {account ? "Salvar" : "Criar conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
