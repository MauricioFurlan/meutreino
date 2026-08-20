-- Remove a sessão de treino de teste registrada em 20/08/2026 pelo aluno
-- mauricio.furlan@hotmail.com.

delete from public.workout_sessions
where student_id = (select id from public.profiles where email = 'mauricio.furlan@hotmail.com')
  and started_at::date = '2026-08-20'::date
returning id, weekday, started_at, ended_at, duration_seconds;
