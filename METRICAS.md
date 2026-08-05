# Métricas e Relatórios — Trimestral / Semestral / Anual

> **Status:** proposta de planejamento.
> Documento irmão do `PLANO.md`. Cobre: (1) o que precisa ser corrigido antes de criar
> os novos períodos, (2) quais métricas valem para janelas longas, (3) que dados novos
> coletar, (4) como compartilhar isso com o aluno.
>
> ### Já implementado (dentro de Diário/Semanal/Mensal)
> - `toLocalISO()` nas duas pontas (`index.html` grava data local; `treinador.html` lê) — ver 1.3
> - Filtros de resumo migrados de `created_at` para `session_date`
> - Denominador de frequência vindo dos dias prescritos do plano ativo — ver 1.2
> - 1RM estimado (Epley) no gráfico, substituindo "carga máx" como linha principal
> - Janela de 12 semanas no gráfico de evolução (antes: histórico inteiro, sem limite)
> - Melhor set / progressão de 1RM / densidade (kg/min) / duração média / horário de início
> - Comparativo de tempo em Semanal e Mensal
> - Sequência (🔥) contando só dias prescritos — descanso não quebra
> - Correções: indicador de frequência do gráfico, rótulo da última faixa do mês,
>   canvas destruído no erro, offset de navegação preso, comparativo em paralelo
> - Testes: `test_metricas.mjs` (25 casos, extrai as funções reais dos HTMLs)
>
> **Pendente:** rollup diário no Postgres (1.1), tabela `reports` (3.1), períodos
> trimestral/semestral/anual, RPE, grupo muscular.

---

## 0. Situação atual (o que já existe)

**`treinador.html`** tem o toggle `Diário / Semanal / Mensal` (linhas ~452-454, `switchView()`):

| Período | O que mostra hoje |
|---|---|
| Diário | Exercícios do dia, sets executados, reps prescritas entre parênteses, gráfico de evolução por exercício |
| Semanal | Presença (7 bolinhas), volume por dia (hard sets), tempo de treino por dia, comparativo vs semana anterior |
| Mensal | Calendário de presença, volume por semana, destaques (volume, tempo, faltas, melhor semana), comparativo vs mês anterior |

**Tabelas que alimentam isso:**

- `workout_logs` — `student_id, session_date, weekday, exercise_name, set_type, set_number, weight, reps, notes, created_at`
- `workout_sessions` — `student_id, weekday, started_at, ended_at, duration_seconds`
- `workout_plans` — `structure` (JSONB), `is_active`, `plan_start_date`, `plan_end_date`
- `assessments` — `assessment_date`, `data` (JSONB: peso, dobras, circunferências, composição)

**O aluno (`index.html`) não tem nenhuma visão agregada.** Só o modal de histórico
das últimas 4 semanas, por exercício. Toda a inteligência de resumo vive no lado do professor.

---

## 1. Correções necessárias ANTES de criar os novos períodos

Estes três pontos são toleráveis em janela de 7 ou 30 dias e viram defeito grave em
90, 180 ou 365 dias. Criar as abas novas sem resolver isso gera telas lentas e números
que o professor não vai confiar.

### 1.1 Agregação no cliente não escala

Hoje `loadWeekly()` e `loadMonthly()` baixam **todas as linhas cruas** de `workout_logs`
e somam em JavaScript:

```js
supaFetch(`workout_logs?student_id=eq.${studentId}&created_at=gte....`)
```

Volume de linhas por janela (estimativa: 4 treinos/semana × 6 exercícios × 4 sets ≈ 96 linhas/semana):

| Janela | Linhas aproximadas |
|---|---|
| Semana | ~100 |
| Mês | ~420 |
| Trimestre | ~1.250 |
| Semestre | ~2.500 |
| Ano | ~5.000 (mais em treinos de alto volume: 10-15 mil) |

Isso é payload de rede + parse + laço em JS no celular do professor, e o comparativo
faz uma **segunda** query do mesmo tamanho para o período anterior. Dobra tudo.

**Solução:** uma view de rollup diário no Postgres. O cliente passa a ler ~90 linhas
para um trimestre e ~365 para um ano, em vez de milhares.

```sql
-- sql/10_daily_rollup.sql (esboço)
create or replace view public.student_daily_rollup as
with logs as (
  select
    student_id,
    session_date                                              as dia,
    count(*)                                                  as sets_total,
    count(*) filter (where set_type = 'hard')                 as sets_hard,
    sum(coalesce(reps,0)) filter (where set_type = 'hard')    as reps_hard,
    sum(coalesce(weight,0) * coalesce(reps,0))
      filter (where set_type = 'hard')                        as volume_hard,
    max(weight) filter (where set_type = 'hard')              as carga_max,
    count(distinct exercise_name)                             as exercicios
  from public.workout_logs
  group by student_id, session_date
),
sess as (
  select
    student_id,
    (started_at at time zone 'America/Sao_Paulo')::date        as dia,
    sum(duration_seconds)                                     as segundos,
    min(started_at)                                           as primeiro_inicio
  from public.workout_sessions
  where duration_seconds is not null
  group by student_id, (started_at at time zone 'America/Sao_Paulo')::date
)
select
  coalesce(l.student_id, s.student_id) as student_id,
  coalesce(l.dia, s.dia)               as dia,
  coalesce(l.sets_total, 0)            as sets_total,
  coalesce(l.sets_hard, 0)             as sets_hard,
  coalesce(l.reps_hard, 0)             as reps_hard,
  coalesce(l.volume_hard, 0)           as volume_hard,
  l.carga_max,
  coalesce(l.exercicios, 0)            as exercicios,
  coalesce(s.segundos, 0)              as segundos,
  s.primeiro_inicio
from logs l
full outer join sess s
  on l.student_id = s.student_id and l.dia = s.dia;
```

> Views herdam o RLS das tabelas base quando criadas com `security_invoker`.
> Conferir isso ao implementar (`alter view ... set (security_invoker = on)`),
> senão o aluno de um professor pode acabar lendo o rollup de outro.
> **Errar isso é vazamento de dado entre professores — defeito bem pior que tela lenta.**

Se um dia o volume incomodar, o mesmo desenho vira **materialized view** com refresh
diário, ou uma tabela `daily_rollup` alimentada por trigger em `workout_logs`.

> **Nota de fuso:** o esboço acima junta `logs` por `session_date` e `sess` por
> `(started_at at time zone 'America/Sao_Paulo')::date`. Os dois só coincidem **depois**
> da correção descrita em 1.3 — hoje `session_date` está em UTC e as duas pontas do
> `full outer join` podem cair em dias diferentes, gerando dias fantasma (um com volume
> e sem tempo, outro com tempo e sem volume).

#### Este rollup não atende todas as métricas — provavelmente são dois níveis

Granularidade `student × dia` serve **volume, sets, reps, tempo e densidade**. Ela
**não** serve as métricas de maior valor em janela longa, que são por exercício:

- e1RM estimado e sua curva
- PRs e tempo desde o último PR
- Δ carga início → fim por exercício
- Exercícios em queda
- Top exercícios por volume
- (futuro) volume por grupo muscular

Essas precisam de `student × dia × exercise_name`. Ou seja, o desenho realista é
**dois rollups**: um agregado por dia (para frequência, volume, tempo) e um por
dia+exercício (para força e progressão). O segundo é maior, mas ainda muito menor que
o dado cru — colapsa os 4-5 sets de cada exercício em 1 linha com máximos e somas.

> **Recomendação:** antes de congelar a forma do rollup, prototipar e1RM e PR na mão
> para um aluno real. É o que revela se um nível resolve ou se os dois são necessários —
> e é barato descobrir isso antes, caro depois.


### 1.2 O denominador da frequência está errado

O código assume que **todo dia que não é domingo é dia de treino**:

```js
const isSunday = new Date(date + 'T12:00:00').getDay() === 0;
...
else { cls = 'missed'; totalTrainingDays++; }   // qualquer dia sem log = falta
```

Consequências:

- Aluno que treina 4x/semana aparece com **2 faltas toda semana**, para sempre.
- No mês: "8 faltas". No trimestre: "~26 faltas". No ano: **"~104 faltas"**.
- O número deixa de ser informação e passa a ser ruído. O professor aprende a ignorar,
  e aí perde também as faltas reais.

**Solução:** o denominador vem dos dias prescritos no plano — as chaves de
`workout_plans.structure` (`"Segunda"`, `"Quarta"`, ...). Para janelas longas, o plano
vigente muda ao longo do período, então o correto é usar `plan_start_date` /
`plan_end_date` para saber qual plano estava em vigor em cada semana.

> ⚠️ **Limitação conhecida:** o `editor.html` faz `UPDATE` na mesma linha de
> `workout_plans` ao editar (decisão consciente, para não encher o histórico de
> duplicatas). Isso significa que **a prescrição antiga é sobrescrita** e não pode ser
> reconstruída depois. Para aderência histórica confiável em janela anual, seria
> preciso ou (a) versionar o plano ao editar depois de já haver execução registrada,
> ou (b) guardar no próprio log um campo com os dias prescritos vigentes. Enquanto
> isso não existir, tratar a aderência de períodos antigos como aproximação e deixar
> isso explícito na tela.

### 1.3 Filtro por `created_at` em vez de `session_date`

Todas as queries de resumo filtram `created_at` (timestamp UTC de inserção), embora a
tabela tenha `session_date` (data do treino) e o índice seja sobre ela:

```sql
create index idx_logs_student_date on public.workout_logs (student_id, session_date desc);
```

```js
// o que o código faz hoje:
`workout_logs?...&created_at=gte.${startStr}T00:00:00&created_at=lte.${endStr}T23:59:59`
```

Dois problemas:

1. **Fuso.** `created_at` é UTC. Treino registrado às 22h no horário de Brasília grava
   `01:00` do dia seguinte em UTC. Esse treino é contabilizado no dia errado — e, se
   cair no dia 30/31, no **mês/trimestre errado**. Em um ano, isso desloca dezenas de
   dias de fronteira.
2. **Índice não usado.** O filtro por `created_at` não aproveita
   `idx_logs_student_date`, então a leitura de um ano faz varredura maior que o necessário.

#### O `session_date` também está em UTC — a correção é maior que trocar o filtro

> **Correção de uma versão anterior deste documento**, que afirmava que `session_date`
> era o dado "sem fuso". Não é. A origem do defeito está na **escrita**, em
> `index.html:336` (`getDateForDay`):

```js
function getDateForDay(day) {
  const dayIndex = [...].indexOf(day);
  const now = new Date();
  const todayIndex = now.getDay();        // ← dia LOCAL
  let diff = todayIndex - dayIndex;
  if (diff < 0) diff += 7;
  const target = new Date(now);
  target.setDate(now.getDate() - diff);
  return target.toISOString().split('T')[0];   // ← converte para UTC
}
```

Treino às 22h de 04/ago no Brasil → `toISOString()` devolve `"2026-08-05"`.
Consequências:

- Trocar o filtro de `created_at` para `session_date` **não corrige** o deslocamento de
  dia: os dois estão em UTC.
- `session_date` e `weekday` da **mesma linha** discordam entre si nesses casos, porque
  `weekday` vem de `now.getDay()`, que é local. Linha gravada como
  `session_date = 05/08` (terça→quarta em UTC) com `weekday = 'Terça'`.
- A aba **Diária** já filtra `session_date=eq.` (`treinador.html:547`), enquanto Semanal
  e Mensal filtram `created_at`. Ou seja, **hoje as duas telas podem colocar o mesmo
  treino em dias diferentes.**

**Solução, em três partes e nesta ordem:**

1. Corrigir `getDateForDay` em `index.html` para produzir data **local**, não UTC:
   ```js
   const y = target.getFullYear();
   const m = String(target.getMonth() + 1).padStart(2, '0');
   const d = String(target.getDate()).padStart(2, '0');
   return `${y}-${m}-${d}`;
   ```
   Vale auditar as outras ocorrências de `toISOString().split('T')[0]` no projeto —
   o mesmo padrão aparece em `treinador.html` para montar intervalos e para o `today`.
2. Decidir o que fazer com as linhas já gravadas. Duas opções, ambas com custo:
   - **Backfill** usando `weekday` (que é local e confiável) para reconstruir a data
     correta → números históricos do professor mudam, precisa aviso.
   - **Não mexer** → convive-se com critério diferente entre linhas antigas e novas.
     Aceitável se a base atual for pequena, o que parece ser o caso.
3. Só então trocar os filtros de resumo para `session_date`.

> ⚠️ Isso significa que a etapa "corrigir `session_date`" **não é uma troca de filtro,
> é uma correção de escrita + decisão de migração de dados.** Dimensionar como tal.

---

## 2. Métricas para janelas longas

Muda a pergunta que a tela responde:

| Janela | Pergunta que importa |
|---|---|
| Diário / Semanal | "Ele treinou? Fez o que foi prescrito?" |
| Mensal | "O mês foi bom? Melhorou em relação ao anterior?" |
| **Trimestral** | "Está progredindo? O plano está funcionando?" |
| **Semestral** | "A composição corporal mudou? O que mudou junto?" |
| **Anual** | "Vale continuar assim? Qual o padrão dele ao longo do ano?" |

Por isso as métricas de janela longa não são "as mesmas com soma maior". Volume total
de um ano é um número quase inútil isolado; **tendência**, **progressão de carga** e
**consistência** são o que importa.

### 2.1 Já calculável com o banco atual

#### Aderência e consistência

| Métrica | Como calcular | Por que importa |
|---|---|---|
| **Aderência real (%)** | sessões feitas ÷ sessões **prescritas** (ver 1.2) | O único número honesto de frequência |
| **Consistência (semanas verdes)** | nº de semanas do período com aderência ≥ 80% | 70% concentrado em 6 semanas boas + 6 ruins é caso clínico diferente de 70% uniforme. **A média esconde exatamente o que o professor precisa ver** |
| **Maior sequência (streak)** | maior nº de semanas consecutivas batendo a meta | Métrica que mais engaja aluno; ninguém quer quebrar sequência |
| **Sequência atual** | semanas consecutivas até hoje | Gancho de retenção |
| **Dia da semana com mais falta** | agrupar faltas por `weekday` | Resolve com **mudança de agenda**, não com sermão. Achado típico: "sempre falta sexta" |
| **Horário habitual de treino** | moda de `started_at` | Detecta mudança de rotina (mudou de emprego, começou a faltar) |
| **Meses ativos vs meses parados** | (anual) | Sazonalidade: dezembro/janeiro, férias, inverno |

#### Progressão de carga (o coração do relatório longo)

| Métrica | Como calcular | Por que importa |
|---|---|---|
| **e1RM estimado** | Epley: `peso × (1 + reps/30)`, por exercício, por sessão | **Substitui "carga máx"**. Carga máxima bruta sobe e desce só porque as reps mudaram (100kg×5 vs 90kg×10); e1RM normaliza e dá uma curva de força limpa ao longo de meses |
| **Δ carga início → fim do período** | primeira vs última sessão de cada exercício-chave | `Agachamento 80 → 100 kg (+25% no trimestre)`. **É o número que justifica o serviço do professor** |
| **PRs no período** | novos máximos de e1RM por exercício | Conquista concreta, ótimo para o aluno |
| **Tempo desde o último PR** | dias desde o último máximo, por exercício | **Detector de estagnação.** Só aparece em janela longa: "supino sem PR há 14 semanas → trocar estímulo" |
| **Top 5 exercícios por volume** | soma de `weight × reps` (hard) | Mostra onde o treino está concentrado de fato |
| **Exercícios em queda** | e1RM caindo ≥ 2 períodos seguidos | Sinal de fadiga acumulada, lesão silenciosa ou execução piorando |

#### Volume, tempo e eficiência

| Métrica | Como calcular | Por que importa |
|---|---|---|
| **Volume mensal (tendência)** | série de 3/6/12 pontos | Tendência > total. Linha subindo é progressão; serrote é inconsistência |
| **Volume médio por sessão** | volume ÷ sessões | Separa "treinou mais vezes" de "treinou mais forte" |
| **Densidade (kg/min)** | volume ÷ `duration_seconds` | Mesma carga em menos tempo = ganho real de condicionamento. Já existe `workout_sessions.duration_seconds` e ninguém usa isso ainda |
| **Duração média e sua tendência** | média de `duration_seconds` por mês | **Sessões encurtando mês a mês costuma anteceder abandono.** Alerta precoce de churn |
| **Totais do período** | sessões, horas, sets hard, reps, tonelagem | Números de vitrine; motivam o aluno |

#### Qualidade da execução (prescrito × executado)

Isso é diferente de presença: o aluno **vem e pula perna**.

| Métrica | Como calcular | Por que importa |
|---|---|---|
| **Cobertura do plano (%)** | exercícios executados ÷ exercícios prescritos no período | Revela sabotagem seletiva |
| **Exercícios sistematicamente pulados** | prescritos com 0 ou pouquíssimas execuções | Conversa objetiva: dor? vergonha? equipamento ocupado? |
| **Aderência às reps prescritas** | comparar `reps` com `PRESCRIBED_REPS[name][set_number-1]` (já carregado em `treinador.html`) | Aluno que faz 12 onde foi prescrito 6-8 está treinando outra coisa |
| **Sets hard vs aquecimento** | proporção por `set_type` | Aluno que só faz aquecimento aparece com "presença 100%" hoje |

#### Cruzamento com avaliação física (`assessments`)

Aqui está o **maior valor da janela longa**: composição corporal não muda em uma semana.
Trimestre e semestre são exatamente a cadência em que esses números falam.

- Δ peso, Δ % gordura, Δ massa magra, Δ circunferências entre a primeira e a última
  avaliação do período.
- **Volume mensal e massa magra no mesmo gráfico (dois eixos).** É o argumento visual
  mais forte que o professor pode mostrar: "seu volume subiu 30% e sua massa magra
  acompanhou".
- Nº de avaliações feitas no período (o professor está avaliando na frequência que prometeu?).

### 2.2 Dados novos que valem a pena coletar

Ordenados por (valor destravado ÷ esforço).

| Dado | Como coletar | O que destrava |
|---|---|---|
| **RPE da sessão (1-10)** | 1 toque ao encerrar o treino | **O dado que mais falta hoje.** Habilita carga interna (`volume × RPE`), razão volume/esforço e detecção de *overreaching*: volume subindo com RPE subindo desproporcionalmente = risco de lesão/estagnação. Sem isso não há como distinguir progresso de acúmulo de fadiga |
| **Grupo muscular no exercício** | campo novo no `editor.html`, dentro do JSONB do plano | Hoje `workout_logs` só tem `exercise_name` como texto livre — é **impossível** calcular volume por grupo. Destrava: sets semanais por grupo (métrica padrão de prescrição em hipertrofia, faixa de 10-20), balanço empurrar/puxar, superior/inferior, grupos negligenciados |
| **Peso corporal semanal auto-reportado** | 1 campo no app do aluno, opcional | Tendência real de peso em vez de 2 pontos por semestre. Barato e de altíssimo valor no gráfico |
| **Motivo da falta** | 1 toque: viagem / doença / trabalho / sem vontade | Muda completamente a conversa do professor. "5 faltas" vs "5 faltas, 4 por viagem" |
| **Check-in pré-treino** | sono, dor articular, disposição (3 toques) | Explica quedas de performance que hoje parecem preguiça. Correlacionar sono com volume no trimestre |
| **Foto de progresso trimestral** | Supabase Storage (já previsto no `PLANO.md`) | Trimestre é a cadência certa. Comparação lado a lado é o entregável de maior impacto percebido |
| **Cardio / passos** | entrada manual opcional | Contexto para variação de peso |

> Regra ao adicionar coleta: **nunca mais de 2-3 toques a mais no fluxo do aluno.**
> Formulário longo mata o registro do treino, que é o dado que sustenta todo o resto.

### 2.3 Cuidado com o que NÃO mostrar

Curadoria é decisão de produto, não detalhe de UI.

- **Motiva o aluno:** volume total, streak, PRs, Δ carga, horas treinadas, fotos.
- **Desmotiva ou gera ansiedade sem contexto:** % de gordura cru, contagem de faltas,
  "exercícios que você pulou", comparação com outros alunos.

O aluno vê **conquista e tendência**. O **diagnóstico** (estagnação, sabotagem seletiva,
risco de churn) fica no painel do professor. Mesma base de dados, duas curadorias.

---

## 3. Como compartilhar com o aluno

### 3.1 Snapshot publicado, não cálculo ao vivo

Recomendação: uma tabela de relatórios, em vez de recalcular no app do aluno.

```sql
-- sql/11_reports.sql (esboço)
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles(id) on delete cascade,
  coach_id       uuid references public.profiles(id) on delete set null,
  period_type    text not null check (period_type in
                   ('monthly','quarterly','semiannual','annual')),
  period_start   date not null,
  period_end     date not null,
  metrics        jsonb not null default '{}'::jsonb,  -- snapshot congelado
  coach_comment  text,                                -- fala do professor
  published_at   timestamptz,                         -- null = rascunho
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists uq_report_period
  on public.reports (student_id, period_type, period_start);
create index if not exists idx_reports_student
  on public.reports (student_id, period_end desc);
```

Resolve quatro coisas de uma vez:

1. **Número não muda depois.** Relatório fechado é histórico, não recálculo.
2. **O professor comenta.** O texto dele é o que transforma dado em serviço.
3. **Publicação controlada.** `published_at is null` = rascunho; o aluno não vê.
4. **Custo zero no celular do aluno.** Ele lê 1 linha de JSONB, não 5.000 logs.

RLS:

```sql
alter table public.reports enable row level security;

-- aluno: lê só os próprios, e só publicados
create policy "student_read_published_reports" on public.reports
  for select using (student_id = auth.uid() and published_at is not null);

-- professor: CRUD nos relatórios dos seus alunos
create policy "trainer_manage_reports" on public.reports
  for all using (
    exists (select 1 from public.profiles p
            where p.id = reports.student_id and p.coach_id = auth.uid())
  );
```

### 3.2 Três superfícies de entrega

#### a) Aba "Minha evolução" no `index.html`

Mesmos períodos do professor, **conjunto curado** de métricas (ver 2.3). O aluno já tem
login e o RLS já permite ler os próprios dados — custo de infraestrutura zero.

#### b) Fechamento de ciclo (o entregável principal)

No fim de cada trimestre, uma tela dedicada:

- 5-6 números grandes (Δ carga nos principais exercícios, sessões, horas, streak, PRs)
- 1 parágrafo escrito pelo professor (`coach_comment`)
- Fotos do início e do fim do período, lado a lado
- Δ das medidas, se houve avaliação

**É o que faz o aluno sentir que pagou por algo.** Cadência trimestral funciona melhor
que mensal justamente porque em 90 dias o resultado é visível — em 30, muitas vezes não é.

#### c) Saída compartilhável

- **PDF.** O `anamnese.html` já gera PDF. Reaproveitar o mesmo gerador para o relatório
  de período resolve o "manda no WhatsApp" sem código novo relevante.
- **Imagem 1080×1920 (canvas)** tipo "retrospectiva do ano" para story. Custo baixo e
  é **aquisição orgânica de aluno para o professor** — o aluno posta, os amigos veem.

### 3.3 O que evitar

- **Link público com token.** Dado de composição corporal e foto de progresso vazando
  por URL não vale a conveniência. Manter tudo dentro do app autenticado.
- **E-mail automático de fechamento.** Exige cron + Edge Function, sai do "custo R$ 0 /
  sem backend" do `PLANO.md`. Alternativa barata: badge/selo no app quando existe
  relatório novo não lido.
- **Push notification.** Mesmo motivo, e no iOS via PWA é dor de cabeça extra.

---

## 4. Ordem de implementação sugerida

| # | Etapa | Por quê nessa ordem |
|---|---|---|
| 1 | View de rollup diário (`sql/10_daily_rollup.sql`), com o protótipo de e1RM/PR feito antes para decidir se são 1 ou 2 níveis (ver 1.1) | Sem isso as abas novas nascem lentas e depois precisam ser reescritas |
| 2 | Corrigir a escrita de data (`getDateForDay` em `index.html`) + decidir migração + trocar filtros para `session_date` | É correção de escrita, não troca de filtro (ver 1.3). Hoje Diário e Semanal discordam entre si |
| 3 | Aba **Trimestral** no `treinador.html`, **sem** percentual de aderência | **Maior valor real por esforço.** Valida as métricas na prática. Mostrar sessões em absoluto: número ausente é honesto, número errado não |
| 4 | Denominador de aderência a partir dos dias prescritos | **Adiado de propósito** — carrega a decisão de versionar plano (ver 1.2), que é o item de maior risco de virar reforma no `editor.html` |
| 5 | Tabela `reports` + RLS | Base do compartilhamento |
| 6 | Aba "Minha evolução" no `index.html` (curada) | Entrega o valor para o aluno |
| 7 | Fechamento de ciclo + comentário do professor + PDF | O entregável que sustenta a retenção |
| 8 | RPE ao encerrar sessão | Melhor razão valor/esforço entre os dados novos |
| 9 | Grupo muscular no `editor.html` | Destrava a família de métricas por grupo |
| 10 | Abas **Semestral** e **Anual** | Só fazem sentido quando houver 6-12 meses de dados |

> Anual antes de existir um ano de histórico é tela vazia. Deixar por último é
> deliberado, não esquecimento.

### 4.1 Por que infra antes de tela (e o que se perde com isso)

A alternativa seria montar a aba trimestral direto sobre o código atual e só depois
arrumar a fundação. Vale registrar os dois lados, porque a escolha não é óbvia.

**A favor de infra primeiro:**

- **Evita escrever a mesma agregação errada mais três vezes.** `loadWeekly` e
  `loadMonthly` já duplicam volume, presença e comparativo. Com trimestral, semestral e
  anual no mesmo padrão viram 5 cópias, e cada correção depois precisa ser feita em 5
  lugares — com risco de divergirem.
- **Retrabalho garantido no anual.** Trimestral no padrão atual talvez até rode; anual
  são duas queries de ~5 mil linhas (período + comparativo). Constrói, trava, reconstrói.
  O rollup vai ser feito de qualquer jeito; a escolha é antes ou depois de jogar código fora.
- **As abas ficam baratas depois.** Com rollup pronto, trimestral é um laço sobre ~90
  linhas e semestral/anual são o mesmo código com outro intervalo. Custo marginal ≈ 0.
- **Protege a primeira impressão.** Se a estreia da aba mostrar "26 faltas" para um aluno
  de 4x/semana, o professor conclui que a tela está quebrada e não volta. Feature de
  analytics tem uma chance só, e número visivelmente errado contamina os corretos.
- **Melhora o que já está no ar.** As correções consertam semanal e mensal, que o
  professor já usa hoje.

**Contra (custos reais dessa escolha):**

- **Dias de trabalho sem nada novo na tela.** Se o objetivo agora é validar se trimestral
  é útil, é a rota mais lenta até a resposta.
- **Projeta-se a agregação antes de saber quais métricas ficam.** Foi exatamente o que
  aconteceu neste documento: o primeiro esboço de rollup não atendia e1RM nem PR
  (ver 1.1). Construir a tela primeiro teria exposto isso mais cedo.
- **A correção de data virou migração de dados** (ver 1.3), com números históricos
  possivelmente mudando.
- **O denominador tem dependência não resolvida** (versionamento de plano) e é porta
  aberta para scope creep — motivo pelo qual foi movido para a etapa 4.
- **Introduz risco onde hoje funciona.** RLS sobre view é sutil; errar é vazamento
  entre professores.

**Conclusão adotada:** infra primeiro, mas com escopo cortado — rollup + correção de
data antes da tela; aderência percentual **depois** da aba trimestral.

---

## 5. Resumo em uma frase

Janela curta responde "ele treinou"; janela longa tem que responder "ele está
progredindo" — e isso exige **tendência, progressão de carga (e1RM) e consistência**,
calculados no banco e não no celular, com denominador de aderência vindo do plano
prescrito, entregues ao aluno como **relatório publicado e comentado pelo professor**.
