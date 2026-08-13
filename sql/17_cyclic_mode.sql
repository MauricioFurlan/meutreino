-- =====================================================================
-- App de Treino — 17_cyclic_mode.sql
-- Adiciona suporte a modo cíclico (AB, ABC, ABCD...) nos treinos.
-- Rodar DEPOIS de 16_add_app_theme.sql.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

-- mode: 'weekly' (padrão, comportamento atual) ou 'cyclic'
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_plans' AND column_name = 'mode'
  ) THEN
    ALTER TABLE public.workout_plans
      ADD COLUMN mode text NOT NULL DEFAULT 'weekly'
        CHECK (mode IN ('weekly', 'cyclic'));
  END IF;
END $$;

-- days_per_week: quantos dias por semana o aluno deve treinar (modo cíclico)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_plans' AND column_name = 'days_per_week'
  ) THEN
    ALTER TABLE public.workout_plans
      ADD COLUMN days_per_week int;
  END IF;
END $$;

-- subtitles: subtítulo de cada dia/letra (ambos modos)
-- Ex weekly: {"Segunda": "Costas · Bíceps", "Terça": "Peito · Ombro · Tríceps"}
-- Ex cyclic: {"A": "Peito · Ombro · Tríceps", "B": "Costas · Bíceps"}
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_plans' AND column_name = 'subtitles'
  ) THEN
    ALTER TABLE public.workout_plans
      ADD COLUMN subtitles jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- cycle_sequence: ordem dos treinos + descansos no modo cíclico
-- Ex: ["A","B","C","rest","D","E","rest"]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workout_plans' AND column_name = 'cycle_sequence'
  ) THEN
    ALTER TABLE public.workout_plans
      ADD COLUMN cycle_sequence jsonb;
  END IF;
END $$;

-- Comentários
COMMENT ON COLUMN public.workout_plans.mode IS 'weekly = dias da semana fixos (padrão); cyclic = sequência rotativa (A,B,C...)';
COMMENT ON COLUMN public.workout_plans.days_per_week IS 'Modo cíclico: quantos dias por semana o aluno deve treinar (usado no cálculo de aderência)';
COMMENT ON COLUMN public.workout_plans.subtitles IS 'Subtítulo descritivo de cada dia/letra. Ex: {"A": "Peito · Ombro · Tríceps"}';
COMMENT ON COLUMN public.workout_plans.cycle_sequence IS 'Modo cíclico: sequência ordenada incluindo descanso. Ex: ["A","B","rest","C","D","rest"]';
