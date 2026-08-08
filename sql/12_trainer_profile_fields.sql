-- =====================================================================
-- 12_trainer_profile_fields.sql
-- Adiciona campos de perfil profissional ao professor na tabela profiles.
-- Todos opcionais — sem validações de formato nem NOT NULL.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- CREF (ex: '012345-G/SP')
alter table public.profiles
  add column if not exists cref text;

-- Telefone / WhatsApp
alter table public.profiles
  add column if not exists phone text;

-- CPF (só dígitos, sem formatação, validar no front se quiser)
alter table public.profiles
  add column if not exists cpf text;

-- URL da foto de perfil (Supabase Storage ou externa)
alter table public.profiles
  add column if not exists avatar_url text;

-- Plano contratado pelo professor no SaaS
alter table public.profiles
  add column if not exists plan_tier text not null default 'free'
    check (plan_tier in ('free', 'basic', 'pro'));

-- Limite de alunos ativos para o professor (substituí max_students se existir)
-- Se a coluna max_students já existe, mantém ela e apenas adiciona student_limit.
-- Rode a linha abaixo apenas se NÃO tiver max_students ainda:
alter table public.profiles
  add column if not exists student_limit int not null default 10;

-- Bio / apresentação curta do professor
alter table public.profiles
  add column if not exists bio text;

-- Especialidades (array de texto: ['musculação','corrida','crossfit'])
alter table public.profiles
  add column if not exists specialties text[] not null default '{}';

comment on column public.profiles.cref          is 'Registro no CREF (ex: 012345-G/SP). Apenas professores.';
comment on column public.profiles.phone         is 'Telefone / WhatsApp do professor.';
comment on column public.profiles.cpf           is 'CPF do professor (só dígitos). Usado para NF / contrato.';
comment on column public.profiles.avatar_url    is 'URL da foto de perfil (Storage ou CDN externo).';
comment on column public.profiles.plan_tier     is 'Plano SaaS do professor: free | basic | pro.';
comment on column public.profiles.student_limit is 'Máximo de alunos ativos permitidos pelo plano.';
comment on column public.profiles.bio           is 'Bio curta exibida para os alunos.';
comment on column public.profiles.specialties   is 'Array de especialidades do professor.';
