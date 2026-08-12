-- Adiciona campo app_theme ao perfil do aluno (sistema de temas)
-- Valores possíveis: 'default', 'yellow', 'pink', 'colorblind', 'light', 'neon'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_theme TEXT DEFAULT 'default';
