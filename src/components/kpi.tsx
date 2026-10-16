"use client";

import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CircleAlert } from "lucide-react";
import type * as React from "react";
import { Card, Eyebrow } from "@/components/ui/primitives";
import { formatBRL, splitBRL } from "@/lib/format";
import { useCountUp } from "./count-up";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "info" | "warning" | "neutral";

const ICONS: Record<Exclude<Tone, "neutral">, React.ReactNode> = {
  success: <ArrowDownToLine />,
  danger: <ArrowUpFromLine />,
  info: <ArrowLeftRight />,
  warning: <CircleAlert />,
};
const ICON_BG: Record<Tone, string> = {
  success: "bg-success-soft text-success-foreground",
  danger: "bg-destructive-soft text-destructive-foreground",
  info: "bg-info-soft text-info-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  neutral: "bg-muted text-muted-foreground",
};
const VALUE: Record<Tone, string> = {
  success: "text-success-foreground",
  danger: "text-destructive-foreground",
  info: "text-info-foreground",
  warning: "text-warning-foreground",
  neutral: "text-foreground",
};

export function KpiCard({
  label,
  value,
  amount,
  sub,
  tone,
  icon,
}: {
  label: string;
  /** Texto pronto, ou use `amount` para o valor em reais animado. */
  value?: React.ReactNode;
  amount?: number;
  sub?: React.ReactNode;
  tone: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="flex min-h-[132px] flex-col p-5 animate-pop-in">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow className="pt-1 text-muted-foreground">{label}</Eyebrow>
        <span className={cn("grid size-7 place-items-center rounded-md [&_svg]:size-3.5", ICON_BG[tone])}>
          {icon ?? (tone !== "neutral" && ICONS[tone])}
        </span>
      </div>
      <div className={cn("mt-3 text-[24px] font-semibold tracking-tight tabular", VALUE[tone])}>{amount !== undefined ? <AnimatedBRL value={amount} /> : value}</div>
      {sub && <div className="mt-auto pt-2 text-[11.5px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}

/** Mini-sparkline decorativa do card herói. */
function Sparkline() {
  return (
    <svg viewBox="0 0 120 28" className="absolute bottom-5 right-5 h-7 w-[120px] opacity-60" aria-hidden>
      <path d="M0 22 L14 18 L26 21 L40 14 L54 17 L68 11 L82 13 L96 7 L110 9 L120 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M0 22 L14 18 L26 21 L40 14 L54 17 L68 11 L82 13 L96 7 L110 9 L120 3 L120 28 L0 28Z" fill="currentColor" opacity="0.12" />
    </svg>
  );
}

/** Card de destaque na cor da marca (Saldo atual, Total de lançamentos…). */
function AnimatedBRL({ value }: { value: number }) {
  return <>{formatBRL(Math.round(useCountUp(value) * 100) / 100)}</>;
}

export function HeroCard({ label, amount, count, sub }: { label: string; amount?: number; count?: number; sub?: React.ReactNode }) {
  const animated = useCountUp(amount ?? count ?? 0);
  const parts = amount !== undefined ? splitBRL(Math.round(animated * 100) / 100) : null;
  return (
    <div
      className="relative flex min-h-[132px] flex-col overflow-hidden rounded-xl p-5 text-white shadow-[0_10px_28px_-10px_rgb(227_95_32/0.6)] animate-pop-in"
      style={{ background: "radial-gradient(120% 140% at 15% 0%, var(--hero-to) 0%, var(--hero-from) 65%)" }}
    >
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-white/5 blur-2xl" />
      <Eyebrow className="text-white/75">{label}</Eyebrow>
      <div className="mt-2 flex items-baseline gap-1 tabular">
        {parts ? (
          <>
            <span className="text-[13px] text-white/70">R$</span>
            <span className="text-[38px] font-light leading-none tracking-tight">{parts.int}</span>
            <span className="text-[15px] text-white/70">,{parts.cents}</span>
          </>
        ) : (
          <span className="text-[38px] font-light leading-none tracking-tight">{Math.round(animated)}</span>
        )}
      </div>
      {sub && <div className="relative z-10 mt-auto pt-2 text-[11.5px] text-white/80">{sub}</div>}
      <Sparkline />
    </div>
  );
}
