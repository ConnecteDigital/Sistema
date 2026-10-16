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

### Fase 6: Nota fiscal automática e banco conectado
17. **NFS-e automática**: ao marcar uma entrada como recebida, o sistema emite a nota pelo padrão nacional
    (via provedor de API, ex.: Nuvem Fiscal / Focus NFe / NFE.io), anexa PDF e XML ao lançamento e pode
    enviar por e-mail ao cliente. Pré-requisitos: certificado digital A1, inscrição municipal, e
    **CPF/CNPJ + endereço de cada cliente** (hoje 0 de 131 têm CPF/CNPJ cadastrado).
18. **Pix detectado automaticamente**: webhook da API Pix do banco PJ (tempo real) ou agregador Open Finance
    (Pluggy/Belvo, com atraso). O Pix que cai é casado com a conta a receber (valor + pagador, ou `txid`
    da cobrança Pix gerada pelo sistema), é baixado sozinho e dispara a nota.

### Opcional depois
- Assistente de IA (Claude) que responde sobre o caixa.
- Importação de planilha CSV/XLSX.

## Andamento
- [x] Fase 1 (parcial): projeto, tema claro/escuro, menu, filtros de conta e período, **Painel completo**, modal de lançamento
- [x] Núcleo de cálculo com testes de paridade: saldos, KPIs, gráfico, DFC e categorias **batem com o original**
- [x] Esquema do banco (`supabase/migrations/0001_init.sql`) e script de importação com conferência de saldos
- [ ] Supabase criado + login + importação real

## Preciso de você antes de começar
1. **Supabase**: criar o projeto (ou me dizer qual usar) e liberar o acesso a ele aqui.
2. **Domínio**: qual endereço (ex.: `financeiro.connectdigital.com.br`).
3. **Quem usa**: só você ou mais pessoas (e com qual permissão).
4. **Fora do escopo agora**: confirmar que NFS-e, Open Finance e Assistente ficam para depois.
