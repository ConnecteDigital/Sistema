import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Connect Financeiro",
  description: "Fluxo de caixa da Connect Digital",
};

// Aplica o tema salvo antes da primeira pintura (evita piscar no modo escuro).
const themeScript = `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
