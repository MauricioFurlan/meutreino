-- =====================================================================
-- 15_my_coach_name.sql
-- Nome do professor do aluno logado, para assinar o PDF da avaliação física
-- que o aluno exporta em anamnese.html (modo somente-leitura).
--
-- Por que uma função e não uma política em profiles:
-- RLS é por LINHA, não por coluna. Liberar a linha do professor para o aluno
-- exporia também email, status e access_expires_at do professor. Aqui sai
-- exatamente um texto: o nome.
--
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

create or replace function public.my_coach_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.full_name
  from public.profiles me
  join public.profiles c on c.id = me.coach_id
  where me.id = auth.uid();
$$;

comment on function public.my_coach_name() is
  'Nome do professor do usuário logado. Usado na assinatura do PDF da avaliação exportada pelo aluno.';

-- Só usuário autenticado (anon não acessa nada no app).
revoke all on function public.my_coach_name() from public;
grant execute on function public.my_coach_name() to authenticated;
