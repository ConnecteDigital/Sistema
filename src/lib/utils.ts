import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Tamanhos de texto próprios do tema, para o merge não confundi-los com cores.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["eyebrow", "title"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Cores dos grupos (nomes do export original) → hex. */
export const GROUP_COLORS: Record<string, string> = {
  green: "#10b981",
  red: "#ef4444",
  volcano: "#f97316",
  orange: "#f59e0b",
  gold: "#eab308",
  lime: "#84cc16",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  geekblue: "#6366f1",
  purple: "#8b5cf6",
  magenta: "#db2777",
  gray: "#a3a3a3",
};

export const groupColor = (c: string | null | undefined) => (c && (GROUP_COLORS[c] ?? (c.startsWith("#") ? c : null))) || GROUP_COLORS.gray;

const AVATAR_PALETTE = ["#b91c1c", "#c2410c", "#9a3412", "#15803d", "#0f766e", "#1d4ed8", "#6d28d9", "#a21caf", "#be185d", "#4d7c0f"];

/** Cor estável para avatar a partir do nome. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
