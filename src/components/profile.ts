"use client";

import * as React from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export interface Profile {
  name: string;
  email: string | null;
}

const FALLBACK: Profile = { name: process.env.NEXT_PUBLIC_USER_NAME || "Financeiro", email: null };
// No servidor (e na hidratação) usa um valor fixo, para o HTML bater com o primeiro render do navegador.
const SERVER: Profile = { name: "Financeiro", email: null };
let current: Profile = FALLBACK;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function start() {
  if (started || !supabaseConfigured) return;
  started = true;
  createClient()
    .auth.getUser()
    .then(({ data }) => {
      const u = data.user;
      if (!u) return;
      current = { name: (u.user_metadata?.name as string) || FALLBACK.name, email: u.email ?? null };
      emit();
    });
}

/** Nome e e-mail do usuário logado (o nome fica no user_metadata do Supabase Auth). */
export function useProfile(): Profile {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      start();
      return () => listeners.delete(cb);
    },
    () => current,
    () => SERVER,
  );
}

export async function saveProfileName(name: string) {
  const { error } = await createClient().auth.updateUser({ data: { name } });
  if (error) throw new Error(error.message);
  current = { ...current, name };
  emit();
}

export async function changePassword(password: string) {
  const { error } = await createClient().auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
