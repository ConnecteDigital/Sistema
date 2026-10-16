"use client";

import * as React from "react";

/** Preferência local (tema, menu recolhido) guardada no navegador. */
export function useLocalSetting(key: string, fallback: string) {
  const subscribe = React.useCallback((cb: () => void) => {
    window.addEventListener("local-setting", cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener("local-setting", cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const value = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = React.useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      window.dispatchEvent(new Event("local-setting"));
    },
    [key],
  );
  return [value, set] as const;
}
