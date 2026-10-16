import { Suspense } from "react";
import { FinanceProvider } from "@/components/finance-provider";
import { AppShell } from "@/components/shell/app-shell";

// O app é todo client-side; o Suspense deixa as rotas dinâmicas (ex.: /contas/[id])
// lerem a URL no navegador sem bloquear a pré-renderização.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <FinanceProvider>
        <AppShell>{children}</AppShell>
      </FinanceProvider>
    </Suspense>
  );
}
