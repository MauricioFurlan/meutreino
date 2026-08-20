-- =====================================================================
-- 26_workout_session_rating.sql
-- Ao encerrar o treino, o aluno pode dar uma nota de 0 a 5 e escrever um
-- relato curto sobre como foi a sessão.
-- Rodar no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS feedback_text text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_sessions_rating_check'
  ) THEN
    ALTER TABLE public.workout_sessions
      ADD CONSTRAINT workout_sessions_rating_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 5);
  END IF;
END $$;

COMMENT ON COLUMN public.workout_sessions.rating IS 'Nota de 0 a 5 dada pelo aluno sobre como foi o treino (opcional)';
COMMENT ON COLUMN public.workout_sessions.feedback_text IS 'Relato curto opcional do aluno sobre o treino';
