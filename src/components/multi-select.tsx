"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export interface MultiOption {
  id: string;
  name: string;
  /** Texto pequeno ao lado (ex.: grupo da categoria). */
  hint?: string;
  color?: string;
}

/** Escolha de vários itens com busca (filtros de categoria, cliente, conta…). */
export function MultiSelect({ options, value, onChange, all, noun, searchable = options.length > 8 }: { options: MultiOption[]; value: string[]; onChange: (ids: string[]) => void; all: string; noun: string; searchable?: boolean }) {
  const [query, setQuery] = React.useState("");
  const q = norm(query.trim());
  const shown = q ? options.filter((o) => norm(o.name).includes(q)) : options;
  const chosen = options.filter((o) => value.includes(o.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const label = chosen.length === 0 ? all : chosen.length <= 2 ? chosen.map((o) => o.name).join(", ") : `${chosen.length} ${noun}`;

  return (
    <Popover onOpenChange={(o) => !o && setQuery("")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2 text-left text-[13px] outline-none focus:ring-2 focus:ring-ring/40",
            chosen.length > 0 && "border-brand/50",
          )}
        >
          <span className={cn("flex-1 truncate", chosen.length === 0 && "text-muted-foreground")}>{label}</span>
          {chosen.length > 0 && <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{chosen.length}</span>}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-max min-w-[max(260px,var(--radix-popover-trigger-width))] max-w-[min(420px,calc(100vw-1rem))] p-0">
        {searchable && (
          <div className="relative border-b">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="h-9 w-full bg-transparent pl-8 pr-3 text-[13px] outline-none" />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {shown.map((o) => {
            const on = value.includes(o.id);
            return (
              <button key={o.id} type="button" onClick={() => toggle(o.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent", on && "bg-brand-soft/60")}>
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-[4px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                {o.color && <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />}
                <span className="flex-1 truncate">{o.name}</span>
                {o.hint && <span className="shrink-0 rounded bg-muted px-1.5 text-[10.5px] text-muted-foreground">{o.hint}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <div className="px-2 py-4 text-center text-[12.5px] text-muted-foreground">Nada encontrado.</div>}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">{chosen.length ? `${chosen.length} selecionado${chosen.length === 1 ? "" : "s"}` : "Nenhum selecionado"}</span>
          <div className="flex gap-3">
            {q && shown.length > 0 && (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.id)])])}>
                Marcar todos
              </button>
            )}
            {chosen.length > 0 && (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
                Limpar
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
