-- Histórico de alterações de valor (ex.: mensalidade reajustada só neste mês
-- ou daqui para frente). Rode no SQL Editor do Supabase depois do 0001.

create table if not exists amount_changes (
  id             uuid primary key default gen_random_uuid(),
  movement_id    uuid references movements(id) on delete set null,
  recurrence_id  uuid references recurrences(id) on delete set null,
  contact_id     uuid references contacts(id) on delete set null,
  description    text not null default '',
  old_amount     numeric(14,2) not null,
  new_amount     numeric(14,2) not null,
  -- 'only_this' = só este lançamento; 'this_and_next' = este e os próximos em aberto
  scope          text not null check (scope in ('only_this', 'this_and_next')),
  effective_date date not null,            -- data do lançamento a partir do qual vale
  affected_count int not null default 1,   -- quantos lançamentos mudaram
  created_at     timestamptz not null default now()
);
create index if not exists amount_changes_movement_idx on amount_changes (movement_id);
create index if not exists amount_changes_recurrence_idx on amount_changes (recurrence_id);

alter table amount_changes enable row level security;
drop policy if exists "authenticated full access" on amount_changes;
create policy "authenticated full access" on amount_changes for all to authenticated using (true) with check (true);
