"use client";

import { Building2, Check, Database, Download, FileText, KeyRound, Loader2, Moon, Palette, Search, Sun, User } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance-provider";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { changePassword, saveProfileName, useProfile } from "@/components/profile";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { lookupCNPJ, maskTaxId, taxIdStatus } from "@/lib/br";
import { saveCompany } from "@/lib/mutations";
import { supabaseConfigured } from "@/lib/supabase/client";
import { useLocalSetting } from "@/lib/use-local-setting";
import { cn } from "@/lib/utils";

type Section = "perfil" | "empresa" | "aparencia" | "nota" | "dados";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "perfil", label: "Meu perfil", icon: User },
  { id: "empresa", label: "Dados da empresa", icon: Building2 },
  { id: "aparencia", label: "Aparência", icon: Palette },
  { id: "nota", label: "Nota fiscal (NFS-e)", icon: FileText },
  { id: "dados", label: "Backup e dados", icon: Database },
];

const inputClass = "h-8 w-full rounded-md border border-input bg-card px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-ring/40 disabled:bg-muted disabled:text-muted-foreground";

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Panel({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden animate-pop-in">
      <div className="border-b px-5 py-4">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {description && <p className="text-[12.5px] text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-5">{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3">{footer}</div>}
    </Card>
  );
}

function useSave() {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: "success", title: done });
      return true;
    } catch (err) {
      toast({ tone: "error", title: err instanceof Error ? err.message : "Não foi possível salvar." });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function ProfileSection() {
  const profile = useProfile();
  const [name, setName] = React.useState(profile.name);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const save = useSave();
  const pass = useSave();
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="space-y-3">
      <Panel
        title="Meu perfil"
        description="Como o sistema chama você no painel."
        footer={
          <Button variant="primary" size="md" disabled={save.busy || !name.trim() || !supabaseConfigured} onClick={() => save.run(() => saveProfileName(name.trim()), "Perfil atualizado")}>
            {save.busy && <Loader2 className="animate-spin" />} Salvar
          </Button>
        }
      >
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground">{(name || "?").slice(0, 1).toUpperCase()}</div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="E-mail" hint="Para trocar o e-mail de acesso, use o painel do Supabase.">
              <input className={inputClass} value={profile.email ?? "—"} disabled />
            </Field>
          </div>
        </div>
      </Panel>
      <Panel
        title="Senha"
        description="Use pelo menos 8 caracteres."
        footer={
          <Button
            variant="primary"
            size="md"
            disabled={pass.busy || password.length < 8 || password !== confirm || !supabaseConfigured}
            onClick={async () => {
              if (await pass.run(() => changePassword(password), "Senha alterada")) {
                setPassword("");
                setConfirm("");
              }
            }}
          >
            {pass.busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Alterar senha
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nova senha">
            <input type="password" autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repita a senha" hint={mismatch ? <span className="text-destructive-foreground">As senhas não são iguais.</span> : undefined}>
            <input type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
      </Panel>
    </div>
  );
}

function CompanySection() {
  const { data, reload } = useFinance();
  const [name, setName] = React.useState(data?.companyName ?? "");
  const [taxId, setTaxId] = React.useState(data?.companyTaxId ? maskTaxId(data.companyTaxId) : "");
  const [looking, setLooking] = React.useState(false);
  const [found, setFound] = React.useState<string | null>(null);
  const save = useSave();
  const status = taxIdStatus(taxId);

  async function lookup() {
    setLooking(true);
    try {
      const info = await lookupCNPJ(taxId);
      if (!info) throw new Error("CNPJ não encontrado.");
      setFound([info.address.street, info.address.number, info.address.district, info.address.city && `${info.address.city}/${info.address.state}`].filter(Boolean).join(", "));
      if (!name.trim() || name === data?.companyName) setName(info.tradeName || info.name);
    } catch (err) {
      setFound(err instanceof Error ? err.message : "Falha na consulta.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <Panel
      title="Dados da empresa"
      description="Aparecem no menu e serão usados como prestador na emissão da nota fiscal."
      footer={
        <Button
          variant="primary"
          size="md"
          disabled={save.busy || !name.trim() || status === "invalid" || !supabaseConfigured}
          onClick={() =>
            save.run(async () => {
              await saveCompany({ name: name.trim(), taxId: taxId.replace(/\D/g, "") || null });
              await reload();
            }, "Dados da empresa salvos")
          }
        >
          {save.busy && <Loader2 className="animate-spin" />} Salvar
        </Button>
      }
    >
      <Field label="Nome da empresa">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field
        label="CNPJ"
        hint={
          status === "invalid" ? (
            <span className="text-destructive-foreground">CNPJ inválido.</span>
          ) : status === "cnpj" ? (
            <span className="text-success-foreground">CNPJ válido.</span>
          ) : undefined
        }
      >
        <div className="flex gap-2">
          <input className={cn(inputClass, "tabular")} value={taxId} onChange={(e) => setTaxId(maskTaxId(e.target.value))} placeholder="00.000.000/0000-00" />
          <Button size="md" disabled={status !== "cnpj" || looking} onClick={lookup}>
            {looking ? <Loader2 className="animate-spin" /> : <Search />} Buscar na Receita
          </Button>
        </div>
      </Field>
      {found && <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">{found}</p>}
    </Panel>
  );
}

function ThemeOption({ value, current, onPick, label, icon, preview }: { value: string; current: string; onPick: (v: string) => void; label: string; icon: React.ReactNode; preview: string }) {
  const active = value === current;
  return (
    <button onClick={() => onPick(value)} className={cn("rounded-xl border p-2 text-left transition-all", active ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30")}>
      <div className={cn("flex h-24 gap-1.5 overflow-hidden rounded-lg p-2", preview)}>
        <div className="w-8 space-y-1 rounded bg-current/10 p-1 opacity-60">
          <div className="h-1.5 rounded bg-[#e35f20]" />
          <div className="h-1 rounded bg-current/30" />
          <div className="h-1 rounded bg-current/30" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="h-6 rounded bg-gradient-to-br from-[#c94f17] to-[#f08a4b]" />
          <div className="grid grid-cols-2 gap-1.5">
            <div className="h-5 rounded bg-current/10" />
            <div className="h-5 rounded bg-current/10" />
          </div>
          <div className="h-5 rounded bg-current/10" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 px-1 text-[13px] font-medium">
        {icon} {label}
        {active && <Check className="ml-auto size-3.5 text-primary" />}
      </div>
    </button>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useLocalSetting("theme", "light");
  const [sidebar, setSidebar] = useLocalSetting("sidebar", "open");
  return (
    <Panel title="Aparência" description="Fica salvo neste navegador.">
      <div>
        <div className="mb-2 text-[13px] font-medium">Tema</div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <ThemeOption value="light" current={theme} onPick={setTheme} label="Claro" icon={<Sun className="size-3.5" />} preview="bg-[#faf8f6] text-[#1c1917]" />
          <ThemeOption value="dark" current={theme} onPick={setTheme} label="Escuro" icon={<Moon className="size-3.5" />} preview="bg-[#17130f] text-[#f5f0eb]" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={sidebar === "collapsed"} onChange={(e) => setSidebar(e.target.checked ? "collapsed" : "open")} className="accent-[var(--primary)]" />
        Menu lateral recolhido <span className="text-muted-foreground">(só os ícones)</span>
      </label>
    </Panel>
  );
}

function InvoiceSection() {
  const steps = [
    { done: true, label: "Município identificado", detail: "Jaguaquara/BA (IBGE 2917607) · sistema Saatri, layout nacional 1.01" },
    { done: false, label: "Documentação do webservice", detail: "Pedir ao suporte da Saatri o manual ABRASF e a liberação do ambiente de homologação" },
    { done: false, label: "Certificado digital A1", detail: "Arquivo .pfx e senha da empresa (o mesmo usado no portal)" },
    { done: false, label: "Cadastro dos tomadores", detail: "CPF/CNPJ e endereço dos clientes — importar do “Exportar NFS-e (Nota Nacional)” da Saatri" },
    { done: false, label: "Botão “Emitir nota fiscal”", detail: "Nos recebimentos, com confirmação antes de enviar" },
  ];
  return (
    <Panel title="Nota fiscal de serviço (NFS-e)" description="Emissão direto do lançamento de recebimento, com um clique de confirmação.">
      <div className="flex items-center gap-2">
        <Badge tone="warning" dot>
          Em preparação
        </Badge>
        <span className="text-[12.5px] text-muted-foreground">Integração direta com a Saatri (sem custo por nota). Alternativa paga: Focus NFe.</span>
      </div>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-3">
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", s.done ? "bg-success text-white" : "bg-muted text-muted-foreground")}>
              {s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div>
              <div className="text-[13px] font-medium">{s.label}</div>
              <div className="text-[12px] text-muted-foreground">{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function DataSection() {
  const { data, today } = useFinance();
  if (!data) return null;
  const counts = [
    ["Lançamentos", data.movements.length],
    ["Transferências", data.transfers.length],
    ["Recorrências", data.recurrences.length],
    ["Clientes e fornecedores", data.contacts.filter((c) => !c.deleted).length],
    ["Categorias", data.categories.length],
    ["Contas bancárias", data.accounts.length],
    ["Cartões", data.cards.length],
  ] as const;

  function download() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), schema: "connect-financeiro/1", ...data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `connect-financeiro-backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      title="Backup e dados"
      description="Tudo fica no Supabase (com backup diário do próprio Supabase). Baixe uma cópia quando quiser."
      footer={
        <Button variant="primary" size="md" onClick={download}>
          <Download /> Baixar backup completo (.json)
        </Button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {counts.map(([label, n]) => (
          <div key={label} className="flex justify-between rounded-lg border px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular">{n.toLocaleString("pt-BR")}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">Os dados do sistema antigo (FCS V1, exportação de 15/10/2026) já foram importados e conferidos centavo a centavo.</p>
    </Panel>
  );
}

export default function ConfiguracoesPage() {
  const { data, error } = useFinance();
  const [section, setSection] = React.useState<Section>("perfil");
  if (!data) return <LoadingState error={error} />;
  return (
    <>
      <PageHeader title="Configurações" description="Perfil, empresa, aparência e dados." />
      <div className="grid items-start gap-4 md:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors",
                section === id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="max-w-3xl" key={section}>
          {section === "perfil" && <ProfileSection />}
          {section === "empresa" && <CompanySection />}
          {section === "aparencia" && <AppearanceSection />}
          {section === "nota" && <InvoiceSection />}
          {section === "dados" && <DataSection />}
        </div>
      </div>
    </>
  );
}
