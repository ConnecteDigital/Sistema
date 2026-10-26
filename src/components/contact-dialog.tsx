"use client";

import { CheckCircle2, CircleAlert, Loader2, Search, Trash2, Undo2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Dialog, DialogContent, DialogDescription, DialogTitle, UnderlineTabs } from "@/components/ui/primitives";
import { lookupCEP, lookupCNPJ, maskCEP, maskPhone, maskTaxId, onlyDigits, taxIdStatus } from "@/lib/br";
import { formatBRL, formatDate } from "@/lib/format";
import { insertContact, updateContact } from "@/lib/mutations";
import type { Address, Contact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinance } from "./finance-provider";
import { useMovementDialog } from "./movement-dialog";
import { useToast } from "./toast";

const inputClass = "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none transition-shadow focus:ring-2 focus:ring-ring/40";
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ContactDialog({ contact, onClose, onCreated }: { contact: Contact | null; onClose: () => void; onCreated?: (id: string, name: string) => void }) {
  const { data, reload } = useFinance();
  const { open: openMovement } = useMovementDialog();
  const toast = useToast();
  const [tab, setTab] = React.useState<"dados" | "endereco" | "obs" | "historico">("dados");
  const [name, setName] = React.useState(contact?.name ?? "");
  const [isCustomer, setIsCustomer] = React.useState(contact?.isCustomer ?? true);
  const [isSupplier, setIsSupplier] = React.useState(contact?.isSupplier ?? false);
  const [taxId, setTaxId] = React.useState(contact?.taxId ? maskTaxId(contact.taxId) : "");
  const [email, setEmail] = React.useState(contact?.email ?? "");
  const [phone, setPhone] = React.useState(contact?.phone ? maskPhone(contact.phone) : "");
  const [address, setAddress] = React.useState<Address>(contact?.address ?? {});
  const [notes, setNotes] = React.useState(contact?.notes ?? "");
  const [busy, setBusy] = React.useState(false);
  const [looking, setLooking] = React.useState<"cnpj" | "cep" | null>(null);
  const [message, setMessage] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null);

  const status = taxIdStatus(taxId);
  const setAddr = (k: keyof Address, v: string) => setAddress((a) => ({ ...a, [k]: v }));

  async function fillFromCNPJ() {
    setLooking("cnpj");
    setMessage(null);
    try {
      const info = await lookupCNPJ(taxId);
      if (!info) return setMessage({ tone: "error", text: "CNPJ não encontrado na Receita." });
      if (!name.trim() || name === contact?.name) setName(info.tradeName || info.name);
      if (!email && info.email) setEmail(info.email);
      if (!phone && info.phone) setPhone(info.phone);
      setAddress((a) => ({ ...a, ...Object.fromEntries(Object.entries(info.address).filter(([, v]) => v)) }));
      setMessage({ tone: "ok", text: `Dados de ${info.name} preenchidos pela Receita.` });
    } catch {
      setMessage({ tone: "error", text: "Não foi possível consultar o CNPJ agora." });
    } finally {
      setLooking(null);
    }
  }

  async function fillFromCEP(cep: string) {
    if (onlyDigits(cep).length !== 8) return;
    setLooking("cep");
    try {
      const a = await lookupCEP(cep);
      if (a) setAddress((cur) => ({ ...cur, ...a, number: cur.number, complement: cur.complement }));
    } finally {
      setLooking(null);
    }
  }

  // Erro aparece no rodapé e também num aviso flutuante, para não passar despercebido.
  const fail = (text: string) => {
    setMessage({ tone: "error", text });
    toast({ tone: "error", title: text });
  };

  async function save(deleted?: boolean) {
    if (!name.trim()) {
      setTab("dados");
      return fail("Informe o nome do cliente/fornecedor.");
    }
    if (status === "invalid") {
      setTab("dados");
      return fail("CPF/CNPJ inválido — confira os números ou deixe em branco.");
    }
    if (!isCustomer && !isSupplier) return fail("Marque se é cliente, fornecedor ou os dois.");
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        isCustomer,
        isSupplier,
        personType: (status === "cnpj" ? "legal" : "natural") as "legal" | "natural",
        taxId: onlyDigits(taxId) || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address as Record<string, string | undefined>,
        notes: notes.trim() || null,
        ...(deleted !== undefined ? { deleted } : {}),
      };
      if (contact) await updateContact(contact.id, input);
      else onCreated?.(await insertContact(input), input.name);
      await reload();
      toast({ tone: "success", title: deleted ? "Cadastro arquivado" : deleted === false ? "Cadastro restaurado" : contact ? "Cadastro atualizado" : "Cadastro criado" });
      onClose();
    } catch (e) {
      fail(`Não foi possível salvar: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    } finally {
      setBusy(false);
    }
  }

  const history = React.useMemo(
    () => (contact && data ? data.movements.filter((m) => m.contactId === contact.id).sort((a, b) => b.date.localeCompare(a.date)) : []),
    [contact, data],
  );
  const received = history.filter((m) => m.paid && m.type === "inflow").reduce((s, m) => s + m.amount, 0);
  const paid = history.filter((m) => m.paid && m.type === "outflow").reduce((s, m) => s + m.amount, 0);
  const open = history.filter((m) => !m.paid).reduce((s, m) => s + (m.type === "inflow" ? m.amount : -m.amount), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))]">
        <div className="px-5 pt-4">
          <DialogTitle className="text-[15px] font-semibold">{contact ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">{contact ? contact.name : "Cliente, fornecedor ou os dois."}</DialogDescription>
          <div className="mt-3">
            <UnderlineTabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "dados", label: "Dados" },
                { value: "endereco", label: "Endereço" },
                { value: "obs", label: "Observações" },
                ...(contact ? [{ value: "historico" as const, label: <>Histórico <Badge>{history.length}</Badge></> }] : []),
              ]}
            />
          </div>
        </div>

        <div key={tab} className="min-h-[300px] p-5 animate-pop-in">
          {tab === "dados" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["Cliente", isCustomer, setIsCustomer],
                    ["Fornecedor", isSupplier, setIsSupplier],
                  ] as const
                ).map(([label, on, set]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => set(!on)}
                    className={cn("h-7 rounded-md border px-3 text-[12.5px] transition-colors", on ? "border-brand/40 bg-brand-soft font-medium text-brand-foreground" : "hover:bg-accent")}
                  >
                    {on ? "✓ " : ""}
                    {label}
                  </button>
                ))}
              </div>
              <Field label="Nome" hint="Como você chama o contato — é o que aparece nas telas.">
                <input autoFocus={!contact} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field
                label="CPF / CNPJ"
                hint={
                  status === "cpf" ? (
                    <span className="inline-flex items-center gap-1 text-success-foreground"><CheckCircle2 className="size-3" /> CPF válido · pessoa física</span>
                  ) : status === "cnpj" ? (
                    <span className="inline-flex items-center gap-1 text-success-foreground"><CheckCircle2 className="size-3" /> CNPJ válido · pessoa jurídica</span>
                  ) : status === "invalid" && onlyDigits(taxId).length >= 11 ? (
                    <span className="inline-flex items-center gap-1 text-destructive-foreground"><CircleAlert className="size-3" /> Número inválido</span>
                  ) : (
                    "Necessário para emitir nota fiscal."
                  )
                }
              >
                <div className="flex gap-2">
                  <input className={cn(inputClass, "tabular")} value={taxId} onChange={(e) => setTaxId(maskTaxId(e.target.value))} placeholder="000.000.000-00 ou 00.000.000/0000-00" />
                  {status === "cnpj" && (
                    <Button type="button" variant="soft" size="md" onClick={() => void fillFromCNPJ()} disabled={looking === "cnpj"}>
                      {looking === "cnpj" ? <Loader2 className="animate-spin" /> : <Search />} Buscar na Receita
                    </Button>
                  )}
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="E-mail">
                  <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Telefone / WhatsApp">
                  <input inputMode="tel" className={cn(inputClass, "tabular")} value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </Field>
              </div>
            </div>
          )}

          {tab === "endereco" && (
            <div className="grid grid-cols-6 gap-3">
              <Field label="CEP" className="col-span-2" hint={looking === "cep" ? "Buscando endereço…" : "Preenche o resto sozinho."}>
                <input
                  inputMode="numeric"
                  className={cn(inputClass, "tabular")}
                  value={address.zip ?? ""}
                  onChange={(e) => {
                    const v = maskCEP(e.target.value);
                    setAddr("zip", v);
                    void fillFromCEP(v);
                  }}
                  placeholder="00000-000"
                />
              </Field>
              <Field label="Logradouro" className="col-span-4">
                <input className={inputClass} value={address.street ?? ""} onChange={(e) => setAddr("street", e.target.value)} />
              </Field>
              <Field label="Número" className="col-span-2">
                <input className={inputClass} value={address.number ?? ""} onChange={(e) => setAddr("number", e.target.value)} />
              </Field>
              <Field label="Complemento" className="col-span-4">
                <input className={inputClass} value={address.complement ?? ""} onChange={(e) => setAddr("complement", e.target.value)} />
              </Field>
              <Field label="Bairro" className="col-span-3">
                <input className={inputClass} value={address.district ?? ""} onChange={(e) => setAddr("district", e.target.value)} />
              </Field>
              <Field label="Cidade" className="col-span-2">
                <input className={inputClass} value={address.city ?? ""} onChange={(e) => setAddr("city", e.target.value)} />
              </Field>
              <Field label="UF" className="col-span-1">
                <select className={inputClass} value={address.state ?? ""} onChange={(e) => setAddr("state", e.target.value)}>
                  <option value="" />
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <p className="col-span-6 text-[11.5px] text-muted-foreground">
                {address.ibge ? `Código IBGE do município: ${address.ibge} (usado na nota fiscal).` : "O código IBGE do município é preenchido pelo CEP ou pela busca de CNPJ."}
              </p>
            </div>
          )}

          {tab === "obs" && (
            <Field label="Observações">
              <textarea rows={8} className={cn(inputClass, "h-auto py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          )}

          {tab === "historico" && (
            <div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-success-soft p-3">
                  <div className="text-[11.5px] text-muted-foreground">Recebido</div>
                  <div className="text-[15px] font-semibold text-success-foreground tabular">{formatBRL(received)}</div>
                </div>
                <div className="rounded-lg bg-destructive-soft p-3">
                  <div className="text-[11.5px] text-muted-foreground">Pago</div>
                  <div className="text-[15px] font-semibold text-destructive-foreground tabular">{formatBRL(paid)}</div>
                </div>
                <div className="rounded-lg bg-warning-soft p-3">
                  <div className="text-[11.5px] text-muted-foreground">Em aberto</div>
                  <div className="text-[15px] font-semibold text-warning-foreground tabular">{formatBRL(open)}</div>
                </div>
              </div>
              <ul className="mt-3 max-h-[260px] divide-y overflow-y-auto">
                {history.map((m) => (
                  <li key={m.id}>
                    <button className="flex w-full items-center gap-3 py-2 text-left text-[12.5px] hover:bg-accent/50" onClick={() => openMovement({ kind: m.type, movement: m })}>
                      <span className="w-24 text-muted-foreground tabular">{formatDate(m.date)}</span>
                      <span className="flex-1 truncate">{m.description}</span>
                      <Badge tone={m.paid ? "success" : "warning"}>{m.paid ? "Efetuado" : "Em aberto"}</Badge>
                      <span className={cn("w-28 text-right font-semibold tabular", m.type === "outflow" && "text-destructive-foreground")}>{formatBRL(m.amount)}</span>
                    </button>
                  </li>
                ))}
                {history.length === 0 && <li className="py-8 text-center text-muted-foreground">Nenhum lançamento.</li>}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sticky bottom-0 z-10 rounded-b-xl border-t bg-card bg-[linear-gradient(var(--muted),var(--muted))] px-5 py-3">
          {contact &&
            (contact.deleted ? (
              <Button variant="ghost" size="md" disabled={busy} onClick={() => void save(false)}>
                <Undo2 /> Restaurar
              </Button>
            ) : (
              <Button variant="ghost" size="md" disabled={busy} className="text-destructive-foreground" onClick={() => void save(true)}>
                <Trash2 /> Arquivar
              </Button>
            ))}
          <span className={cn("flex-1 text-[12px]", message?.tone === "error" ? "text-destructive-foreground" : "text-success-foreground")}>{message?.text}</span>
          <Button size="md" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" disabled={busy} onClick={() => void save()}>
            {busy && <Loader2 className="animate-spin" />} {contact ? "Salvar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
