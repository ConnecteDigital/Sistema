/**
 * Análises para a aba "Análises" dos relatórios: melhores clientes, de onde vem o dinheiro,
 * evolução do faturamento, serviços, clientes em risco e previsão.
 * Tudo em regime de caixa e só com o que foi recebido/pago, salvo onde dito.
 */
import { addMonths, daysBetween, eachMonth, endOfMonth, startOfMonth } from "./dates";
import { balanceAt, movementsIn, type Scope } from "./finance";
import type { Contact, DateRange, FinanceData, ISODate, Movement } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/* ---------------- Cidade/estado do cliente ---------------- */

export const UF_NAME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** Apelidos/bairros/cidades que aparecem nos nomes dos clientes → [cidade, UF]. */
const CITY_ALIASES: [string, string, string][] = [
  ["sao paulo", "São Paulo", "SP"], ["jabaquara", "São Paulo", "SP"], ["moema", "São Paulo", "SP"], ["santos", "Santos", "SP"],
  ["campinas", "Campinas", "SP"], ["hortolandia", "Hortolândia", "SP"], ["marilia", "Marília", "SP"], ["guarulhos", "Guarulhos", "SP"],
  ["osasco", "Osasco", "SP"], ["sorocaba", "Sorocaba", "SP"], ["ribeirao preto", "Ribeirão Preto", "SP"], ["santo andre", "Santo André", "SP"],
  ["rio de janeiro", "Rio de Janeiro", "RJ"], ["niteroi", "Niterói", "RJ"],
  ["belo horizonte", "Belo Horizonte", "MG"], ["bh", "Belo Horizonte", "MG"], ["contagem", "Contagem", "MG"], ["uberlandia", "Uberlândia", "MG"],
  ["juiz de fora", "Juiz de Fora", "MG"],
  ["porto alegre", "Porto Alegre", "RS"], ["poa", "Porto Alegre", "RS"], ["caxias do sul", "Caxias do Sul", "RS"], ["caxiense", "Caxias do Sul", "RS"],
  ["curitiba", "Curitiba", "PR"], ["foz do iguacu", "Foz do Iguaçu", "PR"], ["londrina", "Londrina", "PR"], ["maringa", "Maringá", "PR"],
  ["balneario camboriu", "Balneário Camboriú", "SC"], ["balneario", "Balneário Camboriú", "SC"], ["joinville", "Joinville", "SC"],
  ["jaragua do sul", "Jaraguá do Sul", "SC"], ["florianopolis", "Florianópolis", "SC"], ["floripa", "Florianópolis", "SC"],
  ["itapema", "Itapema", "SC"], ["blumenau", "Blumenau", "SC"],
  ["salvador", "Salvador", "BA"], ["jaguaquara", "Jaguaquara", "BA"], ["feira de santana", "Feira de Santana", "BA"],
  ["brasilia", "Brasília", "DF"], ["recife", "Recife", "PE"], ["aracaju", "Aracaju", "SE"], ["fortaleza", "Fortaleza", "CE"],
  ["goiania", "Goiânia", "GO"], ["manaus", "Manaus", "AM"], ["belem", "Belém", "PA"], ["natal", "Natal", "RN"], ["maceio", "Maceió", "AL"],
  ["joao pessoa", "João Pessoa", "PB"], ["vitoria", "Vitória", "ES"], ["cuiaba", "Cuiabá", "MT"], ["campo grande", "Campo Grande", "MS"],
  ["teresina", "Teresina", "PI"], ["sao luis", "São Luís", "MA"],
];
const STATE_NAMES: [string, string][] = Object.entries(UF_NAME).map(([uf, name]) => [norm(name), uf]);

const wordAt = (text: string, alias: string) => {
  const m = new RegExp(`(^|[^a-z0-9])${alias.replace(/ /g, "\\s+")}($|[^a-z0-9])`).exec(text);
  return m ? m.index : -1;
};

export interface Place {
  city: string | null;
  state: string | null;
}

/**
 * Onde o cliente fica: endereço cadastrado; se não tiver, o que der para tirar do nome
 * ("Chaveiro Messi(Marília - São Paulo)", "Desentupidora Solução BH", "Raio Sul (SP)").
 */
export function placeOf(c: Pick<Contact, "name" | "address">): Place {
  if (c.address?.city) return { city: c.address.city, state: c.address.state?.toUpperCase() ?? null };
  const text = norm(c.name);
  // A primeira cidade citada ganha; "São Paulo" só vale como cidade se nenhuma outra aparecer
  // (em "Marília - São Paulo" ele é o estado).
  const hits = CITY_ALIASES.map(([alias, city, uf]) => ({ at: wordAt(text, alias), city, uf })).filter((h) => h.at >= 0);
  const best = hits.filter((h) => h.city !== "São Paulo" || !hits.some((o) => o.city !== "São Paulo")).sort((a, b) => a.at - b.at)[0];
  if (best) return { city: best.city, state: best.uf };
  // Siglas só em maiúsculas ("SP", "RJ"), para não confundir com palavras como "se", "pe", "ma".
  const ufs = Object.keys(UF_NAME).map((uf) => ({ at: new RegExp(`(^|[^A-Za-z0-9])${uf}($|[^A-Za-z0-9])`).exec(c.name)?.index ?? -1, uf }));
  const states = [...STATE_NAMES.map(([alias, uf]) => ({ at: wordAt(text, alias), uf })), ...ufs].filter((h) => h.at >= 0);
  if (states.length) return { city: null, state: states.sort((a, b) => b.at - a.at)[0].uf };
  return { city: null, state: c.address?.state?.toUpperCase() ?? null };
}

/* ---------------- Análises ---------------- */

export interface Ranked {
  key: string;
  label: string;
  amount: number;
  count: number;
  share: number;
}

function rank(map: Map<string, { label: string; amount: number; count: number }>, total: number): Ranked[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, amount: round2(v.amount), count: v.count, share: total ? (v.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function bump(map: Map<string, { label: string; amount: number; count: number }>, key: string, label: string, amount: number) {
  const v = map.get(key) ?? { label, amount: 0, count: 0 };
  v.amount += amount;
  v.count++;
  map.set(key, v);
}

export interface Insights {
  revenue: number;
  activeClients: number;
  /** Faturamento médio por cliente ativo, por mês. */
  avgTicket: number;
  newClients: Ranked[];
  clients: Ranked[];
  top5Share: number;
  states: Ranked[];
  cities: Ranked[];
  unknownPlace: number;
  categories: Ranked[];
  /** 12 meses até o fim do período: faturamento, clientes que pagaram e faturamento por categoria. */
  /** costs = custos da operação; withdrawals = retiradas de sócios, empréstimos e investimentos (não é prejuízo). */
  months: { month: string; revenue: number; clients: number; costs: number; withdrawals: number; byCategory: Record<string, number> }[];
  topCategoryKeys: string[];
  atRisk: { contact: Contact; lastPaid: ISODate; days: number; monthly: number; payments: number }[];
  overdue: { contact: Contact | null; label: string; amount: number; count: number; oldest: ISODate }[];
  overdueTotal: number;
  forecast: {
    month: string;
    inflow: number;
    costs: number;
    withdrawals: number;
    /** Saldo previsto no fim do mês, por conta (parte do saldo de hoje). */
    balances: { accountId: string; name: string; balance: number }[];
    balance: number;
  }[];
}

export function computeInsights(data: FinanceData, scope: Scope, period: DateRange, today: ISODate): Insights {
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const all = movementsIn(data, scope, { start: "0000-01-01", end: "9999-12-31" });
  const paidIn = (m: Movement) => m.type === "inflow" && m.paid;
  const inPeriod = all.filter((m) => paidIn(m) && m.date >= period.start && m.date <= period.end);
  const revenue = round2(inPeriod.reduce((s, m) => s + m.amount, 0));

  const byClient = new Map<string, { label: string; amount: number; count: number }>();
  const byState = new Map<string, { label: string; amount: number; count: number }>();
  const byCity = new Map<string, { label: string; amount: number; count: number }>();
  const byCategory = new Map<string, { label: string; amount: number; count: number }>();
  let unknownPlace = 0;
  for (const m of inPeriod) {
    const c = m.contactId ? contacts.get(m.contactId) : undefined;
    bump(byClient, c?.id ?? "-", c?.name ?? "Sem cliente", m.amount);
    bump(byCategory, m.categoryId ?? "-", categories.get(m.categoryId ?? "")?.name ?? "Sem categoria", m.amount);
    const place = c ? placeOf(c) : { city: null, state: null };
    if (place.state) bump(byState, place.state, UF_NAME[place.state] ?? place.state, m.amount);
    if (place.city) bump(byCity, `${place.city}/${place.state}`, `${place.city}${place.state ? ` · ${place.state}` : ""}`, m.amount);
    else if (place.state) bump(byCity, `?/${place.state}`, `${UF_NAME[place.state] ?? place.state} (cidade não informada)`, m.amount);
    if (!place.state) unknownPlace += m.amount;
  }
  const clients = rank(byClient, revenue);
  // Não conta meses que ainda não chegaram (o período padrão é o ano inteiro).
  const lastMonthEnd = period.end < endOfMonth(today) ? period.end : endOfMonth(today);
  // Retirada de lucro, aporte/empréstimo e investimento saem do caixa, mas não são custo da operação.
  // Vale pela seção do grupo ou pelo nome da categoria (no plano importado elas estão em "Despesas Operacionais").
  const withdrawalCats = new Set(
    data.categories
      .filter((c) => {
        const sec = data.groups.find((g) => g.id === c.groupId)?.section;
        return sec === "partners_loans" || sec === "investments" || /retirada|investimento|aporte|empr[eé]stimo|aplica[cç]/i.test(c.name);
      })
      .map((c) => c.id),
  );
  const isWithdrawal = (m: Movement) => withdrawalCats.has(m.categoryId ?? "");
  const months = eachMonth({ start: startOfMonth(addMonths(lastMonthEnd, -11)), end: lastMonthEnd });
  const monthCount = Math.max(1, period.start > lastMonthEnd ? 1 : eachMonth({ start: period.start, end: lastMonthEnd }).length);

  // Primeiro recebimento de cada cliente (em toda a história) → novos no período.
  const firstPaid = new Map<string, ISODate>();
  for (const m of all) if (paidIn(m) && m.contactId && (!firstPaid.has(m.contactId) || m.date < firstPaid.get(m.contactId)!)) firstPaid.set(m.contactId, m.date);
  const newClients = clients.filter((c) => c.key !== "-" && (firstPaid.get(c.key) ?? "") >= period.start);

  const catRank = rank(byCategory, revenue);
  const topCategoryKeys = catRank.slice(0, 5).map((c) => c.key);
  const monthRows = months.map((month) => ({ month, revenue: 0, clients: 0, costs: 0, withdrawals: 0, byCategory: {} as Record<string, number> }));
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const monthClients = months.map(() => new Set<string>());
  for (const m of all) {
    const i = monthIdx.get(m.date.slice(0, 7));
    if (i === undefined || !m.paid) continue;
    if (m.type === "outflow") {
      if (isWithdrawal(m)) monthRows[i].withdrawals += m.amount;
      else monthRows[i].costs += m.amount;
      continue;
    }
    monthRows[i].revenue += m.amount;
    if (m.contactId) monthClients[i].add(m.contactId);
    const key = topCategoryKeys.includes(m.categoryId ?? "-") ? (m.categoryId ?? "-") : "outros";
    monthRows[i].byCategory[key] = (monthRows[i].byCategory[key] ?? 0) + m.amount;
  }
  monthRows.forEach((r, i) => {
    r.revenue = round2(r.revenue);
    r.costs = round2(r.costs);
    r.withdrawals = round2(r.withdrawals);
    r.clients = monthClients[i].size;
  });

  // Clientes em risco: pagavam com frequência (3+ vezes) e não pagam há mais de 45 dias.
  const history = new Map<string, Movement[]>();
  for (const m of all) if (paidIn(m) && m.contactId) history.set(m.contactId, [...(history.get(m.contactId) ?? []), m]);
  const atRisk = [...history.entries()]
    .map(([id, ms]) => {
      const sorted = ms.sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted.at(-1)!.date;
      const recent = sorted.filter((m) => m.date >= addMonths(last, -6));
      const span = Math.max(1, eachMonth({ start: recent[0].date, end: last }).length);
      return { contact: contacts.get(id)!, lastPaid: last, days: daysBetween(last, today), monthly: round2(recent.reduce((s, m) => s + m.amount, 0) / span), payments: sorted.length };
    })
    .filter((r) => r.contact && !r.contact.deleted && r.payments >= 3 && r.days > 45 && r.days < 400)
    .sort((a, b) => b.monthly - a.monthly);

  // Inadimplência: recebimentos vencidos e não pagos.
  const overdueMap = new Map<string, { contact: Contact | null; label: string; amount: number; count: number; oldest: ISODate }>();
  for (const m of all) {
    if (m.type !== "inflow" || m.paid || m.date >= today) continue;
    const c = m.contactId ? (contacts.get(m.contactId) ?? null) : null;
    const key = c?.id ?? "-";
    const v = overdueMap.get(key) ?? { contact: c, label: c?.name ?? "Sem cliente", amount: 0, count: 0, oldest: m.date };
    v.amount += m.amount;
    v.count++;
    if (m.date < v.oldest) v.oldest = m.date;
    overdueMap.set(key, v);
  }
  const overdue = [...overdueMap.values()].map((v) => ({ ...v, amount: round2(v.amount) })).sort((a, b) => b.amount - a.amount);

  // Próximos 3 meses: o que está lançado em aberto e o saldo previsto de cada conta no fim do mês,
  // partindo do saldo de hoje (o que já foi guardado em meses anteriores conta).
  const accounts = data.accounts.filter((a) => a.active && (!scope.accountIds.length || scope.accountIds.includes(a.id))).sort((a, b) => a.position - b.position);
  const running = new Map(accounts.map((a) => [a.id, balanceAt(data, { accountIds: [a.id] }, today)]));
  const fMonths = eachMonth({ start: startOfMonth(today), end: endOfMonth(addMonths(today, 2)) });
  const forecast = fMonths.map((month) => {
    let inflow = 0;
    let costs = 0;
    let withdrawals = 0;
    for (const m of all) {
      if (m.paid || m.date < today || m.date.slice(0, 7) !== month || !running.has(m.bankAccountId)) continue;
      running.set(m.bankAccountId, running.get(m.bankAccountId)! + (m.type === "inflow" ? m.amount : -m.amount));
      if (m.type === "inflow") inflow += m.amount;
      else if (isWithdrawal(m)) withdrawals += m.amount;
      else costs += m.amount;
    }
    const balances = accounts.map((a) => ({ accountId: a.id, name: a.name, balance: round2(running.get(a.id)!) }));
    return { month, inflow: round2(inflow), costs: round2(costs), withdrawals: round2(withdrawals), balances, balance: round2(balances.reduce((s, b) => s + b.balance, 0)) };
  });

  const activeClients = clients.filter((c) => c.key !== "-").length;
  return {
    revenue,
    activeClients,
    avgTicket: activeClients ? round2(revenue / activeClients / monthCount) : 0,
    newClients,
    clients,
    top5Share: clients.slice(0, 5).reduce((s, c) => s + c.share, 0),
    states: rank(byState, revenue),
    cities: rank(byCity, revenue),
    unknownPlace: round2(unknownPlace),
    categories: catRank,
    months: monthRows,
    topCategoryKeys,
    atRisk,
    overdue,
    overdueTotal: round2(overdue.reduce((s, o) => s + o.amount, 0)),
    forecast,
  };
}
