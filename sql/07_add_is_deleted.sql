-- =====================================================================
-- App de Treino — 07_add_is_deleted.sql
-- Adiciona campo is_deleted em profiles para soft delete de alunos.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- =====================================================================

alter table public.profiles add column if not exists is_deleted boolean not null default false;

comment on column public.profiles.is_deleted is 'Soft delete: aluno excluído pelo professor. Front ignora registros com is_deleted=true.';

create index if not exists idx_profiles_deleted on public.profiles (is_deleted) where (is_deleted = false);
