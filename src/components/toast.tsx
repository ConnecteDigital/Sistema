"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface Toast {
  id: number;
  tone: "success" | "error";
  title: string;
  action?: { label: string; onClick: () => void };
}

const ToastCtx = React.createContext<((t: Omit<Toast, "id">) => void) | null>(null);

export function useToast() {
  const ctx = React.use(ToastCtx);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);
  const dismiss = React.useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = React.useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++nextId.current;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 6000 : 3500);
    },
    [dismiss],
  );
  return (
    <ToastCtx value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-popover px-3.5 py-2.5 text-[13px] shadow-xl animate-toast-in"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 text-success-foreground" />
            ) : (
              <CircleAlert className="size-4 shrink-0 text-destructive-foreground" />
            )}
            <span className="flex-1">{t.title}</span>
            {t.action && (
              <button
                className={cn("rounded px-1.5 py-0.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand-soft")}
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Fechar">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx>
  );
}
