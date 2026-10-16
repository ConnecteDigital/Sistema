"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

const inputClass =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) return router.push("/painel");
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setMessage({ tone: "error", text: "E-mail ou senha incorretos." });
    router.replace("/painel");
    router.refresh();
  }

  async function resetPassword() {
    if (!email.trim()) return setMessage({ tone: "error", text: "Digite seu e-mail para receber o link." });
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    setBusy(false);
    setMessage(error ? { tone: "error", text: error.message } : { tone: "info", text: "Enviamos um link de redefinição para o seu e-mail." });
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[480px_1fr]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex"
        style={{ background: "radial-gradient(70% 45% at 75% 12%, #0b6b4c 0%, transparent 70%), radial-gradient(60% 40% at 0% 100%, #0b5a40 0%, transparent 70%), #0f3b2e" }}
      >
        <div className="grid size-10 place-items-center rounded-lg bg-amber-400 text-sm font-bold text-amber-950">CD</div>
        <div>
          <h1 className="font-display text-[44px] leading-[1.05] tracking-tight">
            Fluxo de caixa
            <br />
            <em>que faz sentido.</em>
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/75">
            O financeiro da Connect Digital: entradas, saídas, mensalidades e relatórios num só lugar.
          </p>
        </div>
        <div className="border-t border-white/15 pt-5 text-[11px] uppercase tracking-[0.16em] text-white/60">Connect Digital · uso interno</div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <form onSubmit={signIn} className="w-full max-w-[400px] animate-pop-in">
          <div className="text-eyebrow uppercase text-success">Connect Financeiro</div>
          <h2 className="mt-2 font-display text-[34px] leading-tight tracking-tight">Bem-vindo de volta</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Entre com seu e-mail e senha para acessar sua conta.</p>

          <label className="mt-8 block space-y-1.5">
            <span className="text-[13px] font-medium">E-mail</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" className={inputClass} />
          </label>
          <label className="mt-4 block space-y-1.5">
            <span className="flex items-center justify-between text-[13px] font-medium">
              Senha
              <button type="button" onClick={resetPassword} className="font-normal text-success-foreground hover:underline">
                Esqueci a senha
              </button>
            </span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </label>

          {message && (
            <p className={message.tone === "error" ? "mt-4 text-[12.5px] text-destructive-foreground" : "mt-4 text-[12.5px] text-success-foreground"} role="status">
              {message.text}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-6 w-full">
            {busy && <Loader2 className="animate-spin" />} Entrar
          </Button>
        </form>
      </main>
    </div>
  );
}
