import type { Contact } from "./types";

/** Minúsculas, sem acento e com espaços simples: "Assistência  Sensitec" → "assistencia sensitec". */
export const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Cadastro ativo que já tem o mesmo CPF/CNPJ ou o mesmo nome (ignorando acento e maiúsculas). */
export function findDuplicateContact(contacts: Contact[], c: { name: string; taxId: string | null }, exceptId?: string): { contact: Contact; by: "taxId" | "name" } | null {
  const others = contacts.filter((o) => !o.deleted && o.id !== exceptId);
  const digits = (c.taxId ?? "").replace(/\D/g, "");
  if (digits) {
    const hit = others.find((o) => (o.taxId ?? "").replace(/\D/g, "") === digits);
    if (hit) return { contact: hit, by: "taxId" };
  }
  const name = normName(c.name);
  const hit = name ? others.find((o) => normName(o.name) === name) : undefined;
  return hit ? { contact: hit, by: "name" } : null;
}
