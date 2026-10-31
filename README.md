# Connect Financeiro

Sistema interno de fluxo de caixa da Connect Digital (Next.js + Supabase + Vercel).
Documentação: [`docs/01-ANALISE.md`](docs/01-ANALISE.md) (sistema de referência) e [`docs/02-PLANO.md`](docs/02-PLANO.md) (plano e andamento).

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev
```

Sem Supabase, dá para ver as telas com os dados do export do FCS V1:
`LOCAL_LEGACY_EXPORT=/caminho/dados.json npm run dev` (só em desenvolvimento; o arquivo nunca entra no repositório).

## Banco de dados

1. Rode `supabase/migrations/0001_init.sql` e depois `0002_amount_changes.sql` (histórico de alterações de valor) no SQL Editor do Supabase.
2. Desligue o cadastro público (Authentication → Sign In / Providers) e crie o usuário do financeiro.
3. Importe o histórico: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import:legacy -- dados.json`
   (o script confere os saldos de cada conta e falha se não baterem).

## Testes

`LEGACY_EXPORT=/caminho/dados.json npm test` compara os cálculos com os valores do sistema original.
