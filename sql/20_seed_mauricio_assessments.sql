-- Popula 3 avaliações físicas (anamnese) do aluno mauricio.furlan@hotmail.com
-- a partir dos PDFs "Avaliação Física - Mauricio Furlan 1 (1/2/3).pdf"
-- (avaliador: Carlos Damato, CRN 49978).
-- Rodar uma vez no SQL Editor do Supabase (ou via run_sql.mjs).

insert into public.assessments (student_id, coach_id, assessment_date, data)
select p.id, p.coach_id, '2024-08-02'::date, '{
  "peso": 92.9,
  "altura": 180,
  "imc": 28.7,
  "circunferencias": {
    "cintura": 88, "abdomen": 91, "quadril": 103, "torax": 101.5, "ombro": 128,
    "braco_d_relaxado": 39, "braco_e_relaxado": 39,
    "antebraco_d": 32, "antebraco_e": 32,
    "coxa_d": 62, "coxa_e": 61,
    "panturrilha_d": 40, "panturrilha_e": 41
  },
  "dobras": {
    "triceps": 10.0, "subescapular": 12.0, "axilar_media": 9.0, "toracica": 13.0,
    "supra_iliaca": 13.0, "abdominal": 25.0, "coxa": 24.0
  },
  "composicao": { "gordura": 16, "massa_magra": 77.9, "massa_gorda": 15.0, "massa_magra_perc": 84 },
  "observacoes": "Avaliação física por Carlos Damato (CRN 49978). Classificação: dentro da média."
}'::jsonb
from public.profiles p where p.email = 'mauricio.furlan@hotmail.com';

insert into public.assessments (student_id, coach_id, assessment_date, data)
select p.id, p.coach_id, '2025-08-23'::date, '{
  "peso": 88.7,
  "altura": 180,
  "imc": 27.4,
  "circunferencias": {
    "cintura": 80, "abdomen": 84, "quadril": 99, "torax": 99, "ombro": 122,
    "braco_d_relaxado": 38.5, "braco_e_relaxado": 38.5,
    "antebraco_d": 31, "antebraco_e": 31,
    "coxa_d": 60, "coxa_e": 60,
    "panturrilha_d": 40, "panturrilha_e": 40
  },
  "dobras": {
    "triceps": 5.0, "subescapular": 9.0, "axilar_media": 4.5, "toracica": 5.0,
    "supra_iliaca": 6.0, "abdominal": 12.0, "coxa": 11.0
  },
  "composicao": { "gordura": 8, "massa_magra": 81.5, "massa_gorda": 7.2, "massa_magra_perc": 92 },
  "observacoes": "Avaliação física por Carlos Damato (CRN 49978). Classificação: abaixo da média."
}'::jsonb
from public.profiles p where p.email = 'mauricio.furlan@hotmail.com';

insert into public.assessments (student_id, coach_id, assessment_date, data)
select p.id, p.coach_id, '2026-08-19'::date, '{
  "peso": 95.1,
  "altura": 180,
  "imc": 29.4,
  "circunferencias": {
    "cintura": 88, "abdomen": 92, "quadril": 104, "torax": 105, "ombro": 128,
    "braco_d_relaxado": 40, "braco_e_relaxado": 39.5,
    "antebraco_d": 32, "antebraco_e": 32,
    "coxa_d": 64, "coxa_e": 64,
    "panturrilha_d": 40.5, "panturrilha_e": 40.5
  },
  "dobras": {
    "triceps": 5.0, "subescapular": 9.0, "axilar_media": 5.0, "toracica": 7.5,
    "supra_iliaca": 8.0, "abdominal": 19.0, "coxa": 14.0
  },
  "composicao": { "gordura": 10, "massa_magra": 85.2, "massa_gorda": 9.9, "massa_magra_perc": 90 },
  "observacoes": "Avaliação física por Carlos Damato (CRN 49978). Classificação: abaixo da média."
}'::jsonb
from public.profiles p where p.email = 'mauricio.furlan@hotmail.com';
