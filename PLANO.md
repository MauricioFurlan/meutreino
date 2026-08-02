# Plano de Reestruturação — App de Treino (SaaS multi-personal)

> **Nome do produto:** ainda não definido. "App de Treino" é um rótulo de trabalho temporário.
> O produto **não** deve carregar o nome de nenhuma academia. A academia onde o aluno treina
> é apenas um dado informado pelo professor no cadastro do aluno (campo `gym_name`).

---

## 0. Progresso (atualizado 2026-08-01)

**Feito e verificado:**
- Backup das tabelas antigas em `backup/` (22 logs de sábado + 3 notas).
- Branch git `feat/saas-multipersonal`.
- **Fase 1 aplicada no Supabase** (via Management API): tabelas legadas removidas; `profiles`,
  `invites`, `workout_plans`, `workout_logs` (novo), `assessments`, `trainer_payments` criadas
  com índices; funções/triggers (`get_my_access`, `handle_new_user`, helpers); **RLS ativo nas 6
  tabelas**. Verificado: colunas ok, funções ok, grant de execução ok.
- **Owner definido:** `mauriciotfurlan@gmail.com` (id `b9e09bc6-a7d2-4d17-8c7a-8287a2ae5f5a`).
- **Auth por Email OTP validada ponta a ponta** (envio → código → verificação → sessão).
- **SMTP próprio configurado** (Brevo) — antecipado, pois o free tier do Supabase trava template
  e só envia para a equipe. Remetente verificado; template "Magic Link" usa `{{ .Token }}` (código).
- **Confirmação de e-mail desligada** no Supabase (fluxo OTP puro).
- **Fase 2 — `login.html`** criado: e-mail + código, sessão persistente, redirecionamento por
  papel (student→index.html, trainer→treinador.html, owner→owner.html), telas de bloqueio
  (`expired`/`unavailable`/`suspended`) usando `get_my_access()`.
- Convite do professor piloto criado: `sankarinknight@gmail.com` (role trainer, 12 meses).

**Pendente:**
- **Migração do treino (script 05):** aguarda o aluno `mauricio.furlan@hotmail.com` logar (cria o
  perfil). Falta também criar o convite do aluno (precisa do professor ter logado antes, para o
  `coach_id`).
- Rotacionar chaves expostas / revisar `RESUMO.md`.
- Teste do login no iPhone (PWA instalado).
- `owner.html` ainda não existe (login de owner redireciona para uma página a construir — Fase 8).
- Demais fases (3 em diante).

> **Segredos:** o Personal Access Token usado para aplicar o SQL é temporário e **deve ser
> revogado** em https://supabase.com/dashboard/account/tokens. Não foi salvo em nenhum arquivo.
> A chave SMTP do Brevo vive só na configuração do Supabase (não versionar).

---

Documento de planejamento da evolução do app de "controle de treino pessoal" para uma
plataforma multi-personal (SaaS), com autenticação, segurança e área de gestão para o professor.

> **Status:** planejamento aprovado. Nada implementado ainda. Este arquivo é a fonte de verdade
> das tarefas. Marque `[x]` conforme concluir.

---

## 1. Visão geral

Hoje é um PWA estático (GitHub Pages) + Supabase, com treino _hardcoded_ no HTML e **sem
segurança** (a `anon key` está exposta e não há Row Level Security — qualquer um lê/edita tudo).

O objetivo é transformar em um produto vendável para vários personais, mantendo **custo R$ 0**
e sem manter servidor próprio.

### Princípios

- **Custo zero:** Supabase free tier + GitHub Pages + (futuro) SMTP Resend free tier.
- **Sem backend próprio:** tudo em HTML estático + Supabase (banco, auth, e-mail). SMTP é só
  configuração. Nenhuma Edge Function.
- **Mobile-first:** foco total em usabilidade no celular.
- **Preservar a UX do `index.html`** do aluno, alimentando-a com dados do banco.
- **Segurança no banco, não no front:** regras viram políticas RLS e funções no Postgres.

### Stack final

| Camada | Tecnologia | Custo |
|---|---|---|
| Front | HTML estático (GitHub Pages) | R$ 0 |
| Banco + Auth + E-mail | Supabase (free tier) | R$ 0 |
| Envio de e-mail (ao escalar) | Resend via SMTP (config no Supabase) | R$ 0 (3k/mês) |

---

## 2. Modelo de acesso (3 níveis)

```
DONO (você)  → controla e suspende PROFESSORES (cobrança da mensalidade)
   └─ PROFESSOR → cria, renova, desativa e reativa seus ALUNOS
        └─ ALUNO → usa o app de treino
```

- Sempre **um professor por aluno**.
- **Suspensão em cascata:** professor suspenso → todos os alunos dele perdem acesso.
- **Prazo de acompanhamento:** ao criar o aluno, o professor informa a duração (nº de meses).
  Após `access_expires_at`, o acesso do aluno é **bloqueado automaticamente**.
- **Renovação:** professor define nova data de expiração (não recria nada, não perde histórico).
- **Desativação = soft delete:** dados são preservados; reativar restaura o acesso.

### Estados de acesso e mensagens (regra sensível)

O aluno **nunca** pode descobrir que o bloqueio é por falta de pagamento do professor.
O app do aluno chama uma função no banco que devolve **apenas** um estado seguro:

| Estado | Motivo real | Mensagem exibida ao aluno |
|---|---|---|
| `active` | Tudo certo | (usa o app normalmente) |
| `expired` | Período de acompanhamento terminou | "Seu período de acompanhamento terminou. Fale com seu personal para renovar." |
| `unavailable` | Professor desativou o aluno **OU** professor suspenso por falta de pagamento | "Acesso indisponível no momento. Fale com seu personal." |

Os dois motivos sensíveis **colapsam** em `unavailable` → indistinguíveis para o aluno.
O professor suspenso vê mensagem própria: *"Seu acesso está suspenso. Entre em contato para regularizar."*

---

## 3. Autenticação

- **Email OTP nativo do Supabase** (código de 6 dígitos por e-mail). **Sem** Edge Function.
- **Sem senha** → baixa fricção (aluno digita o código uma vez; sessão dura meses e se renova).
- **Não usar link mágico clicável** por causa da pegadinha do iOS (PWA instalado tem storage
  isolado do Safari). Código digitado **dentro do app instalado** evita o problema.
- **SMS não** (é pago). Só e-mail.
- **Vínculo aluno↔professor:** professor cadastra o e-mail do aluno numa tabela `invites`
  (simples insert). Quando o aluno entra pela 1ª vez via OTP, um **trigger** no banco cria o
  perfil dele com `role=student` e o `coach_id` correto.
- **Provisionamento por papel (mesma engrenagem de convite):**
  - **Aluno** é provisionado pelo **professor** (`role=student`, com `coach_id`).
  - **Professor** é provisionado por **você (owner)** no `owner.html`, **após o pagamento**
    (`role=trainer`, `coach_id` nulo, com `access_expires_at` = fim do período pago).
  - **Owner** é você (definido manualmente no banco na configuração inicial).
- **Login único para todos:** uma só tela de login (e-mail + código OTP). O sistema lê o
  `role` do perfil e **redireciona sozinho** — o usuário não escolhe "sou aluno/professor".
- **Envio de e-mail:** começa no serviço nativo do Supabase (limitado, ~2/h — ok para testes).
  Ao ganhar clientes, plugar **SMTP do Resend** (só configuração no painel).

---

## 4. Modelo de dados

**Estratégia híbrida (chave da performance):**
- Treino prescrito → **JSONB** (1 linha por aluno): carrega/edita/renderiza o dia inteiro numa
  leitura só. Espelha o objeto `WORKOUT` atual.
- Registros de execução (logs) → **tabelas relacionais indexadas**: alimentam gráficos e histórico.
- Avaliações → **JSONB** (campos flexíveis, editáveis no futuro sem migração).

### Tabelas

```sql
-- Perfis (espelha auth.users)
profiles
  id            uuid PK  → auth.users(id)
  role          text     -- 'owner' | 'trainer' | 'student'
  full_name     text
  coach_id      uuid     -- (aluno) qual professor é dono
  gym_name      text     -- (aluno) academia onde treina (informado pelo professor)
  status        text     -- 'active' | 'suspended'
  access_starts_at   date   -- (aluno E professor)
  access_expires_at  date   -- bloqueio automático após esta data (aluno E professor)
  created_at    timestamptz
  índice: (coach_id, status)
```

> **Expiração simétrica:** professor também tem `access_starts_at`/`access_expires_at`. É a
> mensalidade que ele paga a você. Passou da data → professor bloqueado automaticamente e alunos
> dele em cascata (mesmo que você esqueça de suspender). Renovar = estender a data via pagamento.

```sql
-- Ledger de mensalidades dos professores (controle de pagamento — só o owner acessa)
trainer_payments
  id            uuid PK
  trainer_id    uuid → profiles(id)
  amount        numeric      -- valor pago
  paid_at       date
  period_start  date
  period_end    date         -- estende o access_expires_at do professor
  method        text         -- 'pix' | 'dinheiro' | ...
  note          text
  created_at    timestamptz
  índice: (trainer_id, paid_at desc)

-- Convites (vínculo aluno↔professor antes do 1º login)
invites
  id            uuid PK
  email         text
  coach_id      uuid → profiles(id)
  months        int      -- duração para calcular access_expires_at
  redeemed      bool
  created_at    timestamptz
  índice único: (email) onde redeemed = false

-- Treino prescrito (1 ativo por aluno)
workout_plans
  id            uuid PK
  student_id    uuid → profiles(id)
  coach_id      uuid → profiles(id)
  title         text
  structure     jsonb    -- { "Segunda": [ {name, video_url, note, sets:[{type,reps,note}]}... ] }
  is_active     bool
  updated_at    timestamptz
  índice: (student_id, is_active)

-- Execução real (alimenta gráficos)
workout_logs
  id            uuid PK
  student_id    uuid → profiles(id)
  session_date  date
  weekday       text
  exercise_name text     -- DENORMALIZADO de propósito (histórico não quebra se o plano mudar)
  set_number    int
  set_type      text     -- 'aquec' | 'feeder' | 'hard'
  weight        numeric
  reps          int
  created_at    timestamptz
  índices: (student_id, session_date), (student_id, exercise_name, created_at desc)

-- Anamnese / avaliação física (evolução entre datas)
assessments
  id            uuid PK
  student_id    uuid → profiles(id)
  coach_id      uuid → profiles(id)
  assessment_date date
  data          jsonb    -- medidas + saúde + obs (+ URLs de foto no futuro)
  created_at    timestamptz
  índice: (student_id, assessment_date)
```

### Campos padrão da anamnese (`assessments.data`, editáveis no futuro)

- **Gerais:** objetivo, idade
- **Antropometria:** peso, altura, IMC (calculado)
- **Circunferências (cm):** cintura, abdômen, quadril, braço relaxado, braço contraído, coxa, panturrilha, tórax
- **Dobras cutâneas (mm):** tríceps, subescapular, suprailíaca, abdominal, coxa, peitoral (Pollock)
- **Composição:** % gordura, massa magra, massa gorda
- **Saúde (PAR-Q):** lesões, cirurgias, dores, medicamentos, restrições, nível de atividade
- **Observações livres**

### Decisões de performance/escalabilidade

1. `exercise_name` **denormalizado** no log → histórico estável mesmo se o treino mudar.
2. Plano em **JSONB** (leitura única para render) + logs **relacionais** (query indexada p/ gráfico).
3. Índices por `(student_id, ...)` → cada personal escala isolado.

---

## 5. Segurança (RLS) — resumo das políticas

- **RLS ligado em todas as tabelas.** A `anon key` exposta passa a ser segura.
- **owner:** lê tudo; pode alterar `status` de professores.
- **trainer_payments:** somente o **owner** lê e escreve (ledger de mensalidades).
- **trainer:** CRUD nos próprios alunos, planos, avaliações, convites; **somente leitura** nos
  logs dos seus alunos; **bloqueado se `status='suspended'`**.
- **student:** lê o próprio plano/avaliações; escreve os próprios logs; **bloqueado se ele OU o
  professor dele estiver suspenso/expirado**.
- **Função `get_my_access()`** (SECURITY DEFINER): devolve só `active|expired|unavailable`,
  fundindo os motivos sensíveis. O front do aluno não consegue ler o status de pagamento do professor.

### 5.1 Segurança do front e proteção de sessão

- **HTTPS (GitHub Pages)** protege os dados **em trânsito** (rede/WiFi), mas **não** protege o
  token guardado no `localStorage` do aparelho. São ameaças diferentes.
- **Ameaça principal: XSS.** Como o app renderiza conteúdo do professor, um `<script>` injetado
  num nome/nota rodaria no navegador do aluno e poderia roubar a sessão. Mitigação → **escapar
  todo conteúdo dinâmico** (nada de `innerHTML` cru) + **CSP** via `<meta>`. Ver Fase 8.5.
- **Tokens curtos + rotação:** o access token do Supabase expira rápido (~1h) e o refresh token
  gira a cada uso (detecta reuso). Token roubado tem janela curta.
- **RLS limita o estrago:** mesmo com sessão roubada, só se acessa os dados daquele aluno
  (baixa sensibilidade); não há pivô para outros alunos ou para o professor.
- **Compartilhar a URL não dá acesso:** a sessão vive no aparelho (localStorage), nunca na URL.
  Sem login (e-mail + código OTP) não se entra. Escolhemos **código OTP** e **não** link mágico
  clicável justamente para não existir um "link que loga sozinho".
- **Proteção "perfeita" (cookie httpOnly)** exigiria backend → descartada de propósito para
  manter custo zero e simplicidade. Escape + CSP + tokens curtos + RLS é o equilíbrio adotado.
- **Tudo isto é grátis e sem backend:** escape e CSP são código/markup no HTML; tokens e RLS
  são recursos nativos do Supabase.

---

## 6. Telas

- **`login.html`** — **tela única** para todos: e-mail + código OTP. Lê o `role` e redireciona
  (aluno → `index.html`, professor → app do professor, owner → `owner.html`).
- **`index.html` (aluno)** — mantém a UX atual; carrega o plano do banco (fim do `WORKOUT` hardcoded);
  registra logs; respeita o estado de acesso (`active/expired/unavailable`).
- **App do professor** (evolução do `treinador.html`), com áreas:
  - **Alunos:** lista, criar, desativar/reativar, renovar prazo, seletor de aluno ativo.
  - **Acessos:** alunos vencendo (~7 dias) e vencidos.
  - **Acompanhar:** gráficos e resumos (consulta — já existe).
  - **Editar treino:** título, dias, exercícios, sets, reps, vídeo, notas (mobile-first: accordion por dia).
  - **Anamnese:** cadastrar avaliações + gráficos de evolução entre datas.
- **`owner.html` (dono)** — provisionar professores (após pagamento), registrar mensalidades
  (`trainer_payments`), renovar prazo, ligar/desligar acesso, e ver professores vencendo/vencidos.

---

## 7. Tarefas de implementação

### Fase 0 — Preparação
- [ ] Fazer backup dos dados atuais do Supabase (export das 3 tabelas existentes).
- [ ] Criar branch de desenvolvimento no Git para não quebrar a versão publicada.
- [ ] Rotacionar/confirmar a `anon key` e revisar chaves expostas no `RESUMO.md`.

### Fase 1 — Fundação: banco + segurança
- [ ] Criar tabela `profiles` (com `role`, `status`, `coach_id`, `access_*`).
- [ ] Criar tabela `invites`.
- [ ] Criar tabela `workout_plans` (JSONB).
- [ ] Recriar `workout_logs` no novo formato (com `student_id` e índices).
- [ ] Criar tabela `assessments`.
- [ ] Criar tabela `trainer_payments` (ledger de mensalidades — acesso só do owner).
- [ ] Definir o usuário `owner` (você) manualmente no banco.
- [ ] Criar índices de todas as tabelas.
- [ ] Migrar o treino atual (objeto `WORKOUT`) para um registro em `workout_plans`.
- [ ] Migrar os logs existentes para o novo `workout_logs` vinculados ao aluno-piloto (você).
- [ ] Ligar **RLS** em todas as tabelas.
- [ ] Escrever políticas RLS (owner / trainer / student) com gating de `status` e expiração.
- [ ] Criar função `get_my_access()` (SECURITY DEFINER) com estados seguros.
- [ ] Criar trigger de vínculo `invites → profiles` no 1º login do aluno.
- [ ] Testar RLS: aluno A não acessa dados de aluno B; professor não vê alunos de outro professor.

### Fase 2 — Autenticação
- [ ] Habilitar Email OTP no Supabase (desabilitar magic link clicável / confirmar template do código).
- [ ] Criar `login.html` **único** (e-mail → código → sessão), com tratamento de erro e reenvio.
- [ ] Redirecionar por `role` após login (student / trainer / owner).
- [ ] Persistir sessão no PWA (permanecer logado por meses).
- [ ] Bloquear telas conforme `get_my_access()` com as mensagens sanitizadas.
- [ ] Testar fluxo completo no iPhone (instalar PWA → digitar código dentro do app).

### Fase 3 — App do aluno lê do banco
- [ ] Remover `WORKOUT` hardcoded do `index.html`.
- [ ] Carregar `structure` do `workout_plans` ativo do aluno e renderizar (mesmo visual).
- [ ] Adaptar salvamento de logs para incluir `student_id` e `session_date`.
- [ ] Ler vídeos e notas de dentro da `structure` (fim das tabelas `trainer_notes`/`exercise_videos`).
- [ ] Exibir título do treino vindo do banco.
- [ ] Tela de bloqueio (`expired` / `unavailable`) com as mensagens corretas.

### Fase 4 — App do professor: gestão de alunos
- [ ] Tela de lista de alunos do professor logado.
- [ ] Criar aluno: nome + e-mail + academia (`gym_name`) + duração (meses) → cria `invite` e calcula `access_expires_at`.
- [ ] Desativar aluno (soft delete) e reativar.
- [ ] Renovar prazo (nova `access_expires_at`).
- [ ] Seletor de "aluno em foco" (persistido) para as demais áreas.
- [ ] Seção **Acessos:** alunos vencendo em ~7 dias e vencidos.

### Fase 5 — App do professor: editor de treino
- [ ] UI mobile-first para editar a `structure` (accordion por dia da semana).
- [ ] CRUD de exercícios (nome, ordem, vídeo, nota).
- [ ] CRUD de sets (tipo aquec/feeder/hard, reps prescritas, nota).
- [ ] Editar o título do treino.
- [ ] Salvar como novo plano ativo (desativa o anterior).
- [ ] Validação e feedback de salvamento.

### Fase 6 — Anamnese e evolução
- [ ] Formulário de avaliação com os campos padrão (JSONB).
- [ ] Listar avaliações por aluno (linha do tempo).
- [ ] Gráficos de evolução entre avaliações (Chart.js) por métrica escolhida.
- [ ] IMC calculado automaticamente.

### Fase 7 — Acompanhamento por aluno (migrar consulta atual)
- [ ] Adaptar `treinador.html` (diário/semanal/mensal + gráficos) para filtrar por `student_id`.
- [ ] Garantir ordem dos exercícios conforme o plano prescrito do aluno.

### Fase 8 — Painel do dono
- [ ] `owner.html`: listar professores.
- [ ] Provisionar professor: nome + e-mail + duração paga → cria convite `role=trainer` e define `access_expires_at`.
- [ ] Registrar mensalidade em `trainer_payments` (estende o `access_expires_at` do professor).
- [ ] Renovar prazo / ligar-desligar (`status`) de cada professor (controle da mensalidade).
- [ ] Seção de professores **vencendo (~7 dias)** e **vencidos** (bloqueio automático).
- [ ] Confirmar cascata: suspender/vencer professor bloqueia os alunos dele com mensagem genérica.

### Fase 8.5 — Hardening de segurança do front (XSS / CSP)
> O novo desenho renderiza conteúdo fornecido pelo professor (nome de exercício, título,
> notas). Sem tratamento, um `<script>` injetado nesses campos rodaria no navegador do aluno
> e poderia roubar a sessão do localStorage. Esta fase fecha essa porta. Tudo grátis, sem backend.
- [ ] Substituir `innerHTML` por `textContent` (ou escapar HTML) em todo conteúdo vindo do banco.
- [ ] Criar helper de escape e aplicar em nomes de exercício, títulos, notas e observações.
- [ ] Auditar o `index.html` atual (usa bastante `innerHTML`) e corrigir os pontos de injeção.
- [ ] Adicionar CSP via `<meta http-equiv="Content-Security-Policy">` em todas as telas
      (restringir `script-src` a self + Supabase/Chart.js; `connect-src` só ao Supabase).
- [ ] Confirmar que access token é curto e que a rotação de refresh token está ativa no Supabase.
- [ ] Testar: exercício com `<script>` no nome NÃO executa e aparece como texto literal.

### Fase 9 — PWA e polimento mobile
- [ ] Atualizar `manifest.json` / `sw.js` para as novas telas e rotas.
- [ ] Revisar cache do service worker (não cachear respostas autenticadas do Supabase).
- [ ] Ajustes finais de usabilidade no celular (toques, teclado, anti-zoom iOS).
- [ ] Testar instalação e sessão persistente em iPhone e Android.

### Fase 10 — Preparado para o futuro (não implementar agora)
- [ ] Fotos de progresso (aluno envia / professor vê) via Supabase Storage (schema já prevê URLs).
- [ ] SMTP Resend quando o volume de e-mails crescer.
- [ ] Notificação por e-mail de vencimento (além do banner in-app).
- [ ] Cobrança automatizada do professor (gateway) — só quando houver volume.

---

## 8. Riscos e pontos de atenção

- **iOS PWA + sessão:** validar cedo (Fase 2) que a sessão persiste no app instalado.
- **Limite de e-mail do Supabase (~2/h):** ok em teste; plugar Resend antes de vender.
- **Migração de dados:** preservar o histórico atual ao mudar o schema de `workout_logs`.
- **Vazamento de motivo de bloqueio:** garantir que só `get_my_access()` exponha estado ao aluno.
- **XSS via conteúdo do professor:** o novo modelo renderiza texto de terceiros; escapar tudo +
  CSP é obrigatório antes de ir a produção (Fase 8.5). Sem isso, risco de roubo de sessão.
- **Chaves no `RESUMO.md`:** não versionar segredos sensíveis; revisar antes de commitar.
