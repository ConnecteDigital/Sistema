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

const ACTIVE_RING: Record<Tone, string> = {
  success: "border-success/60 ring-2 ring-success/20",
  danger: "border-destructive/60 ring-2 ring-destructive/20",
  info: "border-info/60 ring-2 ring-info/20",
  warning: "border-warning/70 ring-2 ring-warning/25",
  neutral: "border-ring ring-2 ring-ring/20",
};
const ACTIVE_BAR: Record<Tone, string> = {
  success: "bg-success",
  danger: "bg-destructive",
  info: "bg-info",
  warning: "bg-warning",
  neutral: "bg-ring",
};

export function KpiCard({
  label,
  value,
  amount,
  sub,
  tone,
  icon,
  active,
  dimmed,
  onClick,
}: {
  label: string;
  /** Texto pronto, ou use `amount` para o valor em reais animado. */
  value?: React.ReactNode;
  amount?: number;
  sub?: React.ReactNode;
  tone: Tone;
  icon?: React.ReactNode;
  /** Card selecionado como filtro. */
  active?: boolean;
  /** Outro card está selecionado. */
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? Boolean(active) : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "relative flex min-h-[132px] flex-col p-5 animate-pop-in transition-[transform,opacity,box-shadow,border-color] duration-300 ease-out",
        interactive && "cursor-pointer select-none hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active && ACTIVE_RING[tone],
        active && "-translate-y-1 shadow-lg",
        dimmed && "scale-[0.98] opacity-55 hover:opacity-90",
      )}
    >
      {active && <span className={cn("absolute inset-x-5 top-0 h-[3px] rounded-b-full animate-pop-in", ACTIVE_BAR[tone])} />}
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

export function HeroCard({
  label,
  amount,
  count,
  sub,
  dimmed,
  onClick,
}: {
  label: string;
  amount?: number;
  count?: number;
  sub?: React.ReactNode;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const animated = useCountUp(amount ?? count ?? 0);
  const parts = amount !== undefined ? splitBRL(Math.round(animated * 100) / 100) : null;
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex min-h-[132px] flex-col overflow-hidden rounded-xl p-5 text-white shadow-[0_10px_28px_-10px_rgb(227_95_32/0.6)] animate-pop-in transition-[transform,opacity] duration-300",
        onClick && "cursor-pointer hover:-translate-y-0.5",
        dimmed && "scale-[0.98] opacity-70",
      )}
      title={onClick ? "Mostrar tudo" : undefined}
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
