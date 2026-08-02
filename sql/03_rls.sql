-- =====================================================================
-- App de Treino — 03_rls.sql
-- Fase 1: Row Level Security (isolamento por tenant + gating de acesso).
-- Rodar DEPOIS de 02_functions_triggers.sql.
-- Regra de ouro: a segurança vive AQUI (no banco), não no front.
-- Todas as políticas alvejam o papel `authenticated` (anon não acessa nada).
-- =====================================================================

-- helper de gating: só quem está com acesso liberado pode ESCREVER
create or replace function public.i_have_access()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.get_my_access() = 'active';
$$;

-- ---------------------------------------------------------------------
-- Habilitar RLS
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.invites          enable row level security;
alter table public.workout_plans    enable row level security;
alter table public.workout_logs     enable row level security;
alter table public.assessments      enable row level security;
alter table public.trainer_payments enable row level security;

-- =====================================================================
-- profiles
-- =====================================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()            -- o próprio
    or coach_id = auth.uid()   -- professor vê seus alunos
    or public.is_owner()       -- owner vê todos
  );

-- owner cria/edita/remove qualquer perfil; professor edita seus alunos; usuário edita a si
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ( public.is_owner() );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ( id = auth.uid() or coach_id = auth.uid() or public.is_owner() )
  with check ( id = auth.uid() or coach_id = auth.uid() or public.is_owner() );

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using ( public.is_owner() );

-- =====================================================================
-- invites
-- =====================================================================
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated
  using ( public.is_owner() or created_by = auth.uid() or coach_id = auth.uid() );

-- professor convida aluno (role student, para si); owner convida professor (role trainer)
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    ( public.is_owner() and role = 'trainer' )
    or ( public.my_role() = 'trainer' and role = 'student' and coach_id = auth.uid() and public.i_have_access() )
  );

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update to authenticated
  using ( public.is_owner() or coach_id = auth.uid() )
  with check ( public.is_owner() or coach_id = auth.uid() );

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete to authenticated
  using ( public.is_owner() or coach_id = auth.uid() );

-- =====================================================================
-- workout_plans  (aluno lê; professor/owner escrevem)
-- =====================================================================
drop policy if exists plans_select on public.workout_plans;
create policy plans_select on public.workout_plans
  for select to authenticated
  using ( student_id = auth.uid() or public.is_my_student(student_id) or public.is_owner() );

drop policy if exists plans_write on public.workout_plans;
create policy plans_write on public.workout_plans
  for all to authenticated
  using ( public.is_my_student(student_id) or public.is_owner() )
  with check ( (public.is_my_student(student_id) and public.i_have_access()) or public.is_owner() );

-- =====================================================================
-- workout_logs  (aluno escreve os próprios; professor/owner só leem)
-- =====================================================================
drop policy if exists logs_select on public.workout_logs;
create policy logs_select on public.workout_logs
  for select to authenticated
  using ( student_id = auth.uid() or public.is_my_student(student_id) or public.is_owner() );

drop policy if exists logs_insert on public.workout_logs;
create policy logs_insert on public.workout_logs
  for insert to authenticated
  with check ( student_id = auth.uid() and public.i_have_access() );

drop policy if exists logs_update on public.workout_logs;
create policy logs_update on public.workout_logs
  for update to authenticated
  using ( student_id = auth.uid() )
  with check ( student_id = auth.uid() and public.i_have_access() );

drop policy if exists logs_delete on public.workout_logs;
create policy logs_delete on public.workout_logs
  for delete to authenticated
  using ( student_id = auth.uid() );

-- =====================================================================
-- assessments  (aluno lê; professor/owner escrevem)
-- =====================================================================
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments
  for select to authenticated
  using ( student_id = auth.uid() or public.is_my_student(student_id) or public.is_owner() );

drop policy if exists assessments_write on public.assessments;
create policy assessments_write on public.assessments
  for all to authenticated
  using ( public.is_my_student(student_id) or public.is_owner() )
  with check ( (public.is_my_student(student_id) and public.i_have_access()) or public.is_owner() );

-- =====================================================================
-- trainer_payments  (somente owner)
-- =====================================================================
drop policy if exists payments_all on public.trainer_payments;
create policy payments_all on public.trainer_payments
  for all to authenticated
  using ( public.is_owner() )
  with check ( public.is_owner() );
