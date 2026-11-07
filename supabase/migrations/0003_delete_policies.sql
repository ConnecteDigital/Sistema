-- Permite excluir de verdade (cadastros duplicados/de teste, lançamentos, séries).
-- Sem uma regra de exclusão, o Supabase não dá erro: só ignora o pedido e o registro
-- volta a aparecer no próximo carregamento. Rode no SQL Editor do Supabase.

do $$
declare t text;
begin
  foreach t in array array['contacts','movements','recurrences','transfers','attachments','reconciliations']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authenticated delete" on %I', t);
    execute format('create policy "authenticated delete" on %I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- Conferência: deve listar uma regra de DELETE (ou ALL) para cada tabela acima.
select tablename, policyname, cmd from pg_policies
where tablename in ('contacts','movements','recurrences','transfers','attachments','reconciliations')
order by tablename, cmd;
