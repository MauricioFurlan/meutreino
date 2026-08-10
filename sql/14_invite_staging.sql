-- =====================================================================
-- 14_invite_staging.sql
-- Permite que o professor crie treinos, anamnese e anotações para
-- alunos ANTES do primeiro login (vinculados ao invite_id).
-- Quando o aluno faz login, o trigger handle_new_user migra os dados.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tornar student_id nullable e adicionar invite_id nas tabelas
-- ---------------------------------------------------------------------

-- workout_plans: student_id nullable + invite_id
alter table public.workout_plans
  alter column student_id drop not null;

alter table public.workout_plans
  add column if not exists invite_id uuid references public.invites(id) on delete cascade;

-- Constraint: pelo menos um dos dois deve estar preenchido
alter table public.workout_plans
  drop constraint if exists chk_plans_student_or_invite;
alter table public.workout_plans
  add constraint chk_plans_student_or_invite
  check (student_id is not null or invite_id is not null);

-- Índice para buscar planos por invite
create index if not exists idx_plans_invite on public.workout_plans (invite_id) where invite_id is not null;

-- assessments: student_id nullable + invite_id
alter table public.assessments
  alter column student_id drop not null;

alter table public.assessments
  add column if not exists invite_id uuid references public.invites(id) on delete cascade;

alter table public.assessments
  drop constraint if exists chk_assessments_student_or_invite;
alter table public.assessments
  add constraint chk_assessments_student_or_invite
  check (student_id is not null or invite_id is not null);

create index if not exists idx_assessments_invite on public.assessments (invite_id) where invite_id is not null;

-- trainer_notes: student_id nullable + invite_id
alter table public.trainer_notes
  alter column student_id drop not null;

alter table public.trainer_notes
  add column if not exists invite_id uuid references public.invites(id) on delete cascade;

alter table public.trainer_notes
  drop constraint if exists chk_notes_student_or_invite;
alter table public.trainer_notes
  add constraint chk_notes_student_or_invite
  check (student_id is not null or invite_id is not null);

-- Ajustar o unique index de trainer_notes para incluir invite_id
-- (era: 1 nota por student_id; agora: 1 nota por student_id OU 1 por invite_id)
drop index if exists uq_trainer_notes_student;
create unique index if not exists uq_trainer_notes_student
  on public.trainer_notes (student_id) where student_id is not null;
create unique index if not exists uq_trainer_notes_invite
  on public.trainer_notes (invite_id) where invite_id is not null;

-- ---------------------------------------------------------------------
-- 2. Helper function: is_my_invite (para RLS)
-- Verifica se o invite pertence ao professor logado
-- ---------------------------------------------------------------------
create or replace function public.is_my_invite(p_invite uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.invites
    where id = p_invite and coach_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Atualizar RLS para incluir acesso via invite_id
-- ---------------------------------------------------------------------

-- workout_plans: adicionar policies para invite
drop policy if exists plans_select on public.workout_plans;
create policy plans_select on public.workout_plans
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_my_student(student_id)
    or public.is_my_invite(invite_id)
    or public.is_owner()
  );

drop policy if exists plans_write on public.workout_plans;
create policy plans_write on public.workout_plans
  for all to authenticated
  using (
    public.is_my_student(student_id)
    or public.is_my_invite(invite_id)
    or public.is_owner()
  )
  with check (
    (public.is_my_student(student_id) and public.i_have_access())
    or (public.is_my_invite(invite_id) and public.i_have_access())
    or public.is_owner()
  );

-- assessments: adicionar policies para invite
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_my_student(student_id)
    or public.is_my_invite(invite_id)
    or public.is_owner()
  );

drop policy if exists assessments_write on public.assessments;
create policy assessments_write on public.assessments
  for all to authenticated
  using (
    public.is_my_student(student_id)
    or public.is_my_invite(invite_id)
    or public.is_owner()
  )
  with check (
    (public.is_my_student(student_id) and public.i_have_access())
    or (public.is_my_invite(invite_id) and public.i_have_access())
    or public.is_owner()
  );

-- trainer_notes: adicionar policies para invite
drop policy if exists "student_read_own_note"  on public.trainer_notes;
drop policy if exists "trainer_read_own_notes" on public.trainer_notes;
drop policy if exists "trainer_insert_note"    on public.trainer_notes;
drop policy if exists "trainer_update_note"    on public.trainer_notes;
drop policy if exists "trainer_delete_note"    on public.trainer_notes;

-- Aluno: lê apenas sua própria nota
create policy "student_read_own_note"
  on public.trainer_notes for select
  using (student_id = auth.uid());

-- Professor: lê notas dos seus alunos E dos invites pendentes
create policy "trainer_read_own_notes"
  on public.trainer_notes for select
  using (coach_id = auth.uid());

-- Professor: insere nota para seus alunos ou invites
create policy "trainer_insert_note"
  on public.trainer_notes for insert
  with check (
    coach_id = auth.uid()
    and public.i_have_access()
  );

-- Professor: atualiza nota dos seus alunos ou invites
create policy "trainer_update_note"
  on public.trainer_notes for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.i_have_access());

-- Professor: deleta nota dos seus alunos ou invites
create policy "trainer_delete_note"
  on public.trainer_notes for delete
  using (coach_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. Atualizar handle_new_user para migrar dados de invite para profile
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  inv public.invites%rowtype;
begin
  select * into inv
  from public.invites
  where lower(email) = lower(new.email) and redeemed = false
  order by created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  -- Criar o profile
  insert into public.profiles (id, role, full_name, email, coach_id, gym_name, sex, birth_date,
                               status, access_starts_at, access_expires_at)
  values (
    new.id,
    inv.role,
    inv.full_name,
    new.email,
    inv.coach_id,
    inv.gym_name,
    inv.sex,
    inv.birth_date,
    'active',
    current_date,
    (current_date + (inv.months || ' months')::interval)::date
  )
  on conflict (id) do nothing;

  -- Migrar dados pré-criados pelo professor: invite_id -> student_id
  update public.workout_plans
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  update public.assessments
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  update public.trainer_notes
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  -- Marcar invite como resgatado
  update public.invites set redeemed = true where id = inv.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Ajustar unique index de workout_plans para invite
-- O índice uq_plan_active_per_student precisa permitir planos ativos por invite
-- ---------------------------------------------------------------------
drop index if exists uq_plan_active_per_student;
-- Apenas 1 plano ativo por student (quando student_id preenchido)
create unique index if not exists uq_plan_active_per_student
  on public.workout_plans (student_id) where (is_active = true and student_id is not null);
-- Apenas 1 plano ativo por invite (quando invite_id preenchido)
create unique index if not exists uq_plan_active_per_invite
  on public.workout_plans (invite_id) where (is_active = true and invite_id is not null);
