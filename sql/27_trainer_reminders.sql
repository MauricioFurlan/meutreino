-- =====================================================================
-- 27_trainer_reminders.sql
-- Substitui o lembrete único de trainer_notes (alert_date/alert_message)
-- por uma tabela própria: agora o professor cadastra VÁRIOS lembretes
-- por aluno (ex: "renovar dieta", "atendimento presencial"). Cada um
-- aparece no painel do professor 5 dias antes da data escolhida, até o
-- dia do vencimento, e só some quando o professor remove o lembrete
-- (não mais quando salva a anotação).
-- Rodar no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

create table if not exists public.trainer_reminders (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references public.profiles(id) on delete cascade,
  invite_id   uuid references public.invites(id) on delete cascade,
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  message     text,
  alert_date  date not null,
  created_at  timestamptz not null default now()
);

alter table public.trainer_reminders
  drop constraint if exists chk_reminders_student_or_invite;
alter table public.trainer_reminders
  add constraint chk_reminders_student_or_invite
  check (student_id is not null or invite_id is not null);

comment on table public.trainer_reminders is
  'Lembretes do professor por aluno (ex: renovar dieta). Vários por aluno, cada um com sua data.';
comment on column public.trainer_reminders.message is
  'Texto curto opcional exibido junto do alerta (ex: "Renovar protocolo").';
comment on column public.trainer_reminders.alert_date is
  'Data do lembrete — alerta aparece no painel do professor 5 dias antes, até essa data.';

create index if not exists idx_reminders_student on public.trainer_reminders (student_id) where student_id is not null;
create index if not exists idx_reminders_invite  on public.trainer_reminders (invite_id) where invite_id is not null;
create index if not exists idx_reminders_coach   on public.trainer_reminders (coach_id);

-- =====================================================================
-- RLS — aluno lê os próprios lembretes · professor lê/escreve os seus
-- =====================================================================
alter table public.trainer_reminders enable row level security;

drop policy if exists "student_read_own_reminders" on public.trainer_reminders;
drop policy if exists "trainer_read_own_reminders"  on public.trainer_reminders;
drop policy if exists "trainer_insert_reminder"     on public.trainer_reminders;
drop policy if exists "trainer_update_reminder"     on public.trainer_reminders;
drop policy if exists "trainer_delete_reminder"     on public.trainer_reminders;

create policy "student_read_own_reminders"
  on public.trainer_reminders for select
  using (student_id = auth.uid());

create policy "trainer_read_own_reminders"
  on public.trainer_reminders for select
  using (coach_id = auth.uid());

create policy "trainer_insert_reminder"
  on public.trainer_reminders for insert
  with check (coach_id = auth.uid() and public.i_have_access());

create policy "trainer_update_reminder"
  on public.trainer_reminders for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and public.i_have_access());

create policy "trainer_delete_reminder"
  on public.trainer_reminders for delete
  using (coach_id = auth.uid());

-- =====================================================================
-- Migra os lembretes únicos já cadastrados em trainer_notes
-- =====================================================================
insert into public.trainer_reminders (student_id, invite_id, coach_id, message, alert_date)
select student_id, invite_id, coach_id, alert_message, alert_date
from public.trainer_notes
where alert_date is not null;

-- Colunas antigas não são mais usadas pelo app — o lembrete agora vive em trainer_reminders
alter table public.trainer_notes drop column if exists alert_date;
alter table public.trainer_notes drop column if exists alert_message;

-- =====================================================================
-- handle_new_user: migrar também trainer_reminders quando o convite vira conta
-- =====================================================================
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

  update public.workout_plans
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  update public.assessments
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  update public.trainer_notes
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  update public.trainer_reminders
    set student_id = new.id, invite_id = null
    where invite_id = inv.id;

  update public.invites set redeemed = true where id = inv.id;

  return new;
end;
$$;
