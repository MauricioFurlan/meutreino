-- =====================================================================
-- 11_cardio_set_migrate.sql
-- Converte exercício de cardio do modelo antigo (sets de carga×reps, ou
-- tempo escondido em `reps`/nome) para o modelo novo: UM set com
-- type = 'cardio' e o tempo prescrito em `reps` (ex: '40min').
--
-- Correção de DADO, não de schema. Rodar por partes, na ordem:
--   PASSO 0 — backup do que vai mudar
--   PASSO 1 — diagnóstico (só leitura): descobrir o que existe hoje
--   PASSO 2 — conversão (edite as 3 variáveis antes de rodar)
--   PASSO 3 — conferência
--
-- ATENÇÃO: workout_plans.structure NÃO é versionado — o editor sobrescreve
-- a mesma linha. Sem o PASSO 0 não há como voltar atrás.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASSO 0 — Backup. Rode e GUARDE o resultado (copie o JSON para um
-- arquivo local) antes de qualquer update.
-- ---------------------------------------------------------------------
select p.id as plan_id, s.email, p.title, p.structure
  from public.workout_plans p
  join public.profiles s on s.id = p.student_id
 where p.is_active
   and lower(s.email) = lower('ALUNO@EXEMPLO.COM');


-- ---------------------------------------------------------------------
-- PASSO 1 — Diagnóstico (só leitura).
-- Lista, em TODOS os planos ativos, os exercícios que parecem cardio:
-- pelo nome, ou por já terem tempo escrito em algum campo ('40min').
-- Serve para saber o nome EXATO do exercício e em que dia ele está.
-- ---------------------------------------------------------------------
select s.full_name,
       s.email,
       p.title,
       dia.key                as dia,
       ex.item->>'name'       as exercicio,
       ex.item->'sets'        as sets_atuais,
       ex.item->>'rest'       as descanso
  from public.workout_plans p
  join public.profiles s on s.id = p.student_id
  cross join lateral jsonb_each(p.structure)        as dia(key, value)
  cross join lateral jsonb_array_elements(dia.value) as ex(item)
 where p.is_active
   and jsonb_typeof(dia.value) = 'array'
   and (
     ex.item->>'name' ~* '(cardio|esteira|bike|bicicleta|el[íi]ptico|eliptico|escada|corrida|caminhada|remo|transport|stair|spinning|nata)'
     or ex.item::text ~* '[0-9]+ ?min'
   )
 order by s.full_name, dia.key;


-- ---------------------------------------------------------------------
-- PASSO 2 — Conversão.
-- Troque os 3 valores abaixo. O nome do exercício vem do PASSO 1 e a
-- comparação é case-insensitive, mas tem que ser o nome inteiro.
--
-- O que faz: substitui TODOS os sets daquele exercício (em todos os dias
-- do plano ativo do aluno) por um único set de cardio, preservando a nota
-- do primeiro set antigo. Não toca em nenhum outro exercício.
-- ---------------------------------------------------------------------
do $$
declare
  v_email     text := 'ALUNO@EXEMPLO.COM';   -- <<< e-mail do aluno
  v_exercicio text := 'Esteira';             -- <<< nome exato (PASSO 1)
  v_tempo     text := '40min';               -- <<< tempo prescrito
  v_plan      record;
  v_struct    jsonb;
  v_arr       jsonb;
  v_dia       text;
  v_i         int;
  v_trocas    int := 0;
begin
  for v_plan in
    select p.id, p.structure
      from public.workout_plans p
      join public.profiles s on s.id = p.student_id
     where p.is_active
       and lower(s.email) = lower(v_email)
  loop
    v_struct := v_plan.structure;

    for v_dia in select jsonb_object_keys(v_struct) loop
      v_arr := v_struct -> v_dia;
      if jsonb_typeof(v_arr) = 'array' then
        for v_i in 0 .. jsonb_array_length(v_arr) - 1 loop
          if lower(v_arr -> v_i ->> 'name') = lower(v_exercicio) then
            v_struct := jsonb_set(
              v_struct,
              array[v_dia, v_i::text, 'sets'],
              jsonb_build_array(
                jsonb_build_object(
                  'type', 'cardio',
                  'reps', v_tempo,
                  'note', coalesce(v_arr -> v_i -> 'sets' -> 0 -> 'note', 'null'::jsonb)
                )
              )
            );
            v_trocas := v_trocas + 1;
          end if;
        end loop;
      end if;
    end loop;

    if v_trocas > 0 then
      update public.workout_plans
         set structure = v_struct, updated_at = now()
       where id = v_plan.id;
    end if;
  end loop;

  if v_trocas = 0 then
    raise notice 'Nada mudou: nenhum exercício "%" no plano ativo de %.', v_exercicio, v_email;
  else
    raise notice '% set(s) convertido(s) para cardio.', v_trocas;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PASSO 3 — Conferência. O exercício deve aparecer com um único set
-- {"type":"cardio","reps":"40min",...}
-- ---------------------------------------------------------------------
select dia.key           as dia,
       ex.item->>'name'  as exercicio,
       ex.item->'sets'   as sets_novos
  from public.workout_plans p
  join public.profiles s on s.id = p.student_id
  cross join lateral jsonb_each(p.structure)        as dia(key, value)
  cross join lateral jsonb_array_elements(dia.value) as ex(item)
 where p.is_active
   and lower(s.email) = lower('ALUNO@EXEMPLO.COM')
   and ex.item->'sets' @> '[{"type":"cardio"}]'::jsonb;


-- =====================================================================
-- Opcional — descanso entre séries em lote
-- Preenche `rest` em TODOS os exercícios não-cardio do plano ativo de um
-- aluno que ainda não têm descanso definido. Útil como ponto de partida;
-- o professor ajusta exercício a exercício depois no editor.
-- =====================================================================
-- do $$
-- declare
--   v_email text := 'ALUNO@EXEMPLO.COM';
--   v_rest  text := '90s';
--   v_plan  record; v_struct jsonb; v_arr jsonb; v_dia text; v_i int;
-- begin
--   for v_plan in
--     select p.id, p.structure from public.workout_plans p
--     join public.profiles s on s.id = p.student_id
--     where p.is_active and lower(s.email) = lower(v_email)
--   loop
--     v_struct := v_plan.structure;
--     for v_dia in select jsonb_object_keys(v_struct) loop
--       v_arr := v_struct -> v_dia;
--       if jsonb_typeof(v_arr) = 'array' then
--         for v_i in 0 .. jsonb_array_length(v_arr) - 1 loop
--           if coalesce(v_arr -> v_i ->> 'rest', '') = ''
--              and not (v_arr -> v_i -> 'sets' @> '[{"type":"cardio"}]'::jsonb) then
--             v_struct := jsonb_set(v_struct, array[v_dia, v_i::text, 'rest'], to_jsonb(v_rest));
--           end if;
--         end loop;
--       end if;
--     end loop;
--     update public.workout_plans set structure = v_struct, updated_at = now() where id = v_plan.id;
--   end loop;
-- end $$;
