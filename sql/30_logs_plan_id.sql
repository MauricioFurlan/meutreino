-- =====================================================================
-- App de Treino — 30_logs_plan_id.sql
-- Amarra cada registro de execução ao treino em que ele foi feito.
--
-- Por quê: quando o professor ATIVA outro treino para o aluno, o histórico
-- que o aluno vê (carga da semana passada, modal de histórico, posição do
-- ciclo) precisa começar do zero — o treino é outro, a referência de carga
-- do treino velho não serve. Com plan_id o app filtra pelo plano ativo em
-- vez de apagar: nada é destruído, e evolucao.html + as telas do professor
-- continuam enxergando a série histórica inteira do aluno.
--
-- Editar o MESMO treino não reseta nada: o id do plano não muda.
--
-- Rodar no SQL Editor do Supabase, DEPOIS de 09_workout_sessions.sql.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.workout_plans(id) ON DELETE SET NULL;

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.workout_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.workout_logs.plan_id IS
  'Treino em que a série foi executada. O app do aluno mostra só o histórico do plano ativo; relatórios do professor ignoram este filtro.';
COMMENT ON COLUMN public.workout_sessions.plan_id IS
  'Treino em que a sessão foi executada (mesma regra de workout_logs.plan_id).';

-- O app filtra sempre por (student_id, plan_id) antes de olhar data/exercício.
CREATE INDEX IF NOT EXISTS idx_logs_student_plan
  ON public.workout_logs (student_id, plan_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_logs_student_plan_ex
  ON public.workout_logs (student_id, plan_id, exercise_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_student_plan
  ON public.workout_sessions (student_id, plan_id, started_at DESC);

-- Backfill: o que já existe pertence ao treino que está ativo hoje.
-- Sem isso, todo aluno abriria o app com o histórico zerado na primeira vez —
-- um reset que o professor não pediu. O índice único uq_plan_active_per_student
-- garante no máximo 1 plano ativo por aluno, então o join não duplica linha.
UPDATE public.workout_logs l
   SET plan_id = p.id
  FROM public.workout_plans p
 WHERE l.plan_id IS NULL
   AND p.student_id = l.student_id
   AND p.is_active = true;

UPDATE public.workout_sessions s
   SET plan_id = p.id
  FROM public.workout_plans p
 WHERE s.plan_id IS NULL
   AND p.student_id = s.student_id
   AND p.is_active = true;
