"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { addDays, addMonths, endOfMonth, monthRange, parseISO, startOfMonth, yearRange } from "@/lib/dates";
import { accountBalances } from "@/lib/finance";
import { formatBRL, formatRange, monthLong } from "@/lib/format";
import type { DateRange, ISODate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFinance } from "./finance-provider";
import { AccountAvatar } from "./avatars";

export function AccountFilter() {
  const { data, accountIds, setAccountIds } = useFinance();
  const accounts = data?.accounts ?? [];
  const balances = data ? accountBalances(data) : {};
  const selected = accountIds.length ? accountIds : accounts.map((a) => a.id);
  const label = accountIds.length === 0 || accountIds.length === accounts.length ? "Todas as contas" : accountIds.length === 1 ? accounts.find((a) => a.id === accountIds[0])?.name : `${accountIds.length} contas`;
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setAccountIds(next.length === accounts.length ? [] : next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          <Wallet /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div>
            <div className="text-[13px] font-medium">Contas</div>
            <div className="text-[11.5px] text-muted-foreground">{accounts.length} contas</div>
          </div>
          <button className="text-[12px] font-medium text-success-foreground" onClick={() => setAccountIds([])}>
            Selecionar todas
          </button>
        </div>
        <ul className="p-1.5">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent">
              <Checkbox checked={selected.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
              <AccountAvatar name={a.name} index={a.position} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[13px]">{a.name}</div>
                <Link href={`/contas/${a.id}`} className="text-[11px] text-muted-foreground hover:underline">
                  Ver extrato
                </Link>
              </div>
              <span className="text-[12.5px] font-medium tabular">{formatBRL(balances[a.id] ?? 0)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t p-1.5">
          <Link href="/contas" className="block rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground">
            Gerenciar contas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

function MonthGrid({ month, range, onPick }: { month: ISODate; range: DateRange; onPick: (d: ISODate) => void }) {
  const first = parseISO(month);
  const lead = first.getDay();
  const days: ISODate[] = [];
  for (let i = -lead; i < 42 - lead; i++) days.push(addDays(month, i));
  return (
    <div className="w-[224px]">
      <div className="pb-2 text-center text-[13px] font-medium capitalize">
        {monthLong(first.getMonth())} {first.getFullYear()}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEK.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const out = d.slice(0, 7) !== month.slice(0, 7);
          const edge = d === range.start || d === range.end;
          const inside = d > range.start && d < range.end;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                "h-7 text-[12px] tabular transition-colors",
                out && "text-muted-foreground/50",
                inside && "bg-success-soft",
                edge ? "rounded-md bg-primary font-medium text-primary-foreground" : "rounded-md hover:bg-accent",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PeriodPicker({ value, onChange }: { value?: DateRange; onChange?: (r: DateRange) => void }) {
  const fin = useFinance();
  const range = value ?? fin.range;
  const setRange = onChange ?? fin.setRange;
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(range);
  const [picking, setPicking] = React.useState<"start" | "end">("start");
  const [view, setView] = React.useState(startOfMonth(range.start));
  const today = fin.today;
  const presets: [string, DateRange][] = [
    ["Mês atual", monthRange(today)],
    ["Mês anterior", monthRange(addMonths(today, -1))],
    ["Próximo mês", monthRange(addMonths(today, 1))],
    ["Próximos 3 meses", { start: startOfMonth(today), end: endOfMonth(addMonths(today, 2)) }],
    ["Ano anterior", yearRange(addMonths(today, -12))],
    ["Um ano a partir deste mês", { start: startOfMonth(today), end: endOfMonth(addMonths(today, 11)) }],
    ["Este ano", yearRange(today)],
  ];
  const pick = (d: ISODate) => {
    if (picking === "start" || d < draft.start) {
      setDraft({ start: d, end: d });
      setPicking("end");
    } else {
      setDraft({ ...draft, end: d });
      setPicking("start");
    }
  };
  const days = Math.round((parseISO(draft.end).getTime() - parseISO(draft.start).getTime()) / 86_400_000) + 1;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(range);
          setView(startOfMonth(range.start));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button>
          <CalendarDays /> {formatRange(range.start, range.end)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex p-0">
        <ul className="w-48 space-y-0.5 border-r p-2">
          {presets.map(([label, r]) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  setDraft(r);
                  setView(startOfMonth(r.start));
                }}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent",
                  draft.start === r.start && draft.end === r.end && "bg-accent font-medium",
                )}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
        <div className="p-3">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setView(addMonths(view, -1))} className="rounded p-1 hover:bg-accent">
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-[12px] text-muted-foreground">
              {picking === "start" ? "Escolha o início" : "Escolha o fim"}
            </div>
            <button type="button" onClick={() => setView(addMonths(view, 1))} className="rounded p-1 hover:bg-accent">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="flex gap-5">
            <MonthGrid month={view} range={draft} onPick={pick} />
            <MonthGrid month={addMonths(view, 1)} range={draft} onPick={pick} />
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-[12px] text-muted-foreground">{days} dias</span>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setRange(draft);
                  setOpen(false);
                }}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

