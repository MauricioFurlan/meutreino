-- Notificações push (Web Push) para o aluno.
--
-- push_subscriptions: um endereço de push por APARELHO. O mesmo aluno pode ter
--   o celular e o tablet inscritos; cada um recebe a notificação.
-- notification_prefs: o que o aluno quer receber e em que horário. É por ALUNO
--   (não por aparelho): trocar de celular não deveria zerar o horário escolhido.
--   last_*_on marcam o dia em que cada tipo já foi tratado — é o que impede o
--   cron (a cada 15 min) de mandar o mesmo lembrete de novo.
--
-- Quem envia é a Edge Function send-push (service role, ignora o RLS).
-- O agendamento fica em 37_push_cron.sql.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.notification_prefs (
  student_id       uuid primary key references public.profiles(id) on delete cascade,
  reminder_on      boolean not null default true,
  reminder_time    time    not null default '07:00',
  risk_on          boolean not null default true,
  last_reminder_on date,
  last_risk_on     date,
  updated_at       timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

drop policy if exists notif_prefs_own on public.notification_prefs;
create policy notif_prefs_own on public.notification_prefs
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Agendamento (pg_cron) e chamada HTTP de dentro do banco (pg_net).
create extension if not exists pg_cron;
create extension if not exists pg_net;
