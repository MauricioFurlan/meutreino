-- =====================================================================
-- App de Treino — 19_subtitle_library.sql
-- Biblioteca de subtítulos de dia por professor (regiões musculares e
-- combinações). Mesma ideia da exercise_library: popula-se organicamente
-- conforme o professor monta treinos, e alimenta o autocomplete do campo
-- "Subtítulo" de cada dia no editor.
-- Rodar DEPOIS de 18_exercise_library.sql, no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- subtitle_library — cada professor tem sua própria lista de subtítulos.
-- name_lower é gerado para busca case-insensitive e unicidade, assim
-- "Ombro + Peito" e "ombro + peito" não viram duas entradas.
-- use_count serve para ordenar as sugestões pelo que ele mais usa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subtitle_library (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (lower(trim(name))) STORED,
  use_count  INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, name_lower)
);

COMMENT ON TABLE public.subtitle_library IS 'Biblioteca de subtítulos de dia (regiões musculares) por professor. Alimentada automaticamente ao salvar treinos.';
COMMENT ON COLUMN public.subtitle_library.name_lower IS 'Subtítulo normalizado (lower+trim) para unicidade e busca.';
COMMENT ON COLUMN public.subtitle_library.use_count IS 'Quantas vezes o professor já usou este subtítulo — ordena as sugestões.';

-- Índice para autocomplete: professor + prefixo do subtítulo
CREATE INDEX IF NOT EXISTS idx_sublib_coach_name
  ON public.subtitle_library (coach_id, name_lower text_pattern_ops);

-- ---------------------------------------------------------------------
-- RLS — professor vê/gerencia apenas seus próprios subtítulos; owner vê todos
-- ---------------------------------------------------------------------
ALTER TABLE public.subtitle_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sublib_select ON public.subtitle_library;
CREATE POLICY sublib_select ON public.subtitle_library
  FOR SELECT TO authenticated
  USING ( coach_id = auth.uid() OR public.is_owner() );

DROP POLICY IF EXISTS sublib_insert ON public.subtitle_library;
CREATE POLICY sublib_insert ON public.subtitle_library
  FOR INSERT TO authenticated
  WITH CHECK ( coach_id = auth.uid() AND public.i_have_access() );

DROP POLICY IF EXISTS sublib_update ON public.subtitle_library;
CREATE POLICY sublib_update ON public.subtitle_library
  FOR UPDATE TO authenticated
  USING ( coach_id = auth.uid() )
  WITH CHECK ( coach_id = auth.uid() AND public.i_have_access() );

DROP POLICY IF EXISTS sublib_delete ON public.subtitle_library;
CREATE POLICY sublib_delete ON public.subtitle_library
  FOR DELETE TO authenticated
  USING ( coach_id = auth.uid() );
