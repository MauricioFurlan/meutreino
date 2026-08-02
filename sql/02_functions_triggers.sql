-- =====================================================================
-- App de Treino — 02_functions_triggers.sql
-- Fase 1: helpers de RLS, trigger de convite, updated_at e get_my_access().
-- Rodar DEPOIS de 01_schema.sql.
-- Todas as funções são SECURITY DEFINER (rodam como dono, ignorando RLS)
-- para evitar recursão infinita nas políticas que consultam profiles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_plans_updated on public.workout_plans;
create trigger trg_plans_updated before update on public.workout_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Helpers de papel/propriedade (SECURITY DEFINER → não disparam RLS)
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- true se o aluno informado pertence ao professor logado
create or replace function public.is_my_student(p_student uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = p_student and coach_id = auth.uid()
  );
$$;

-- true se um professor está com acesso liberado (ativo e dentro do prazo)
create or replace function public.trainer_is_active(p_trainer uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = p_trainer
      and role = 'trainer'
      and status = 'active'
      and (access_expires_at is null or access_expires_at >= current_date)
  );
$$;

-- ---------------------------------------------------------------------
-- get_my_access() — estado de acesso SEGURO do usuário logado.
-- Retorna apenas: 'active' | 'expired' | 'unavailable' | 'suspended'.
-- Os motivos sensíveis (aluno desativado / professor não pagou) COLAPSAM
-- em 'unavailable' → o aluno nunca distingue um do outro.
-- 'suspended' é usado para o próprio professor (mensagem entre ele e o owner).
-- ---------------------------------------------------------------------
create or replace function public.get_my_access()
returns text
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  me public.profiles%rowtype;
begin
  select * into me from public.profiles where id = auth.uid();

  -- sem perfil = sem acesso
  if not found then
    return 'unavailable';
  end if;

  -- OWNER: sempre ativo
  if me.role = 'owner' then
    return 'active';
  end if;

  -- TRAINER: vê a própria situação (mensagem própria de suspensão)
  if me.role = 'trainer' then
    if me.status <> 'active'
       or (me.access_expires_at is not null and me.access_expires_at < current_date) then
      return 'suspended';
    end if;
    return 'active';
  end if;

  -- STUDENT:
  -- 1) problema no professor (suspenso/vencido/inexistente) => genérico, esconde motivo
  if me.coach_id is null or not public.trainer_is_active(me.coach_id) then
    return 'unavailable';
  end if;
  -- 2) aluno desativado manualmente => genérico (indistinguível de 1)
  if me.status <> 'active' then
    return 'unavailable';
  end if;
  -- 3) período do aluno terminou => mensagem verdadeira e neutra
  if me.access_expires_at is not null and me.access_expires_at < current_date then
    return 'expired';
  end if;

  return 'active';
end;
$$;

-- ---------------------------------------------------------------------
-- handle_new_user — no 1º login (OTP cria auth.users), materializa o profile
-- a partir de um convite pendente. Sem convite => não cria profile
-- (o owner é criado manualmente via 04_seed_owner.sql).
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
    return new; -- sem convite: nenhum acesso até o owner/professor provisionar
  end if;

  insert into public.profiles (id, role, full_name, email, coach_id, gym_name, status,
                               access_starts_at, access_expires_at)
  values (
    new.id,
    inv.role,
    inv.full_name,
    new.email,
    inv.coach_id,
    inv.gym_name,
    'active',
    current_date,
    (current_date + (inv.months || ' months')::interval)::date
  )
  on conflict (id) do nothing;

  update public.invites set redeemed = true where id = inv.id;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Permitir que usuários autenticados chamem get_my_access()
grant execute on function public.get_my_access() to authenticated;
