-- =====================================================================
-- App de Treino — 01_schema.sql
-- Fase 1: schema base (tabelas + índices)
-- Rodar PRIMEIRO, no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles — espelha auth.users. 1 linha por usuário.
-- role define o papel; status/access_* controlam o acesso.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              text not null check (role in ('owner','trainer','student')),
  full_name         text,
  email             text,
  coach_id          uuid references public.profiles(id) on delete set null, -- só para aluno
  gym_name          text,   -- (aluno) academia onde treina, informado pelo professor
  status            text not null default 'active' check (status in ('active','suspended')),
  access_starts_at  date,   -- aluno E professor
  access_expires_at date,   -- bloqueio automático após esta data (aluno E professor)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Perfis de usuário (owner/trainer/student) espelhando auth.users';
comment on column public.profiles.coach_id is 'Para aluno: qual professor é dono. Sempre 1 professor por aluno.';
comment on column public.profiles.access_expires_at is 'Aluno: fim do acompanhamento. Professor: fim da mensalidade paga ao owner.';

create index if not exists idx_profiles_coach   on public.profiles (coach_id, status);
create index if not exists idx_profiles_role     on public.profiles (role);
create index if not exists idx_profiles_expires  on public.profiles (access_expires_at);

-- ---------------------------------------------------------------------
-- invites — vínculo pré-login. Professor convida aluno; owner convida professor.
-- No 1º login por OTP, um trigger cria o profile a partir do convite.
-- ---------------------------------------------------------------------
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null check (role in ('trainer','student')),
  coach_id    uuid references public.profiles(id) on delete cascade, -- professor dono (para aluno)
  full_name   text,
  gym_name    text,   -- academia onde o aluno treina (informado pelo professor)
  months      int  not null default 1 check (months > 0), -- duração para calcular access_expires_at
  created_by  uuid references public.profiles(id) on delete set null,
  redeemed    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.invites is 'Convites que ligam um e-mail a um papel/professor antes do 1º login.';

-- Um único convite pendente por e-mail (evita duplicidade). Case-insensitive.
create unique index if not exists uq_invites_email_pending
  on public.invites (lower(email)) where (redeemed = false);
create index if not exists idx_invites_coach on public.invites (coach_id);

-- ---------------------------------------------------------------------
-- workout_plans — treino prescrito (JSONB). 1 ativo por aluno.
-- structure: { "Segunda": [ {name, video_url, note, sets:[{type,reps,note}]}, ... ], ... }
-- ---------------------------------------------------------------------
create table if not exists public.workout_plans (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid references public.profiles(id) on delete set null,
  title       text not null default 'Treino',
  structure   jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.workout_plans is 'Treino prescrito por aluno, armazenado em JSONB (render/edição em 1 leitura).';

-- Garante no máximo 1 plano ativo por aluno.
create unique index if not exists uq_plan_active_per_student
  on public.workout_plans (student_id) where (is_active = true);
create index if not exists idx_plans_student on public.workout_plans (student_id, is_active);

-- ---------------------------------------------------------------------
-- workout_logs — execução real (relacional/indexado, alimenta gráficos).
-- exercise_name é DENORMALIZADO de propósito: histórico não quebra se o plano mudar.
-- ---------------------------------------------------------------------
create table if not exists public.workout_logs (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  session_date   date not null,
  weekday        text,
  exercise_name  text not null,
  set_type       text check (set_type in ('aquec','feeder','hard')),
  set_number     int  not null,
  weight         numeric,
  reps           int,
  notes          text,
  created_at     timestamptz not null default now()
);

comment on table public.workout_logs is 'Registros de execução do aluno (histórico estável, denormalizado).';

create index if not exists idx_logs_student_date on public.workout_logs (student_id, session_date desc);
create index if not exists idx_logs_student_ex   on public.workout_logs (student_id, exercise_name, created_at desc);

-- ---------------------------------------------------------------------
-- assessments — anamnese / avaliação física (JSONB flexível).
-- data: { peso, altura, circunferencias:{...}, dobras:{...}, composicao:{...}, saude:{...}, obs }
-- (fotos entram no futuro como URLs dentro de data — schema já preparado)
-- ---------------------------------------------------------------------
create table if not exists public.assessments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles(id) on delete cascade,
  coach_id         uuid references public.profiles(id) on delete set null,
  assessment_date  date not null default current_date,
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

comment on table public.assessments is 'Avaliações físicas por aluno; cada linha é um ponto no tempo para gráficos de evolução.';

create index if not exists idx_assessments_student on public.assessments (student_id, assessment_date desc);

-- ---------------------------------------------------------------------
-- trainer_payments — ledger de mensalidades dos professores (só o owner acessa).
-- Cada pagamento estende o access_expires_at do professor.
-- ---------------------------------------------------------------------
create table if not exists public.trainer_payments (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references public.profiles(id) on delete cascade,
  amount        numeric,
  paid_at       date not null default current_date,
  period_start  date,
  period_end    date,   -- nova data de expiração do professor
  method        text,   -- 'pix' | 'dinheiro' | ...
  note          text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.trainer_payments is 'Histórico de mensalidades pagas pelos professores ao owner.';

create index if not exists idx_payments_trainer on public.trainer_payments (trainer_id, paid_at desc);
