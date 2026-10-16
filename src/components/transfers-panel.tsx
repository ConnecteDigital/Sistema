"use client";

import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { formatBRL, formatDate } from "@/lib/format";
import type { Transfer } from "@/lib/types";

export function TransfersPanel({ transfers, accountName }: { transfers: Transfer[]; accountName: (id: string) => string }) {
  const total = transfers.reduce((s, t) => s + t.amount, 0);
  return (
    <Card className="p-5 animate-pop-in lg:col-span-2">
      <h2 className="text-[15px] font-semibold">Transferências entre contas</h2>
      <p className="text-[12.5px] text-muted-foreground">
        {transfers.length} no período · <span className="font-semibold text-info-foreground tabular">{formatBRL(total)}</span>
      </p>
      <ul className="mt-3 divide-y">
        {transfers.map((t, i) => (
          <li key={t.id} className="flex items-center gap-4 py-3 text-[13px] animate-row-in" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="w-24 text-muted-foreground tabular">{formatDate(t.date)}</span>
            <span className="flex flex-1 items-center gap-2 truncate">
              <span className="font-medium">{accountName(t.sourceAccountId)}</span>
              <ArrowRight className="size-3.5 text-info-foreground" />
              <span className="font-medium">{accountName(t.destinationAccountId)}</span>
              {t.description && t.description !== "Transferência" && <span className="truncate text-muted-foreground">· {t.description}</span>}
            </span>
            <span className="font-semibold text-info-foreground tabular">{formatBRL(t.amount)}</span>
          </li>
        ))}
        {transfers.length === 0 && <li className="py-10 text-center text-[12.5px] text-muted-foreground">Nenhuma transferência no período.</li>}
      </ul>
    </Card>
  );
}
