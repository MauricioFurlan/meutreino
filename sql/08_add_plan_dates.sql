-- =====================================================================
-- 08_add_plan_dates.sql
-- Adiciona colunas plan_start_date e plan_end_date à tabela workout_plans
-- Rodar no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS plan_start_date date,
  ADD COLUMN IF NOT EXISTS plan_end_date date;

COMMENT ON COLUMN public.workout_plans.plan_start_date IS 'Data de início do plano de treino (definida pelo professor)';
COMMENT ON COLUMN public.workout_plans.plan_end_date IS 'Data de fim do plano de treino (definida pelo professor)';
