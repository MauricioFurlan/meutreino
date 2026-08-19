-- =====================================================================
-- App de Treino — 18_workout_session_pause.sql
-- Adiciona suporte a pausar/retomar o treino: tempo pausado é
-- descontado da duração final da sessão.
-- Rodar DEPOIS de 17_cyclic_mode.sql.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- paused_seconds: total acumulado de segundos pausados (fechado a cada retomada)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sessions' AND column_name = 'paused_seconds'
  ) THEN
    ALTER TABLE public.workout_sessions
      ADD COLUMN paused_seconds int NOT NULL DEFAULT 0;
  END IF;
END $$;

-- pause_started_at: quando não nulo, a sessão está pausada agora
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_sessions' AND column_name = 'pause_started_at'
  ) THEN
    ALTER TABLE public.workout_sessions
      ADD COLUMN pause_started_at timestamptz;
  END IF;
END $$;
