-- =====================================================================
-- 09_workout_sessions.sql
-- Registra sessões de treino (início/fim) com duração.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

create table if not exists public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  weekday          text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int,  -- calculado ao encerrar (ended_at - started_at)
  created_at       timestamptz not null default now()
);

comment on table public.workout_sessions is 'Sessões de treino do aluno com horário de início/fim e duração.';

create index if not exists idx_sessions_student_date
  on public.workout_sessions (student_id, started_at desc);

-- RLS: aluno só vê/insere as próprias sessões; professor vê as dos seus alunos
alter table public.workout_sessions enable row level security;

-- Aluno: CRUD próprias sessões
drop policy if exists "students_own_sessions" on public.workout_sessions;
create policy "students_own_sessions"
  on public.workout_sessions
  for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Professor: leitura das sessões dos seus alunos
drop policy if exists "trainer_read_sessions" on public.workout_sessions;
create policy "trainer_read_sessions"
  on public.workout_sessions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = workout_sessions.student_id
        and p.coach_id = auth.uid()
    )
  );
