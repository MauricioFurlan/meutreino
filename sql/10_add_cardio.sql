-- =====================================================================
-- 10_add_cardio.sql
-- Cardio como tipo de set + minutos executados em coluna própria.
--
-- Por que coluna nova e não reaproveitar reps/weight:
--   cardio é TEMPO, não repetição. Guardar minutos em `reps` contaminaria
--   volume (weight × reps), média de reps e todo cálculo de força.
--   Com coluna separada, somar cardio do dia/semana/mês é um SUM direto e
--   as métricas de musculação continuam intactas.
--
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- 1) Minutos de cardio executados pelo aluno
alter table public.workout_logs
  add column if not exists duration_minutes int;

comment on column public.workout_logs.duration_minutes is
  'Minutos executados em sets de cardio (set_type = ''cardio''). Null nos sets de musculação.';

-- Sanidade: 0 não é registro e 600min (10h) já é erro de digitação.
alter table public.workout_logs
  drop constraint if exists workout_logs_duration_minutes_check;
alter table public.workout_logs
  add constraint workout_logs_duration_minutes_check
  check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 600));

-- 2) set_type: liberar 'cardio'
--
-- O check original era `set_type in ('aquec','feeder','hard')`, mas o editor
-- transformou o tipo em CAMPO LIVRE com chips de sugestão (commit
-- "tipo de set como campo livre com chips"). Ou seja: qualquer tipo digitado
-- pelo professor fora dessa lista fazia o INSERT do aluno estourar 23514 na
-- hora de salvar o treino. Trocamos por um limite de tamanho, que acompanha
-- a UI real e ainda barra lixo.
alter table public.workout_logs
  drop constraint if exists workout_logs_set_type_check;
alter table public.workout_logs
  add constraint workout_logs_set_type_check
  check (set_type is null or char_length(btrim(set_type)) between 1 and 24);

-- 3) Índice parcial: as telas de cardio leem só as linhas com minutos.
create index if not exists idx_logs_student_cardio
  on public.workout_logs (student_id, session_date desc)
  where duration_minutes is not null;

-- =====================================================================
-- Verificações rápidas
-- =====================================================================
-- select column_name, data_type from information_schema.columns
--   where table_name = 'workout_logs' and column_name = 'duration_minutes';
--
-- select session_date, sum(duration_minutes) as min_cardio
--   from public.workout_logs
--  where set_type = 'cardio' and duration_minutes is not null
--  group by session_date order by session_date desc limit 10;
