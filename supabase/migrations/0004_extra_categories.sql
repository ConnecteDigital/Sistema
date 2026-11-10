-- Categorias adicionais de um lançamento (ex.: primeira mensalidade = Mensalidade + Freelancer).
-- category_id continua sendo a principal: os totais por categoria contam o valor só nela;
-- as adicionais servem para classificar, filtrar e buscar. Rode no SQL Editor do Supabase.
alter table movements add column if not exists extra_category_ids uuid[];
