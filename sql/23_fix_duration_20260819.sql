-- Corrige a duração do treino de quarta-feira (19/08/2026) do aluno
-- mauricio.furlan@hotmail.com para 1h10min (4200 segundos).

update public.workout_sessions
set duration_seconds = 4290,
    ended_at = started_at + interval '1 hour 23 minutes'
where student_id = (select id from public.profiles where email = 'mauricio.furlan@hotmail.com')
  and weekday = 'Quarta'
  and started_at::date = '2026-08-20'::date
returning id, weekday, started_at, ended_at, duration_seconds;
