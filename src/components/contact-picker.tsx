"use client";

import { Check, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { insertContact } from "@/lib/mutations";
import type { Contact } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinance } from "./finance-provider";
import { useToast } from "./toast";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Escolha de cliente/fornecedor com busca e cadastro rápido de um novo, sem sair do lançamento. */
export function ContactPicker({ value, onChange, kind, className }: { value: string; onChange: (id: string) => void; kind: "customer" | "supplier"; className?: string }) {
  const { data, applyLocal, reload } = useFinance();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const noun = kind === "customer" ? "cliente" : "fornecedor";

  const all = React.useMemo(
    () =>
      (data?.contacts ?? [])
        .filter((c) => !c.deleted && (kind === "customer" ? c.isCustomer : c.isSupplier || c.isCustomer))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [data, kind],
  );
  const q = norm(query.trim());
  const list = q ? all.filter((c) => norm(c.name).includes(q) || (c.taxId ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000")) : all;
  const exact = q && all.some((c) => norm(c.name) === q);
  const canCreate = !!query.trim() && !exact;
  const selected = data?.contacts.find((c) => c.id === value);
  // Itens navegáveis pelo teclado: os contatos e, por último, o "Cadastrar".
  const total = list.length + (canCreate ? 1 : 0);

  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  async function create() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const input = { name, isCustomer: kind === "customer", isSupplier: kind === "supplier", personType: "natural" as const, taxId: null, email: null, phone: null, address: {}, notes: null };
      const id = await insertContact(input);
      const contact: Contact = { id, ...input, deleted: false };
      applyLocal((d) => ({ ...d, contacts: [...d.contacts, contact] }));
      pick(id);
      toast({ tone: "success", title: `${kind === "customer" ? "Cliente" : "Fornecedor"} “${name}” cadastrado` });
      void reload();
    } catch (err) {
      toast({ tone: "error", title: err instanceof Error ? err.message : "Não foi possível cadastrar." });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
        setActive(0);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-left text-[13px] outline-none focus:ring-2 focus:ring-ring/40",
            className,
          )}
        >
          <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>{selected?.name ?? `Sem ${noun}`}</span>
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Remover ${noun}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0">
        <div className="relative border-b">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(total - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (active < list.length) pick(list[active].id);
                else if (canCreate) void create();
              }
            }}
            placeholder={`Buscar ou cadastrar ${noun}…`}
            className="h-9 w-full bg-transparent pl-8 pr-3 text-[13px] outline-none"
          />
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto p-1">
          {list.map((c, i) => (
            <button
              key={c.id}
              type="button"
              data-index={i}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c.id)}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", i === active && "bg-accent")}
            >
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === value && <Check className="size-3.5 text-primary" />}
            </button>
          ))}
          {list.length === 0 && !canCreate && <div className="px-2 py-6 text-center text-[12.5px] text-muted-foreground">Nenhum {noun} cadastrado.</div>}
          {list.length === 0 && canCreate && <div className="px-2 pb-1 pt-2 text-[12px] text-muted-foreground">Nenhum {noun} com esse nome.</div>}
        </div>
        {canCreate && (
          <button
            type="button"
            data-index={list.length}
            onMouseEnter={() => setActive(list.length)}
            onClick={() => void create()}
            disabled={creating}
            className={cn("flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-[13px] font-medium text-primary", active === list.length && "bg-brand-soft")}
          >
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Cadastrar {noun} “{query.trim()}”
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
