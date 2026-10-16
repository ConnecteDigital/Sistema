/** Utilidades brasileiras: CPF/CNPJ, telefone, CEP e consulta de CNPJ. */
import type { Address } from "./types";

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function isValidCPF(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Formata enquanto digita: CPF até 11 dígitos, CNPJ acima disso. */
export function maskTaxId(v: string): string {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11)
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function taxIdStatus(v: string | null): "empty" | "cpf" | "cnpj" | "invalid" {
  const d = onlyDigits(v ?? "");
  if (!d) return "empty";
  if (d.length === 11) return isValidCPF(d) ? "cpf" : "invalid";
  if (d.length === 14) return isValidCNPJ(d) ? "cnpj" : "invalid";
  return "invalid";
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const maskCEP = (v: string) => onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

/** ViaCEP (consulta direto do navegador). */
export async function lookupCEP(cep: string): Promise<Address | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j.erro) return null;
  return { zip: maskCEP(d), street: j.logradouro, district: j.bairro, city: j.localidade, state: j.uf, ibge: j.ibge };
}

export interface CNPJInfo {
  name: string;
  tradeName: string | null;
  email: string | null;
  phone: string | null;
  address: Address;
}

/** Dados públicos do CNPJ (BrasilAPI). */
export async function lookupCNPJ(cnpj: string): Promise<CNPJInfo | null> {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return null;
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  if (!res.ok) return null;
  const j = await res.json();
  const cap = (s: string | null | undefined) => (s ? s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : undefined);
  return {
    name: j.razao_social,
    tradeName: j.nome_fantasia || null,
    email: j.email ? String(j.email).toLowerCase() : null,
    phone: j.ddd_telefone_1 ? maskPhone(j.ddd_telefone_1) : null,
    address: {
      zip: j.cep ? maskCEP(String(j.cep)) : undefined,
      street: cap(`${j.descricao_tipo_de_logradouro ?? ""} ${j.logradouro ?? ""}`.trim()),
      number: j.numero || undefined,
      complement: cap(j.complemento),
      district: cap(j.bairro),
      city: cap(j.municipio),
      state: j.uf,
      ibge: j.codigo_municipio_ibge ? String(j.codigo_municipio_ibge) : undefined,
    },
  };
}
