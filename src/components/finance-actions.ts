"use client";

import * as React from "react";
import * as api from "@/lib/mutations";
import type { FinanceData, Movement } from "@/lib/types";
import { useFinance } from "./finance-provider";
import { useToast } from "./toast";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * Ações sobre lançamentos com atualização otimista: a tela muda na hora,
 * o banco é gravado em seguida e, se der erro, os dados são recarregados.
 */
export function useFinanceActions() {
  const { applyLocal, reload } = useFinance();
  const toast = useToast();

  const run = React.useCallback(
    async (local: (d: FinanceData) => FinanceData, remote: () => Promise<unknown>, ok: string, undo?: () => void) => {
      applyLocal(local);
      try {
        await remote();
        toast({ tone: "success", title: ok, action: undo ? { label: "Desfazer", onClick: undo } : undefined });
      } catch (e) {
        await reload();
        toast({ tone: "error", title: errorText(e, "Não foi possível salvar.") });
      }
    },
    [applyLocal, reload, toast],
  );

  const setPaid = React.useCallback(
    function setPaid(ids: string[], paid: boolean): Promise<void> {
      if (!ids.length) return Promise.resolve();
      return run(
        (d) => ({ ...d, movements: d.movements.map((m) => (ids.includes(m.id) ? { ...m, paid } : m)) }),
        () => api.setMovementsPaid(ids, paid),
        paid ? plural(ids.length, "lançamento baixado", "lançamentos baixados") : "Baixa desfeita",
        () => void setPaid(ids, !paid),
      );
    },
    [run],
  );

  const remove = React.useCallback(
    (items: Movement[]) => {
      const ids = items.map((m) => m.id);
      return run(
        (d) => ({ ...d, movements: d.movements.filter((m) => !ids.includes(m.id)) }),
        () => api.deleteMovements(ids),
        plural(ids.length, "lançamento excluído", "lançamentos excluídos"),
        () =>
          void run(
            (d) => ({ ...d, movements: [...d.movements, ...items] }),
            () => api.restoreMovements(items),
            "Lançamentos restaurados",
          ),
      );
    },
    [run],
  );

  const duplicate = React.useCallback(
    async (m: Movement) => {
      try {
        const copy: api.MovementInput = { ...m, paid: false, recurrenceId: null };
        delete (copy as Partial<Movement>).id;
        await api.insertMovements([copy]);
        await reload();
        toast({ tone: "success", title: "Lançamento duplicado" });
      } catch (e) {
        toast({ tone: "error", title: errorText(e, "Não foi possível duplicar.") });
      }
    },
    [reload, toast],
  );

  return { setPaid, remove, duplicate };
}
