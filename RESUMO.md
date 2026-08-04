# Meu Treino - Resumo do Projeto

## Repositório
- **Local:** `C:\Users\mauri\OneDrive\Área de Trabalho\empty\meutreino`
- **GitHub:** `MauricioFurlan/meutreino` (público, GitHub Pages ativo)
- **URL do app:** `https://mauriciofurlan.github.io/meutreino/`
- **URL do treinador:** `https://mauriciofurlan.github.io/meutreino/treinador.html`

## Arquivos
- `login.html` — login por e-mail + OTP, redireciona por papel
- `index.html` — app do aluno (PWA, registra treino)
- `professor.html` — gestão de alunos do professor
- `treinos.html` — histórico de treinos do aluno (listar, ativar/desativar, ver, duplicar, excluir)
- `editor.html` — montar/editar um treino (+ importar treino de outro aluno)
- `anamnese.html` — avaliação física (formulário, histórico, gráficos, PDF)
- `treinador.html` — acompanhamento do aluno (gráficos, resumo semanal/mensal)
- `owner.html` — painel do dono (professores, pagamentos, limites)
- `auth-guard.js` — guarda de sessão/papel/acesso usada por todas as páginas
- `manifest.json` — configuração PWA
- `sw.js` — service worker (cache network-first)
- `icon-192.svg` / `icon-512.svg` — ícones da PWA
- `seed.js` — script de dados fictícios (não commitado, dados já apagados)
- `diet.md` — descrição original do treino

## Supabase
- **URL:** `https://qslvwyhpamazoqhcmqan.supabase.co`
- **Anon/Publishable Key:** `sb_publishable_lTQKzQJc5uq7LNq-N1UvRg_w3aF_7zH` (pública; segura porque o RLS está ativo)
- **Auth:** Email OTP (código de 6 dígitos), sem senha. Confirmação de e-mail desligada.
- **E-mail:** SMTP próprio via **Brevo** (config no Supabase; remetente `mauriciotfurlan@gmail.com` verificado).
  Template "Magic Link" usa `{{ .Token }}`. (A chave SMTP NÃO fica versionada — só na config do Supabase.)
- **Owner:** `mauriciotfurlan@gmail.com` (id `b9e09bc6-a7d2-4d17-8c7a-8287a2ae5f5a`).

> ⚠️ Reestruturação em andamento — ver `PLANO.md` (fonte de verdade) e `sql/` (scripts de fundação).

### Tabelas (novo schema multi-personal, com RLS)
- `profiles` — usuários (owner/trainer/student), papel, coach_id, gym_name, status, prazos de acesso
- `invites` — convites (e-mail→papel/professor) resgatados no 1º login por OTP (trigger)
- `workout_plans` — treino prescrito por aluno em **JSONB** (título, dias, exercícios, sets, vídeo, notas)
- `workout_logs` — execução real (student_id, session_date, exercise_name denormalizado, indexado)
- `assessments` — anamnese/avaliação física em JSONB (evolução entre datas)
- `trainer_payments` — ledger de mensalidades dos professores (só o owner acessa)

> Tabelas antigas (`workout_logs` v1, `trainer_notes`, `exercise_videos`) foram removidas após backup
> em `backup/`. Notas/vídeos agora vivem dentro da estrutura JSONB do plano.

## Funcionalidades implementadas

### App do aluno (index.html)
- Tabs por dia da semana (fixas no topo ao scrollar)
- Inputs de carga/reps com sufixo "kg" e "reps"
- Check automático ao salvar
- Fantasma do último treino nos placeholders
- Histórico em modal (últimas 4 semanas)
- Notas do treinador (❗ por exercício ou set específico)
- Link de vídeo no nome do exercício (▶)
- PWA instalável no iPhone
- Aceita 0 como valor válido
- Anti-zoom iOS (font-size 16px)

### Página do treinador (treinador.html)
- Toggle: Diário / Semanal / Mensal
- Diário: dados do dia com reps recomendadas entre parênteses
- Semanal: presença, volume por dia, comparativo vs semana anterior
- Mensal: calendário de presença, volume por semana, destaques, comparativo
- Gráficos de evolução (volume + carga máx) com Chart.js
- Indicador de frequência por exercício
- Edição de notas por exercício ou set
- Definição de links de vídeo por exercício
- Ordem dos exercícios igual ao treino prescrito

### Treinos do aluno (treinos.html + editor.html)
- `professor.html` → botão **🏋️ Treinos** abre `treinos.html?aluno=<id>` (histórico do aluno)
- Histórico: um card por treino com título, período, nº de exercícios, dias e data de criação
- **Toggle por treino** = "ativo para o aluno". Só 1 ativo por aluno (índice único no banco):
  ao ligar um, os outros são desativados; ao desligar, o aluno fica sem ficha
- Ações por treino: 👁 Ver (somente leitura), ✏️ Editar, 📋 Duplicar (cria cópia inativa), × Excluir
  (excluir o plano **não** apaga `workout_logs` — o histórico de execução é preservado)
- `editor.html?aluno=<id>` cria treino novo; `editor.html?plan=<id>` edita um existente
  (editar faz UPDATE na mesma linha, então o histórico não enche de duplicatas)
- Toggle "Enviar para o aluno" dentro do editor, com aviso de qual treino será substituído
- **Importar treino de outro aluno:** botão no editor (ou `&importar=1`) abre modal em 3 passos —
  escolher aluno (exclui o aluno alvo e quem não tem treino) → escolher treino → revisar e confirmar.
  Copia apenas a prescrição (título, exercícios, sets, vídeos, notas, bisets); **nenhum registro
  de execução é copiado**. O treino cai no editor para revisão antes de salvar.

## Paleta de cores
- Fundo: `#0d0d0d`
- Cards/header: `#1a1a1a`
- Destaque: `#f5c518` (amarelo/dourado)
- Texto: `#fff` / `#f0f0f0`
- Bordas: `#333`

## Deploy
- GitHub Pages: "Deploy from a branch" → main → / (root)
- Cada push na main atualiza automaticamente (~1-2 min)
