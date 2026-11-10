-- Um lançamento dividido em mais de uma categoria (ex.: R$ 2.500 = Criação de site R$ 1.500
-- + Mensalidade R$ 1.000). category_id continua com a categoria principal (a de maior valor).
-- Rode no SQL Editor do Supabase.
alter table movements add column if not exists category_splits jsonb; -- [{"category_id": uuid, "amount": number}]
