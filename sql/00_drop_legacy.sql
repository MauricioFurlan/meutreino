-- =====================================================================
-- App de Treino — 00_drop_legacy.sql
-- Remove as tabelas do app antigo (já com backup em ../backup/).
-- workout_logs é recriado no formato novo por 01_schema.sql e repovoado por 05.
-- trainer_notes / exercise_videos são absorvidos pela estrutura JSONB do plano.
-- =====================================================================
drop table if exists public.workout_logs   cascade;
drop table if exists public.trainer_notes  cascade;
drop table if exists public.exercise_videos cascade;
