"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  ChevronsUpDown,
  CreditCard,
  Landmark,
  LayoutGrid,
  Lock,
  LogOut,
  Moon,
  PanelLeft,
  Plus,
  Repeat,
  Scale,
  Settings,
  Sparkles,
  Sun,
  Tag,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";
import { useLocalSetting } from "@/lib/use-local-setting";
import { cn } from "@/lib/utils";
import { useFinance } from "../finance-provider";
import { MovementDialogHost, useMovementDialog } from "../movement-dialog";
import { useProfile } from "../profile";
import { ToastProvider } from "../toast";

const NAV = [
  {
    title: "Organização",
    items: [
      { href: "/painel", label: "Painel", icon: LayoutGrid },
      { href: "/movimentos", label: "Movimentos", icon: ArrowLeftRight },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
      { href: "/assistente", label: "Assistente", icon: Sparkles },
    ],
  },
  {
    title: "Controle",
    items: [
      { href: "/contas", label: "Contas bancárias", icon: Landmark },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
      { href: "/categorias", label: "Categorias", icon: Tag },
      { href: "/centros-de-custo", label: "Centros de custo", icon: Target, locked: true },
      { href: "/contatos", label: "Clientes e Fornecedores", icon: Users },
      { href: "/recorrencias", label: "Recorrências", icon: Repeat },
      { href: "/conciliacoes", label: "Conciliações", icon: Scale },
    ],
  },
];

function useTheme() {
  const [theme, setTheme] = useLocalSetting("theme", "light");
  const dark = theme === "dark";
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, toggle: () => setTheme(dark ? "light" : "dark") };
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { data } = useFinance();
  const { open } = useMovementDialog();
  const company = data?.companyName ?? "Connect Digital";
  const profile = useProfile();
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-[52px]" : "w-[224px]",
      )}
    >
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.svg" alt="Connect Digital" className="size-7 shrink-0" />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium">{company}</div>
              <div className="text-[11px] text-sidebar-foreground">Financeiro</div>
            </div>
            <ChevronsUpDown className="size-3.5 text-sidebar-foreground" />
          </>
        )}
      </div>
      <div className="px-2 pb-3">
        <Button variant="primary" size="md" className={cn("w-full justify-start", collapsed && "justify-center px-0")} onClick={() => open({ kind: "inflow" })}>
          <Plus />
          {!collapsed && "Novo lançamento"}
        </Button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2">
        {NAV.map((section) => (
          <div key={section.title}>
            {!collapsed && <div className="px-2 pb-1.5 text-[11px] font-medium text-sidebar-foreground">{section.title}</div>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                        active ? "bg-sidebar-accent font-medium text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && "locked" in item && item.locked && <Lock className="size-3 opacity-60" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-1 px-2 pb-3">
        <Link
          href="/configuracoes"
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Settings className="size-4" strokeWidth={1.75} />
          {!collapsed && "Configurações"}
        </Link>
        <div className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5", collapsed && "justify-center px-0")}>
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-foreground">
            <Building2 className="size-3.5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-medium">{profile.name}</div>
              <div className="truncate text-[11px] text-sidebar-foreground">{company}</div>
            </div>
          )}
          {!collapsed && supabaseConfigured && (
            <button
              onClick={async () => {
                await createClient().auth.signOut();
                // Recarrega a página inteira para descartar os dados em memória.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = "/login";
              }}
              className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebar, setSidebar] = useLocalSetting("sidebar", "open");
  const collapsed = sidebar === "collapsed";
  const { dark, toggle } = useTheme();
  const toggleSidebar = () => setSidebar(collapsed ? "open" : "collapsed");
  return (
    <ToastProvider>
    <MovementDialogHost>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
            <button onClick={toggleSidebar} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Abrir ou recolher o menu">
              <PanelLeft className="size-4" />
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex-1" />
            <button onClick={toggle} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Alternar tema">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[1240px] flex-1 px-5 pb-10 pt-7 md:px-6">
            {children}
          </main>
        </div>
      </div>
    </MovementDialogHost>
    </ToastProvider>
  );
}
