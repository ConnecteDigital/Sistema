"use client";

import { Checkbox as CheckboxPrimitive, Popover as PopoverPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { Check, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-eyebrow uppercase", className)} {...props} />;
}

type Tone = "success" | "danger" | "info" | "warning" | "neutral";
const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success-foreground",
  danger: "bg-destructive-soft text-destructive-foreground",
  info: "bg-info-soft text-info-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  neutral: "bg-muted text-muted-foreground",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium leading-none", toneClass[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function CountPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={cn("rounded px-1 text-[10px] font-semibold tabular", toneClass[tone])}>{children}</span>;
}

export function Checkbox(props: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border border-input bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        props.className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** Controle segmentado (ex.: Saldo · Linha · Barras · Acumulado). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 font-medium transition-all [&_svg]:size-3.5",
            size === "sm" ? "h-6 text-[12.5px]" : "h-5 text-[11.5px]",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Abas com sublinhado (ex.: Em aberto · Efetuados · Vencidos). */
export function UnderlineTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="flex gap-1 border-b">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative -mb-px inline-flex h-9 items-center gap-1.5 px-2.5 text-[13px] transition-colors",
            value === o.value
              ? "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = "end", ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        // Nunca passa da tela: em monitores baixos o conteúdo rola por dentro.
        className={cn("z-50 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-2 shadow-xl outline-none animate-pop-in", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[3px] animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          // Em telas baixas o conteúdo rola dentro do modal e o rodapé (botões) fica sempre visível.
          "fixed left-1/2 top-[min(12vh,4rem)] z-50 max-h-[calc(100dvh-min(12vh,4rem)-1rem)] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-xl border bg-card shadow-2xl outline-none animate-pop-in",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
