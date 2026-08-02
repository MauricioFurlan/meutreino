-- =====================================================================
-- App de Treino — 04_seed_owner.sql
-- Define VOCÊ como owner (dono do negócio).
-- Rodar DEPOIS de 01..03 e DEPOIS de você ter feito o 1º login por OTP
-- (o login cria a linha em auth.users; aqui promovemos ela a owner).
-- =====================================================================

-- >>> AJUSTE AQUI: seu e-mail de dono <<<
insert into public.profiles (id, role, full_name, email, status)
select u.id, 'owner', 'Mauricio Furlan', u.email, 'active'
from auth.users u
where lower(u.email) = lower('mauriciotfurlan@gmail.com')
on conflict (id) do update
  set role = 'owner', status = 'active';

-- Confere
select id, role, full_name, email, status from public.profiles where role = 'owner';
