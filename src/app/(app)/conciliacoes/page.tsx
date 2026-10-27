"use client";

import { ArrowDownLeft, ArrowUpRight, Check, CheckCheck, EyeOff, FileUp, History, Loader2, Plus, RotateCcw, Upload, X } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance-provider";
import { HeroCard, KpiCard } from "@/components/kpi";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Badge, Card, CountPill, UnderlineTabs } from "@/components/ui/primitives";
import { balanceAt } from "@/lib/finance";
import { formatBRL, formatDate, formatDayMonth } from "@/lib/format";
import { insertMovements, insertReconciliation, listReconciliations, type ReconciliationRecord, setMovementsPaid, updateMovement } from "@/lib/mutations";
import { decodeOfx, type OfxStatement, type OfxTransaction, parseOfx } from "@/lib/ofx";
import { type Candidate, ofxOrigin, reconcile, type ReconLine } from "@/lib/reconcile";
import type { FinanceData } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "all" | "suggested" | "new" | "reconciled" | "system";

const selectClass = "h-7 rounded-md border border-input bg-card px-2 text-[12.5px] outline-none focus:ring-2 focus:ring-ring/40";
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
const memoNote = (memo: string) => `Extrato: ${memo}`;

/** Categoria/contato usados da última vez para o mesmo histórico do banco. */
function learned(data: FinanceData, memo: string) {
  const note = memoNote(memo);
  const prev = data.movements.filter((m) => m.notes === note).sort((a, b) => b.date.localeCompare(a.date))[0];
  return { categoryId: prev?.categoryId ?? "", contactId: prev?.contactId ?? "", description: prev?.description ?? "" };
}

function NewLineForm({ tx, accountId, onDone, onCancel }: { tx: OfxTransaction; accountId: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const { data } = useFinance();
  const toast = useToast();
  const type = tx.amount >= 0 ? "inflow" : "outflow";
  const hint = React.useMemo(() => (data ? learned(data, tx.memo) : { categoryId: "", contactId: "", description: "" }), [data, tx.memo]);
  const [description, setDescription] = React.useState(hint.description || tx.memo);
  const [categoryId, setCategoryId] = React.useState(hint.categoryId);
  const [contactId, setContactId] = React.useState(hint.contactId);
  const [busy, setBusy] = React.useState(false);
  if (!data) return null;
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const categories = data.categories.filter((c) => groups.get(c.groupId)?.type === type).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const contacts = data.contacts.filter((c) => !c.deleted && (type === "inflow" ? c.isCustomer : true)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  async function save() {
    if (!categoryId) return toast({ tone: "error", title: "Escolha a categoria." });
    setBusy(true);
    try {
      await insertMovements([
        {
          type,
          date: tx.date,
          competenceDate: tx.date,
          dueDate: tx.date,
          amount: Math.abs(tx.amount),
          description: description.trim() || tx.memo,
          bankAccountId: accountId,
          categoryId,
          contactId: contactId || null,
          recurrenceId: null,
          paid: true,
          installment: 0,
          totalInstallments: 0,
          documentNumber: tx.checkNumber,
          notes: memoNote(tx.memo),
          origin: ofxOrigin(tx.fitId),
        },
      ]);
      await onDone();
      toast({ tone: "success", title: "Lançado e conciliado" });
    } catch (err) {
      toast({ tone: "error", title: err instanceof Error ? err.message : "Não foi possível lançar." });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-brand-soft/40 px-5 py-2.5 animate-fade-in">
      <input className={cn(selectClass, "min-w-[220px] flex-1")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" autoFocus />
      <select className={cn(selectClass, "w-52")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Categoria…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select className={cn(selectClass, "w-52")} value={contactId} onChange={(e) => setContactId(e.target.value)}>
        <option value="">{type === "inflow" ? "Cliente (opcional)" : "Fornecedor (opcional)"}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button variant="primary" size="sm" onClick={save} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Check />} Lançar
      </Button>
      <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancelar">
        <X />
      </Button>
      {hint.categoryId && <span className="basis-full text-[11px] text-muted-foreground">Preenchido como da última vez que este histórico apareceu no extrato.</span>}
    </div>
  );
}

function CandidateLabel({ c }: { c: Candidate }) {
  return (
    <div className="min-w-0">
      <div className="truncate">
        {c.label}
        {c.kind === "invoice" && <span className="ml-1 text-[11px] text-muted-foreground">({c.ids.length} compras)</span>}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {c.kind === "transfer" ? "Transferência" : c.paid ? "Baixado" : "Em aberto"} · {formatDate(c.date)}
      </div>
    </div>
  );
}

const STATUS: Record<ReconLine["status"], { label: string; tone: "success" | "warning" | "info" }> = {
  reconciled: { label: "Conciliado", tone: "success" },
  suggested: { label: "Para baixar", tone: "warning" },
  new: { label: "Não lançado", tone: "info" },
};

export default function ConciliacoesPage() {
  const { data, error, reload } = useFinance();
  const toast = useToast();
  const [stmt, setStmt] = React.useState<OfxStatement | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [tab, setTab] = React.useState<Tab>("all");
  const [ignored, setIgnored] = React.useState<Set<string>>(new Set());
  const [creating, setCreating] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [history, setHistory] = React.useState<ReconciliationRecord[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    listReconciliations().then(setHistory, () => setHistory([]));
  }, []);

  const accounts = React.useMemo(() => (data?.accounts ?? []).filter((a) => a.active).sort((a, b) => a.position - b.position), [data]);
  const account = accountId || accounts[0]?.id || "";

  const result = React.useMemo(() => (data && stmt && account ? reconcile(data, account, stmt) : null), [data, stmt, account]);

  async function load(file: File) {
    try {
      const parsed = parseOfx(decodeOfx(await file.arrayBuffer()));
      if (!parsed.transactions.length) throw new Error("Nenhuma movimentação encontrada no arquivo.");
      setStmt(parsed);
      setFileName(file.name);
      setIgnored(new Set());
      setTab("all");
      // Tenta achar a conta pelo número.
      const acct = digits(parsed.accountId);
      const match = acct && accounts.find((a) => digits(a.accountNumber) && (acct.endsWith(digits(a.accountNumber)) || digits(a.accountNumber).endsWith(acct)));
      if (match) setAccountId(match.id);
      toast({ tone: "success", title: `${parsed.transactions.length} movimentações lidas do extrato` });
    } catch (err) {
      toast({ tone: "error", title: err instanceof Error ? err.message : "Não foi possível ler o arquivo." });
    }
  }

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      await reload();
      if (done) toast({ tone: "success", title: done });
    } catch (err) {
      toast({ tone: "error", title: err instanceof Error ? err.message : "Não foi possível salvar." });
    } finally {
      setBusy(null);
    }
  }

  /** Baixa o que foi encontrado; um lançamento avulso passa para a data do banco e guarda o id da linha. */
  const settle = (l: ReconLine) => {
    const c = l.candidate!;
    if (c.kind === "movement" && (!c.origin || c.origin === "web")) return updateMovement(c.ids[0], { paid: true, date: l.tx.date, origin: ofxOrigin(l.tx.fitId) });
    return setMovementsPaid(c.ids, true);
  };

  async function settleAll(lines: ReconLine[]) {
    await act("all", async () => {
      for (const l of lines) await settle(l);
    }, `${lines.length} lançamento${lines.length === 1 ? "" : "s"} baixado${lines.length === 1 ? "" : "s"}`);
  }

  async function finish() {
    if (!stmt) return;
    await act(
      "finish",
      async () => {
        await insertReconciliation({ bankAccountId: account, name: fileName, periodStart: stmt.start, periodEnd: stmt.end, closingBalance: stmt.balance });
        setHistory(await listReconciliations());
      },
      "Conciliação registrada",
    );
  }

  if (!data) return <LoadingState error={error} />;

  const lines = (result?.lines ?? []).filter((l) => !ignored.has(l.tx.fitId));
  const count = (s: ReconLine["status"]) => lines.filter((l) => l.status === s).length;
  const suggested = lines.filter((l) => l.status === "suggested");
  const visible = tab === "all" ? lines : tab === "system" ? [] : lines.filter((l) => l.status === tab);
  const balanceDate = stmt?.balanceDate ?? stmt?.end ?? stmt?.transactions.at(-1)?.date ?? null;
  const systemBalance = balanceDate ? balanceAt(data, { accountIds: [account] }, balanceDate) : 0;
  const diff = stmt?.balance != null ? Math.round((stmt.balance - systemBalance) * 100) / 100 : null;
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Conciliação"
        accent="bancária"
        description="Importe o extrato OFX do banco e confira, linha a linha, se tudo está lançado e baixado."
        actions={
          <>
            <select className="h-8 rounded-md border border-input bg-card px-2.5 text-[13px]" value={account} onChange={(e) => setAccountId(e.target.value)} aria-label="Conta">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button variant="primary" size="md" onClick={() => inputRef.current?.click()}>
              <Upload /> Importar OFX
            </Button>
          </>
        }
      />
      <input
        ref={inputRef}
        type="file"
        accept=".ofx,.OFX,application/x-ofx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) load(f);
          e.target.value = "";
        }}
      />

      {!stmt ? (
        <div className="grid items-start gap-3 lg:grid-cols-[1fr_340px]">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) load(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-card px-6 py-16 text-center transition-colors animate-pop-in",
              dragging ? "border-primary bg-brand-soft/50" : "hover:border-primary/60",
            )}
          >
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-primary">
              <FileUp className="size-6" />
            </div>
            <h2 className="mt-4 text-[16px] font-semibold">Arraste o extrato OFX aqui</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">ou clique para escolher o arquivo</p>
            <div className="mt-6 max-w-md rounded-lg bg-muted/60 px-4 py-3 text-left text-[12.5px] text-muted-foreground">
              <b className="text-foreground">Bradesco Net Empresa:</b> Saldos e Extratos → Extrato → escolha o período → <i>Salvar como</i> / <i>Exportar</i> → formato <b>OFX</b>
              (Money). O arquivo fica só no seu navegador — nada é enviado sem você confirmar cada linha.
            </div>
          </div>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <History className="size-4 text-muted-foreground" /> Conciliações anteriores
            </div>
            {history.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-muted-foreground">Nenhuma ainda.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {history.map((h) => (
                  <li key={h.id} className="rounded-lg border px-3 py-2 text-[12.5px]">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{accountName(h.bankAccountId)}</span>
                      {h.closingBalance != null && <span className="tabular">{formatBRL(h.closingBalance)}</span>}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {h.periodStart && h.periodEnd ? `${formatDate(h.periodStart)} → ${formatDate(h.periodEnd)}` : h.name} · feita em {formatDate(h.createdAt.slice(0, 10))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            <HeroCard label="Saldo no banco" amount={stmt.balance ?? 0} sub={balanceDate ? `Em ${formatDate(balanceDate)} · ${fileName}` : fileName} />
            <KpiCard label="Saldo no sistema" tone="info" amount={systemBalance} sub={`${accountName(account)} na mesma data`} />
            <KpiCard
              label="Diferença"
              tone={diff == null ? "neutral" : Math.abs(diff) < 0.005 ? "success" : "danger"}
              value={diff == null ? "—" : Math.abs(diff) < 0.005 ? "Bateu" : formatBRL(diff)}
              sub={diff == null ? "O arquivo não traz saldo" : Math.abs(diff) < 0.005 ? "Saldos iguais ao centavo" : "Banco − sistema"}
            />
            <KpiCard label="Conciliados" tone="success" value={`${count("reconciled")} de ${lines.length}`} sub={`${count("suggested")} para baixar · ${count("new")} não lançados`} />
          </div>

          <Card className="mt-3 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-5 pt-2">
              <UnderlineTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "all", label: <>Todas <CountPill>{lines.length}</CountPill></> },
                  { value: "suggested", label: <>Para baixar <CountPill tone="warning">{count("suggested")}</CountPill></> },
                  { value: "new", label: <>Não lançados <CountPill tone="info">{count("new")}</CountPill></> },
                  { value: "reconciled", label: <>Conciliados <CountPill tone="success">{count("reconciled")}</CountPill></> },
                  { value: "system", label: <>Só no sistema <CountPill>{result?.onlyInSystem.length ?? 0}</CountPill></> },
                ]}
              />
              <div className="flex-1" />
              {suggested.length > 0 && (
                <Button size="sm" onClick={() => settleAll(suggested)} disabled={busy === "all"}>
                  {busy === "all" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Baixar {suggested.length} encontrados
                </Button>
              )}
              {ignored.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setIgnored(new Set())}>
                  <RotateCcw /> Mostrar {ignored.size} ignorada{ignored.size === 1 ? "" : "s"}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setStmt(null)}>
                <X /> Fechar extrato
              </Button>
            </div>

            {tab === "system" ? (
              <div>
                <p className="border-t px-5 py-2.5 text-[12px] text-muted-foreground">
                  Baixados no sistema entre {stmt.start ? formatDate(stmt.start) : "—"} e {stmt.end ? formatDate(stmt.end) : "—"} que não aparecem no extrato: podem ser duplicados, lançados na conta errada ou baixados por engano.
                </p>
                {(result?.onlyInSystem ?? []).map((c) => (
                  <div key={c.kind + c.ids[0]} className="flex items-center gap-3 border-t px-5 py-2.5 text-[13px]">
                    <span className="w-14 tabular text-muted-foreground">{formatDayMonth(c.date)}</span>
                    <div className="min-w-0 flex-1">
                      <CandidateLabel c={c} />
                    </div>
                    <span className={cn("font-medium tabular", c.amount < 0 ? "text-destructive-foreground" : "text-success-foreground")}>{formatBRL(c.amount)}</span>
                    {c.kind !== "transfer" && (
                      <Button variant="ghost" size="sm" onClick={() => act(c.ids[0], () => setMovementsPaid(c.ids, false), "Voltou para em aberto")} disabled={busy === c.ids[0]}>
                        <RotateCcw /> Desfazer baixa
                      </Button>
                    )}
                  </div>
                ))}
                {!result?.onlyInSystem.length && <div className="border-t px-5 py-10 text-center text-[13px] text-muted-foreground">Nada sobrando — tudo que está baixado aparece no extrato.</div>}
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-[56px_1fr_120px_110px_minmax(0,1fr)_170px] gap-3 border-y bg-muted/40 px-5 py-2 text-[12px] font-medium text-muted-foreground">
                  <span>Data</span>
                  <span>No banco</span>
                  <span className="text-right">Valor</span>
                  <span>Situação</span>
                  <span>No sistema</span>
                  <span />
                </div>
                {visible.map((l, i) => {
                  const key = l.tx.fitId;
                  return (
                    <div key={key} className="border-b last:border-b-0">
                      <div className="grid grid-cols-[56px_1fr_120px_110px_minmax(0,1fr)_170px] items-center gap-3 px-5 py-2.5 text-[13px] animate-row-in hover:bg-accent/30" style={{ animationDelay: `${Math.min(i, 30) * 15}ms` }}>
                        <span className="tabular text-muted-foreground">{formatDayMonth(l.tx.date)}</span>
                        <div className="flex min-w-0 items-center gap-2">
                          {l.tx.amount >= 0 ? <ArrowDownLeft className="size-3.5 shrink-0 text-success-foreground" /> : <ArrowUpRight className="size-3.5 shrink-0 text-destructive-foreground" />}
                          <span className="truncate" title={l.tx.memo}>
                            {l.tx.memo || "—"}
                          </span>
                        </div>
                        <span className={cn("text-right font-medium tabular", l.tx.amount < 0 ? "text-destructive-foreground" : "text-success-foreground")}>{formatBRL(l.tx.amount)}</span>
                        <span>
                          <Badge tone={STATUS[l.status].tone} dot>
                            {STATUS[l.status].label}
                          </Badge>
                        </span>
                        <div className="min-w-0 text-[12.5px]">{l.candidate ? <CandidateLabel c={l.candidate} /> : <span className="text-muted-foreground">—</span>}</div>
                        <div className="flex justify-end gap-1">
                          {l.status === "suggested" && (
                            <Button size="sm" variant="soft" onClick={() => act(key, () => settle(l), "Baixado")} disabled={busy === key}>
                              {busy === key ? <Loader2 className="animate-spin" /> : <Check />} Baixar
                            </Button>
                          )}
                          {l.status === "new" && creating !== key && (
                            <Button size="sm" variant="soft" onClick={() => setCreating(key)}>
                              <Plus /> Lançar
                            </Button>
                          )}
                          {l.status !== "reconciled" && (
                            <Button variant="ghost" size="icon" title="Ignorar esta linha" aria-label="Ignorar" onClick={() => setIgnored((s) => new Set(s).add(key))}>
                              <EyeOff />
                            </Button>
                          )}
                        </div>
                      </div>
                      {creating === key && (
                        <NewLineForm
                          tx={l.tx}
                          accountId={account}
                          onCancel={() => setCreating(null)}
                          onDone={async () => {
                            await reload();
                            setCreating(null);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
                {visible.length === 0 && <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">Nada aqui.</div>}
              </div>
            )}
            <div className="flex items-center gap-3 border-t bg-muted/50 px-5 py-3 text-[12.5px]">
              <span className="text-muted-foreground">
                {stmt.start && stmt.end ? `${formatDate(stmt.start)} → ${formatDate(stmt.end)}` : ""} · {lines.length} linhas
              </span>
              <div className="flex-1" />
              <Button variant="primary" size="md" onClick={finish} disabled={busy === "finish" || count("suggested") + count("new") > 0} title={count("suggested") + count("new") > 0 ? "Resolva as linhas pendentes ou ignore-as" : undefined}>
                {busy === "finish" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Concluir conciliação
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
