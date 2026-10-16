-- Connect Financeiro — esquema inicial
-- Sistema interno de usuário único: qualquer usuário autenticado acessa tudo.
-- O cadastro público fica desligado no painel do Supabase (Auth → Sign In / Providers).

create extension if not exists "pgcrypto";

create type movement_type as enum ('inflow', 'outflow');
create type recurrence_period as enum ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual');
create type dfc_section as enum (
  'operating_revenue',  -- Receitas da operação
  'variable_costs',     -- Custos que variam com a venda
  'fixed_expenses',     -- Despesas fixas do mês
  'financial_other',    -- Juros, tarifas e outras
  'investments',        -- Investimentos e bens
  'partners_loans'      -- Sócios e empréstimos
);

create table company (
  id         smallint primary key default 1 check (id = 1),
  name       text not null,
  tax_id     text,
  created_at timestamptz not null default now()
);

create table bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  bank            text,
  branch          text,
  account_number  text,
  initial_balance numeric(14,2) not null default 0,
  color           text,
  active          boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);

create table credit_cards (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  brand            text,
  credit_limit     numeric(14,2) not null default 0,
  closing_day      smallint not null check (closing_day between 1 and 28),
  due_day          smallint not null check (due_day between 1 and 28),
  payer_account_id uuid references bank_accounts(id) on delete set null,
  auto_debit       boolean not null default false,
  created_at       timestamptz not null default now()
);

create table category_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       movement_type not null,
  section    dfc_section not null,
  color      text not null default 'gray',
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references category_groups(id) on delete restrict,
  name       text not null,
  icon       text,
  position   int not null default 0,
  created_at timestamptz not null default now()
);

create table contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_customer boolean not null default true,
  is_supplier boolean not null default false,
  person_type text not null default 'natural' check (person_type in ('natural', 'legal')),
  foreign_    boolean not null default false,
  tax_id      text,
  email       text,
  phone       text,
  address     jsonb not null default '{}'::jsonb,
  notes       text,
  deleted     boolean not null default false,
  legacy_key  text unique, -- chave do export do FCS V1 (para reimportação idempotente)
  created_at  timestamptz not null default now()
);

create table recurrences (
  id                 uuid primary key default gen_random_uuid(),
  type               movement_type not null,
  start_date         date not null,
  amount             numeric(14,2) not null,
  period             recurrence_period not null,
  quantity           int,             -- null = sem fim
  fixed              boolean not null default true,
  active             boolean not null default true,
  next_date          date,
  bank_account_id    uuid references bank_accounts(id) on delete set null,
  category_id        uuid references categories(id) on delete set null,
  contact_id         uuid references contacts(id) on delete set null,
  description        text not null default '',
  document_number    text,
  notes              text,
  legacy_ref         text unique,
  created_at         timestamptz not null default now()
);

create table movements (
  id                 uuid primary key default gen_random_uuid(),
  type               movement_type not null,
  date               date not null,           -- data do lançamento (regime de caixa)
  competence_date    date,                    -- regime de competência
  due_date           date,
  amount             numeric(14,2) not null check (amount >= 0),
  description        text not null default '',
  bank_account_id    uuid not null references bank_accounts(id) on delete restrict,
  category_id        uuid references categories(id) on delete set null,
  contact_id         uuid references contacts(id) on delete set null,
  recurrence_id      uuid references recurrences(id) on delete set null,
  paid               boolean not null default false,
  installment        int not null default 0,
  total_installments int not null default 0,
  document_number    text,
  notes              text,
  fees               jsonb not null default '[]'::jsonb, -- juros e taxas: [{amount, category_id}]
  origin             text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index movements_date_idx on movements (date);
create index movements_account_idx on movements (bank_account_id);
create index movements_recurrence_idx on movements (recurrence_id);

create table transfers (
  id                     uuid primary key default gen_random_uuid(),
  date                   date not null,
  amount                 numeric(14,2) not null check (amount > 0),
  description            text not null default 'Transferência',
  source_account_id      uuid not null references bank_accounts(id) on delete restrict,
  destination_account_id uuid not null references bank_accounts(id) on delete restrict,
  created_at             timestamptz not null default now(),
  check (source_account_id <> destination_account_id)
);
create index transfers_date_idx on transfers (date);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  movement_id  uuid not null references movements(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create table reconciliations (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id) on delete cascade,
  name            text,
  period_start    date,
  period_end      date,
  closing_balance numeric(14,2),
  storage_path    text,
  created_at      timestamptz not null default now()
);

create table import_batches (
  id         uuid primary key default gen_random_uuid(),
  source     text not null,
  summary    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- updated_at automático
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger movements_touch before update on movements
  for each row execute function touch_updated_at();

-- Saldo atual por conta: saldo inicial + lançamentos pagos ± transferências
create view account_balances with (security_invoker = true) as
select
  a.id,
  a.name,
  a.initial_balance
    + coalesce((select sum(case when m.type = 'inflow' then m.amount else -m.amount end)
                from movements m where m.bank_account_id = a.id and m.paid), 0)
    + coalesce((select sum(t.amount) from transfers t where t.destination_account_id = a.id), 0)
    - coalesce((select sum(t.amount) from transfers t where t.source_account_id = a.id), 0)
    as balance
from bank_accounts a;

-- RLS: só usuários autenticados
do $$
declare t text;
begin
  foreach t in array array['company','bank_accounts','credit_cards','category_groups','categories',
                           'contacts','recurrences','movements','transfers','attachments',
                           'reconciliations','import_batches']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Bucket privado para anexos dos lançamentos
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;
create policy "authenticated attachments" on storage.objects for all to authenticated
  using (bucket_id = 'attachments') with check (bucket_id = 'attachments');
