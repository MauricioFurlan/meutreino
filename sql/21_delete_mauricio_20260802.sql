-- Remove a avaliação existente do dia 02/08/2026 do aluno mauricio.furlan@hotmail.com
delete from public.assessments
where assessment_date = '2026-08-02'::date
  and student_id = (select id from public.profiles where email = 'mauricio.furlan@hotmail.com');
