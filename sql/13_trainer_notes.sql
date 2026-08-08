-- =====================================================================
-- 13_trainer_notes.sql
-- Anotações do professor por aluno (dieta, orientações, observações).
-- Uma linha por aluno — o professor sobrescreve o conteúdo quando quiser.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

create table if not exists public.trainer_notes (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  content     text not null default '',   -- texto livre (pode conter markdown leve)
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.trainer_notes is
  'Anotações livres do professor por aluno (dieta, orientações). Uma linha por aluno.';
comment on column public.trainer_notes.content is
  'Conteúdo em texto livre. O front renderiza seções separadas por linha em branco.';

-- Garante exatamente 1 registro por aluno.
create unique index if not exists uq_trainer_notes_student
  on public.trainer_notes (student_id);

create index if not exists idx_trainer_notes_coach
  on public.trainer_notes (coach_id);

-- =====================================================================
-- RLS — aluno lê só a própria nota · professor lê/escreve só seus alunos
-- =====================================================================
alter table public.trainer_notes enable row level security;

-- Recria as policies de forma idempotente (DROP + CREATE)
drop policy if exists "student_read_own_note"  on public.trainer_notes;
drop policy if exists "trainer_read_own_notes" on public.trainer_notes;
drop policy if exists "trainer_insert_note"    on public.trainer_notes;
drop policy if exists "trainer_update_note"    on public.trainer_notes;
drop policy if exists "trainer_delete_note"    on public.trainer_notes;

-- Aluno: lê apenas sua própria nota
create policy "student_read_own_note"
  on public.trainer_notes for select
  using (student_id = auth.uid());

-- Professor: lê notas dos seus alunos
create policy "trainer_read_own_notes"
  on public.trainer_notes for select
  using (coach_id = auth.uid());

-- Professor: insere nota para seus alunos
create policy "trainer_insert_note"
  on public.trainer_notes for insert
  with check (coach_id = auth.uid());

-- Professor: atualiza nota dos seus alunos
create policy "trainer_update_note"
  on public.trainer_notes for update
  using (coach_id = auth.uid());

-- Professor: deleta nota dos seus alunos
create policy "trainer_delete_note"
  on public.trainer_notes for delete
  using (coach_id = auth.uid());

-- Trigger para manter updated_at em dia
create or replace function public.set_trainer_notes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trainer_notes_updated_at on public.trainer_notes;
create trigger trg_trainer_notes_updated_at
  before update on public.trainer_notes
  for each row execute procedure public.set_trainer_notes_updated_at();
