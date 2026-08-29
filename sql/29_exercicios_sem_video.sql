-- =====================================================================
-- App de Treino — 29_exercicios_sem_video.sql
-- SOMENTE LEITURA. Lista os exercícios que hoje caem no fallback de busca
-- do YouTube: sem video_url do professor E sem chave no mapa
-- DEFAULT_EXERCISE_VIDEOS do index.html.
--
-- O mapa do app é a lista `curados` abaixo — se você adicionar chaves lá,
-- adicione aqui também para o relatório continuar batendo.
-- Rodar no SQL Editor do Supabase.
-- =====================================================================

with curados(name_lower) as (values
  ('agachamento livre'),
  ('banco romano'),
  ('barra fixa'),
  ('cadeira extensora'),
  ('cadeira flexora'),
  ('chest press'),
  ('crossover'),
  ('crossover alto'),
  ('crucifixo inclinado'),
  ('crucifixo reto'),
  ('desenvolvimento militar'),
  ('elevação lateral'),
  ('flexão de braço'),
  ('leg press 45°'),
  ('levantamento terra'),
  ('panturrilha em pé'),
  ('panturrilha no leg press'),
  ('peck deck'),
  ('pulldown'),
  ('pullover'),
  ('pullover na polia'),
  ('puxada frontal'),
  ('puxada supinada'),
  ('puxada triângulo'),
  ('puxador frente'),
  ('remada alta'),
  ('remada baixa (barra reta)'),
  ('remada baixa (triângulo)'),
  ('remada cavalinho'),
  ('remada curvada'),
  ('remada serrote'),
  ('remada unilateral'),
  ('remada unilateral com halter'),
  ('rosca direta barra'),
  ('rosca direta com barra'),
  ('rosca martelo'),
  ('stiff'),
  ('supino declinado'),
  ('supino inclinado com halteres'),
  ('supino inclinado halter'),
  ('supino na máquina'),
  ('supino reto'),
  ('supino reto com barra'),
  ('supino reto com halteres'),
  ('tríceps corda'),
  ('tríceps pulley (corda)')
),

-- Nomes vindos dos planos ativos (é o que o aluno realmente vê no card).
dos_planos as (
  select lower(trim(ex.value->>'name')) as name_lower,
         count(*)                       as vezes_no_plano
  from public.workout_plans p
       cross join lateral jsonb_each(p.structure) as d(key, value)
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(d.value) = 'array' then d.value else '[]'::jsonb end) as ex(value)
  where p.is_active
    and coalesce(ex.value->>'name', '') <> ''
  group by 1
),

-- Nomes da biblioteca do professor, com o video_url que ele cadastrou.
da_biblioteca as (
  select name_lower,
         max(name)                                          as nome_exibido,
         count(*) filter (where coalesce(video_url,'') <> '') as com_video_proprio
  from public.exercise_library
  group by name_lower
),

todos as (
  select coalesce(b.name_lower, p.name_lower)      as name_lower,
         coalesce(b.nome_exibido, p.name_lower)    as nome,
         coalesce(b.com_video_proprio, 0)          as com_video_proprio,
         coalesce(p.vezes_no_plano, 0)             as vezes_no_plano
  from da_biblioteca b
       full join dos_planos p on p.name_lower = b.name_lower
)

select t.nome,
       t.name_lower,
       t.vezes_no_plano,
       case when t.com_video_proprio > 0 then 'professor cadastrou' else 'nenhum' end as video_hoje
from todos t
where t.com_video_proprio = 0
  -- mesma normalização do app: '(ativação)', '(aquecimento)', '(pico de
  -- contração)' e '(drop set)' no fim do nome não mudam qual exercício é.
  and regexp_replace(t.name_lower,
        '\s*\((ativação|aquecimento|pico de contração|drop ?set)\)\s*$', '')
      not in (select name_lower from curados)
  and t.name_lower not in (select name_lower from curados)
order by t.vezes_no_plano desc, t.nome;
