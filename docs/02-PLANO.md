# Plano de construção — Connect Financeiro

Sistema interno da Connect Digital, recriando as funções e a estética do FCS
(ver `01-ANALISE.md`), com todos os dados migrados.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js (App Router) + TypeScript | mesma base do original; deploy nativo na Vercel |
| UI | Tailwind CSS v4 + shadcn/ui + lucide-react | é o mesmo sistema de tokens do original (`--primary #0f3b2e`, sidebar, cards) |
| Gráficos | Recharts | saldo, linha, barras, acumulado |
| Banco + login | Supabase (Postgres + Auth + Storage + RLS) | login, anexos, regras de acesso por usuário |
| Hospedagem | Vercel + domínio próprio | — |
| Testes | Vitest (cálculos) + Playwright (telas) | garantir que saldos e DFC batem com o original |

## Modelo de dados (Supabase)

```
workspaces            (id, nome, cnpj)
members               (workspace_id, user_id, papel: admin|editor|leitor)
bank_accounts         (id, nome, banco, agencia, numero, saldo_inicial, ativa, cor, ordem)
credit_cards          (id, nome, limite, dia_fechamento, dia_vencimento, conta_pagadora_id)
category_groups       (id, nome, tipo: receita|despesa, secao_dfc, cor, ordem)
categories            (id, group_id, nome, ordem)
contacts              (id, nome, tipo: cliente|fornecedor|ambos, cpf_cnpj, email, telefone, endereco jsonb, obs, excluido)
recurrences           (id, tipo, valor, periodo, quantidade, fixa, ativa, proxima_data, conta, categoria, contato, descricao…)
movements             (id, tipo: entrada|saida, data, competencia, vencimento, valor, descricao, conta_id, categoria_id,
                       contato_id, pago, parcela, total_parcelas, recurrence_id, documento, obs, juros jsonb, origem)
transfers             (id, data, valor, descricao, conta_origem_id, conta_destino_id)
attachments           (id, movement_id, caminho_storage, nome, tamanho)
reconciliations       (id, conta_id, periodo, saldo_final, arquivo_ofx)  -- fase 4
```
Saldos, DFC e séries do gráfico serão calculados por **views/funções SQL**, não guardados.

## Fases (cada uma entregue e conferida antes da próxima)

### Fase 1: Base + Painel
1. Projeto Next.js + Tailwind + shadcn com o tema do original (claro/escuro, tokens da análise).
2. Supabase: tabelas, RLS e login (e-mail/senha + Google).
3. Layout: sidebar recolhível, seletor de empresa, filtros globais de **conta** e **período** (com os atalhos).
4. **Painel** completo: KPIs, card herói, Contas, Fluxo de caixa (4 modos), O que entra / O que sai.

### Fase 2: Importação dos dados
5. Script de importação do JSON (export FCS V1) → Supabase, preservando recorrências, parcelas e transferências.
6. **Conferência automática:** os saldos por conta e por mês têm que bater com o original (R$ 360.236,59 / R$ 35.304,20) antes de aceitar a importação.

### Fase 3: Operação do dia a dia
7. **Modal de lançamento** (receber / pagar / transferência; abas Dados, Recorrência, Adicionais, Documentos; "Adicionar e continuar").
8. **Movimentos**: tabela, busca, filtros, ordenação, paginação, ações rápidas, exportar CSV.
9. **Recorrências**: geração automática dos próximos lançamentos, abas por situação, gráfico dos 12 meses.
10. **Contas bancárias + Extrato** com saldo dia a dia.
11. **Categorias** (grupos, cores, seção do DFC, arrastar para ordenar) e **Clientes e Fornecedores**.

### Fase 4: Relatórios e extras
12. **Relatórios**: Demonstrativo (DFC mês a mês), Fluxo mensal, Categorias, exportação CSV/PDF.
13. **Cartões** (limite, fatura, vencimento).
14. **Conciliação OFX**.
15. Configurações: perfil, empresa, usuários/convites, aparência.

### Fase 5: Publicação
16. Deploy na Vercel, domínio próprio, variáveis de ambiente, backup automático do banco.

### Fase 6: Nota fiscal (NFS-e) pelo sistema
17. Botão **"Emitir nota fiscal"** no lançamento de entrada (sempre com confirmação, nunca automático).
    Ao confirmar, a nota é emitida, o PDF e o XML ficam anexados ao lançamento e o status aparece na lista.
18. Caminho preferido: **API do Emissor Nacional da NFS-e** (gov.br/nfse), sem mensalidade, só com o
    certificado digital A1. Alternativa, se a prefeitura não aceitar emissão pelo ambiente nacional:
    provedor de API (NFE.io, Focus NFe, Nuvem Fiscal…), com custo mensal.
19. Importar CPF/CNPJ e endereço dos clientes a partir do sistema da prefeitura (exportação/planilha),
    porque hoje nenhum cliente tem documento cadastrado.
- **Jaguaquara/BA (IBGE 2917607), sistema Saatri.** A nota de exemplo já sai no leiaute nacional 1.01
  (gerada pelo município e compartilhada com o ambiente nacional). Serviço 17.06.01 (cTribNac 170601),
  NBS 114061900, ISS 2%, Simples Nacional.
- A Saatri tem webservice (padrão ABRASF) com autenticação por certificado ou login da prefeitura.
  Opções, em ordem de custo: (a) integração direta com o webservice da Saatri, pedindo documentação e
  autorização ao suporte deles; (b) provedor de API que já integra Jaguaquara (Focus NFe).
- O menu "Exportar NFS-e (Nota Nacional)" do Saatri permite trazer **todas as notas já emitidas**:
  com elas o sistema preenche CPF/CNPJ e endereço dos clientes e liga cada nota ao recebimento.
- Open Finance / Pix automático (banco: Bradesco Empresas): **fora do escopo por enquanto**.

### Opcional depois
- Assistente de IA (Claude) que responde sobre o caixa.
- Importação de planilha CSV/XLSX.

## Andamento
- [x] Fase 1 (parcial): projeto, tema claro/escuro, menu, filtros de conta e período, **Painel completo**, modal de lançamento
- [x] Núcleo de cálculo com testes de paridade: saldos, KPIs, gráfico, DFC e categorias **batem com o original**
- [x] Esquema do banco (`supabase/migrations/0001_init.sql`) e script de importação com conferência de saldos
- [x] Supabase criado, histórico importado com saldos conferidos, login e publicação na Vercel
- [x] Identidade visual da Connect (laranja #E35F20 + logo) no lugar do verde do original
- [x] **Movimentos**: busca (atalho `/`), filtros, ordenação, seleção em massa, editar/baixar/duplicar/excluir com "Desfazer", exportar CSV
- [x] Modal de lançamento: edição, exclusão, máscara de valor, séries recorrentes e parceladas
- [x] Cards clicáveis (Painel e Movimentos) que filtram a tela com animação
- [x] **Relatórios**: demonstrativo (DFC) mês a mês com detalhamento, fluxo mensal (6/12/24m), categorias (despesas/receitas), exportar CSV e PDF
- [x] **Recorrências**, **Contas bancárias** e **Extrato** por conta
- [x] **Clientes e Fornecedores**: KPIs, busca por nome/CPF/CNPJ, cadastro com validação de CPF/CNPJ, consulta na Receita (BrasilAPI), CEP (ViaCEP) com código IBGE para a NFS-e, histórico, arquivar
- [x] **Categorias**: grupos com cor e seção do demonstrativo, valores do período, arrastar para ordenar/mover, excluir movendo os lançamentos
- [x] **Cartões**: limite, fechamento/vencimento, compras parceladas na fatura certa, pagar/reabrir fatura, débito automático (as parcelas são despesas da conta pagadora no vencimento, `origin = card:<id>`)
- [x] **Conciliação**: importa OFX (Bradesco), casa com lançamentos/transferências/faturas, baixa em lote, lança o que falta lembrando a categoria do mesmo histórico, saldo banco × sistema
- [x] **Configurações**: perfil (nome, senha), empresa (CNPJ), aparência, status da NFS-e, backup JSON
- [ ] NFS-e (Saatri) — aguardando manual do webservice e certificado A1
- [ ] Assistente de IA (opcional)
- [ ] Domínio próprio

## Preciso de você antes de começar
1. **Supabase**: criar o projeto (ou me dizer qual usar) e liberar o acesso a ele aqui.
2. **Domínio**: qual endereço (ex.: `financeiro.connectdigital.com.br`).
3. **Quem usa**: só você ou mais pessoas (e com qual permissão).
4. **Fora do escopo agora**: confirmar que NFS-e, Open Finance e Assistente ficam para depois.
