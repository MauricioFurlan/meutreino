-- =====================================================================
-- App de Treino — 18_exercise_library.sql
-- Biblioteca de exercícios por professor (autocomplete + vídeo).
-- Popula-se organicamente conforme o professor cria treinos.
-- Rodar no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- exercise_library — cada professor tem sua própria lista de exercícios
-- name_lower é gerado para busca case-insensitive e unicidade.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercise_library (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (lower(trim(name))) STORED,
  video_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, name_lower)
);

COMMENT ON TABLE public.exercise_library IS 'Biblioteca de exercícios por professor. Alimentada automaticamente ao salvar treinos.';
COMMENT ON COLUMN public.exercise_library.name_lower IS 'Nome normalizado (lower+trim) para unicidade e busca.';

-- Índice para autocomplete: professor + prefixo do nome
CREATE INDEX IF NOT EXISTS idx_exlib_coach_name
  ON public.exercise_library (coach_id, name_lower text_pattern_ops);

-- ---------------------------------------------------------------------
-- RLS — professor vê/gerencia apenas seus próprios exercícios; owner vê todos
-- ---------------------------------------------------------------------
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exlib_select ON public.exercise_library;
CREATE POLICY exlib_select ON public.exercise_library
  FOR SELECT TO authenticated
  USING ( coach_id = auth.uid() OR public.is_owner() );

DROP POLICY IF EXISTS exlib_insert ON public.exercise_library;
CREATE POLICY exlib_insert ON public.exercise_library
  FOR INSERT TO authenticated
  WITH CHECK ( coach_id = auth.uid() AND public.i_have_access() );

DROP POLICY IF EXISTS exlib_update ON public.exercise_library;
CREATE POLICY exlib_update ON public.exercise_library
  FOR UPDATE TO authenticated
  USING ( coach_id = auth.uid() )
  WITH CHECK ( coach_id = auth.uid() AND public.i_have_access() );

DROP POLICY IF EXISTS exlib_delete ON public.exercise_library;
CREATE POLICY exlib_delete ON public.exercise_library
  FOR DELETE TO authenticated
  USING ( coach_id = auth.uid() );
