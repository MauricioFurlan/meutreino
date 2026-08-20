-- =====================================================================
-- 25_trainer_notes_alert.sql
-- Adiciona lembrete de atualização às anotações do professor: uma data
-- para ser avisado (aparece no painel do professor 5 dias antes) e um
-- texto curto opcional que aparece junto do alerta.
-- Rodar no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =====================================================================

ALTER TABLE public.trainer_notes
  ADD COLUMN IF NOT EXISTS alert_date date,
  ADD COLUMN IF NOT EXISTS alert_message text;

COMMENT ON COLUMN public.trainer_notes.alert_date IS 'Data em que o professor quer ser lembrado de atualizar esta anotação (alerta aparece 5 dias antes)';
COMMENT ON COLUMN public.trainer_notes.alert_message IS 'Texto curto opcional exibido junto do alerta de lembrete';
