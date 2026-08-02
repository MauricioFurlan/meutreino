-- =====================================================================
-- App de Treino — 06_add_sex_birthdate.sql
-- Adiciona sexo e data de nascimento em profiles e invites.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- =====================================================================

-- profiles: sexo e data de nascimento do aluno
alter table public.profiles add column if not exists sex text check (sex in ('M','F'));
alter table public.profiles add column if not exists birth_date date;

comment on column public.profiles.sex is 'Sexo: M (masculino) ou F (feminino)';
comment on column public.profiles.birth_date is 'Data de nascimento do aluno';

-- invites: para que o trigger de provisionamento copie para o profile
alter table public.invites add column if not exists sex text check (sex in ('M','F'));
alter table public.invites add column if not exists birth_date date;

-- Atualizar o trigger handle_new_user para copiar os novos campos
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

  update public.invites set redeemed = true where id = inv.id;

  return new;
end;
$$;
