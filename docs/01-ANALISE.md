# Análise do sistema de referência (FCS — Fluxo de Caixa Simples)

Análise feita em 15/10/2026 com o REA (Reverse Engineer Anything) + navegador
automatizado, **somente leitura**: todas as requisições de escrita para a API do
sistema foram bloqueadas durante a captura (nenhum lançamento foi criado,
editado ou excluído). Os prints e o backup ficam fora do repositório, por
conterem dados da empresa.

Legenda: **[observado]** = visto na tela/rede · **[inferido]** = conclusão a
partir do que foi observado · **[desconhecido]** = não deu para confirmar.

---

## 1. Tecnologia do original

| Item | Achado | Fonte |
|---|---|---|
| Framework | Next.js (App Router, build Turbopack) + React | REA `analyze_web_bundle` (fingerprint "high") **[observado]** |
| API | tRPC em `/svc/api/trpc/*`, consultas em lote (batch GET) | rede **[observado]** |
| Tempo real | SSE em `/svc/api/api/realtime/events` | rede **[observado]** |
| Login | Firebase Auth (e-mail/senha + Google) | rede (`identitytoolkit.googleapis.com`) **[observado]** |
| UI | Tailwind CSS v4 + tokens no padrão shadcn/ui (`--sidebar`, `--primary`, `--muted`…) | CSS computado **[observado]** |
| Fontes | Inter (texto), JetBrains Mono (números/código), serifa de display na tela de login | CSS **[observado]** |
| Gráficos | Áreas/linhas/barras com tooltip; biblioteca exata **[desconhecido]** (provável Recharts) | **[inferido]** |

### Procedimentos da API encontrados (mapa de funcionalidades)

`analytics`: balanceSummary, dailyBalances, monthlySeries, ledgerTabs, ledgerBreakdown, transferPanel, cashflowSummary, cashflowStatement ·
`movements`: list, statement · `inflows` / `outflows`: list, create, update, remove ·
`cashTransfers`: list, create, remove · `bankAccounts`: list, create, update, getVolumes ·
`creditCards`: list · `categories` / `categoryGroups`: list, create, update, getById ·
`costCenters`: list, create, update, getVolumes · `stakeholders`: list, board, create, update, getById ·
`recurrences`: board · `reconciliations`: list · `invoices` (NFS-e): settings, issue, issueBatch, cancel, retry, refresh, statusByInflows… ·
`openFinance`: overview, linkAccount, createConnectToken… · `onboarding`, `userSettings`, `workspaceMembers`, `auth`.

---

## 2. Identidade visual

| Token | Valor |
|---|---|
| Verde da marca (`--primary`) | `#0f3b2e` |
| Fundo da página | branco 97% + 3% do verde (≈ `#f8f9f9`) |
| Sidebar | neutro-50 94% + 6% do verde (≈ `#eceeed`) |
| Cards | `#ffffff`, borda `#000` 8%, raio ~12px, sombra leve |
| Raio base (`--radius`) | `0.625rem` (botões ~7px) |
| Sucesso / entradas | emerald-500/700 (`#1b8d5f` no gráfico) |
| Saídas / destrutivo | red-500 |
| Transferências / info | blue-500 (`#3b82f6`) |
| Vencidos / alerta | amber-500/700 |
| Fonte base | Inter 14px; títulos 24.5px peso 600, tracking −0.6px |
| Rótulos dos KPIs | CAIXA ALTA, espaçado, 11–12px |

Padrões visuais **[observado]**:
- **Card "herói" verde-escuro** (gradiente do `#0f3b2e`) à esquerda de cada linha de KPIs, com número grande, centavos menores e mini-sparkline.
- KPIs com ícone em quadradinho colorido suave (verde ↓, vermelho ↑, azul ⇆, âmbar !).
- Títulos com a segunda palavra em verde (ex.: "Entradas e **saídas**", "Plano de **categorias**", "O que se **repete**").
- Badges de status pequenos: "A receber" / "A pagar" (âmbar), "Pago" (verde), "Ativa".
- Avatares de contato com iniciais em quadrado colorido.
- Tema claro e escuro (toggle de lua no topo) + opção de paleta "Padrão / Contraste" em Configurações → Aparência.
- Sidebar recolhível (botão no topo), modal com fundo desfocado (blur).

---

## 3. Estrutura de navegação

Sidebar:
- Seletor de empresa (multiempresa) + botão **Novo lançamento**
- **Organização**: Painel · Movimentos · Relatórios · Assistente
- **Controle**: Contas bancárias · Cartões · Categorias · Centros de custo (plano pago) · Clientes e Fornecedores · Recorrências · Conciliações
- Rodapé: Configurações · menu do usuário (Meu perfil, Primeiros passos, Sair)

Filtros globais que aparecem em quase todas as telas: **seletor de contas** (multi,
com "Ver extrato" e "Gerenciar contas") e **seletor de período** (atalhos: mês
atual, mês anterior, próximo mês, próximos 3 meses, ano anterior, um ano a partir
deste mês, este ano; calendário duplo com início/fim e "Aplicar").

---

## 4. Telas e funções

### 4.1 Painel (`/dashboard/overview`)
- Saudação por horário ("Boa tarde/noite, NOME.") + período.
- KPIs: **Saldo atual** (herói, com projeção) · **Recebidos** (previsto) · **Despesas** (previsto) · **Transferências** (qtd entre contas) · **Vencidos · ação**.
- Card **Contas**: lista com checkbox (filtra o painel), saldo de cada conta, "+ Nova", **Total disponível**.
- Card **Fluxo de caixa**: 4 modos — Saldo / Linha / Barras / Acumulado; linha "hoje"; rodapé com saldo no início, saldo no fim, menor saldo do período.
- **O que entra** / **O que sai**: abas Em aberto · Efetuados · Vencidos (com contadores), tabela com ações rápidas (✓ baixar, ✎ editar, 🗑 excluir), total e paginação; botão "Lançar".

### 4.2 Movimentos (`/dashboard/movements`)
- KPIs: Total de lançamentos (saldo) · Entradas · Saídas · Transferências · Atrasados.
- Barra: período, busca (descrição/cliente), **Filtros** (conta, status, regime caixa/competência, grupo, categoria, cliente/fornecedor, valor mín/máx), exportar.
- Tabela: Data (+dia da semana), Descrição (ícone ↑/↓), Cliente/Fornecedor (avatar), Categoria (bolinha colorida), Valor, Status, menu "…"; ordenação; total geral; paginação.
- **Importar** planilha (CSV/XLSX, assistente em 4 passos: Arquivo → Padrões → Colunas → Confirmação; colar da planilha; baixar modelo).

### 4.3 Modal "Novo lançamento" (o coração do sistema)
- Abas de tipo: **Conta a receber** · **Conta a pagar** · **Transferência**.
- Esquerda: Valor (grande), Data + "Já foi recebido/pago", Descrição*, Categoria*, Conta*.
- Direita, sub-abas:
  - **Dados**: Competência (acompanha a data), Cliente/Fornecedor, Juros e taxas (R$ ou %) + categoria dos juros.
  - **Recorrência**: Não repetir · Diário · Semanal · Quinzenal · Mensal · Trimestral · Semestral · Anual.
  - **Adicionais**: Número do documento, Observações.
  - **Documentos**: anexos (PDF, XML, imagem, planilha até 25 MB).
- Transferência: valor, data, descrição, conta de origem, conta de destino.
- Botões: Cancelar · **Adicionar e continuar** · Adicionar recebimento/pagamento. Na edição: Excluir · Salvar alterações.
- Opção de layout "Compacta" (Configurações → Aparência).

### 4.4 Relatórios (`/dashboard/reports`)
- KPIs: Saldo inicial · Entradas · Saídas · Variação de caixa · Saldo final.
- Aba **Demonstrativo** (DFC mês a mês, regime de caixa, realizado): Receitas da operação → Custos que variam com a venda → **Margem de contribuição** (R$ e %) → Despesas fixas do mês → **Resultado operacional** → Juros, tarifas e outras → Geração de caixa operacional → Investimentos e bens → Sócios e empréstimos → **Variação de caixa** → Saldo inicial / Saldo final. Toggle "Detalhar categorias", linhas expansíveis, negativos entre parênteses em vermelho.
- Aba **Fluxo mensal**: barras realizado × previsto (6m/12m/24m; Barras/Linha/Acumulado) + tabela mês a mês (entradas/saídas reais e previstas, resultado, acumulado, % realização).
- Aba **Categorias**: despesas por categoria com barras de %.
- **Exportar** CSV / PDF.

### 4.5 Assistente (`/dashboard/assistant`)
Chat de IA sobre os dados ("Como está meu caixa hoje?", "O que vence esta semana?", "Onde mais gastei este mês?", "Resumo do DRE do mês"), com histórico de conversas.

### 4.6 Contas bancárias + Extrato
- Lista: conta, movimentação no período, nº de lançamentos, saldo atual, ativa, ações. Nova conta: nome, banco (opcional), agência, número, saldo inicial, ativa.
- **Extrato** (`/dashboard/statements/{id}`): navegação por mês, gráfico de saldo, extrato com saldo anterior e saldo corrente por dia, toggle "Mostrar pendentes", conciliações OFX da conta.

### 4.7 Cartões
Limite, dia de fechamento/vencimento, conta pagadora, débito automático da fatura.

### 4.8 Categorias (plano de contas)
Grupos (tipo Receita/Despesa, **seção do demonstrativo**, cor) com categorias dentro; saldo por período; arrastar para reordenar; "Recolher tudo"; busca.

### 4.9 Clientes e Fornecedores
KPIs (total, clientes, fornecedores, ambos), lista com entradas/saídas/volume/última atividade, filtros, importar. Cadastro com abas Dados, Endereço, Pagamento, Documentos, Observações (tipo cliente/fornecedor, Brasil/Exterior, CPF/CNPJ, e-mail, WhatsApp).

### 4.10 Recorrências ("O que se repete")
KPIs: resultado recorrente/mês (cobertura do custo fixo), entradas e saídas recorrentes/mês, saldo a vencer, em atraso. Abas Todas · Ativas · Em atraso · Concluídas · Canceladas. Tabela: repetição, andamento (nº lançados), próximo vencimento ("em X dias"), valor, por mês, a vencer, situação. Gráfico "Os próximos 12 meses".

### 4.11 Conciliações
Importação de extrato **OFX** por conta e comparação com os lançamentos.

### 4.12 Configurações
Meu perfil · Dados da empresa · Nota fiscal (NFS-e) · Usuários e permissões (convites) · Aparência (tema, paleta, layout do modal) · Integrações (API, webhooks, MCP) · Importar do FCS V1 · Assinatura · Créditos · Tarefas em segundo plano.

---

## 5. Dados (backup `dados-2026-10-15.json`, formato export FCS V1)

| Entidade | Qtd | Observação |
|---|---|---|
| Lançamentos | 1.856 | 1.420 entradas / 436 saídas; 1.310 pagos, 546 em aberto; 31/10/2024 → 11/2027 |
| Recorrências | 156 | mensal, semanal, quinzenal; 1.264 lançamentos ligados a uma série |
| Transferências | 29 | Caixa → Investimento |
| Clientes | 139 | 8 excluídos (a tela mostra 131); 1 nome duplicado |
| Categorias / grupos | 31 / 6 | o sistema novo mostra 55/14 porque já vem com um plano padrão extra |
| Contas | 2 | Caixa da empresa, Investimento |

**Validação:** recalculando a partir do backup (saldo inicial + lançamentos pagos ± transferências),
os saldos batem centavo a centavo com o sistema: Caixa da empresa **R$ 360.236,59**,
Investimento **R$ 35.304,20**, total **R$ 395.540,79**.

**Observação:** a conta está no **período de teste de 7 dias do FCS V2** e o backup já
foi importado nele hoje (Configurações → Importar do FCS V1, 15/10/2026 19:43).

---

## 6. Fora do escopo / a decidir
- **NFS-e, Open Finance, créditos, assinatura/planos**: dependem de serviços pagos de terceiros (prefeituras, agregador bancário). Sugestão: deixar para uma fase posterior.
- **Centros de custo**: existem no modelo, mas não são usados nos dados atuais.
- **Assistente de IA**: possível com a API do Claude numa fase posterior.
