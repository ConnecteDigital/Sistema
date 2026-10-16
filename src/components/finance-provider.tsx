"use client";

import * as React from "react";
import { monthRange, todayISO } from "@/lib/dates";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { loadFinanceData } from "@/lib/supabase/load";
import { autoDebitDue } from "@/lib/cards";
import { insertMovements, setMovementsPaid } from "@/lib/mutations";
import { missingOccurrences } from "@/lib/recurrence";
import type { DateRange, FinanceData } from "@/lib/types";

interface FinanceContextValue {
  data: FinanceData | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Atualização otimista: muda os dados na tela antes de o banco responder. */
  applyLocal: (fn: (d: FinanceData) => FinanceData) => void;
  today: string;
  range: DateRange;
  setRange: (r: DateRange) => void;
  /** Contas selecionadas; vazio = todas. */
  accountIds: string[];
  setAccountIds: (ids: string[]) => void;
}

const noopSubscribe = () => () => {};

const FinanceContext = React.createContext<FinanceContextValue | null>(null);

async function fetchData(): Promise<FinanceData> {
  if (supabaseConfigured) return loadFinanceData(createClient());
  const res = await fetch("/api/dev-data");
  if (!res.ok) throw new Error("Supabase não configurado e sem dados locais (defina LOCAL_LEGACY_EXPORT em desenvolvimento).");
  return res.json();
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<FinanceData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  // A data de hoje só existe no navegador (o app é 100% client-side).
  const today = React.useSyncExternalStore(noopSubscribe, todayISO, () => "");
  const [chosenRange, setRange] = React.useState<DateRange | null>(null);
  const range = React.useMemo(() => chosenRange ?? (today ? monthRange(today) : { start: "", end: "" }), [chosenRange, today]);
  const [accountIds, setAccountIds] = React.useState<string[]>([]);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchData());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    fetchData()
      .then(async (d) => {
        // Completa as séries recorrentes sem fim (sempre 12 meses à frente).
        const missing = supabaseConfigured ? missingOccurrences(d, todayISO()) : [];
        // Baixa as faturas de cartão em débito automático que já venceram.
        const autoPaid = supabaseConfigured ? autoDebitDue(d, todayISO()) : [];
        if (!missing.length && !autoPaid.length) return d;
        try {
          for (let i = 0; i < missing.length; i += 200) await insertMovements(missing.slice(i, i + 200));
          if (autoPaid.length) await setMovementsPaid(autoPaid, true);
          return await fetchData();
        } catch {
          return d;
        }
      })
      .then(
        (d) => !cancelled && (setData(d), setLoading(false)),
        (e) => !cancelled && (setError(e instanceof Error ? e.message : String(e)), setLoading(false)),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const applyLocal = React.useCallback((fn: (d: FinanceData) => FinanceData) => setData((d) => (d ? fn(d) : d)), []);

  const value = React.useMemo(
    () => ({ data: today ? data : null, error, loading, reload, applyLocal, today, range, setRange, accountIds, setAccountIds }),
    [data, error, loading, reload, applyLocal, today, range, accountIds],
  );
  return <FinanceContext value={value}>{children}</FinanceContext>;
}

export function useFinance() {
  const ctx = React.use(FinanceContext);
  if (!ctx) throw new Error("useFinance fora do FinanceProvider");
  return ctx;
}
