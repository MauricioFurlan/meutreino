# SQL de fundação — App de Treino (Fase 1)

Scripts para montar o banco multi-personal no Supabase, com segurança (RLS) e migração
do seu treino atual. Rode tudo pelo **SQL Editor** do painel do Supabase
(https://supabase.com/dashboard → seu projeto → **SQL Editor**).

> O SQL Editor roda como administrador e **ignora o RLS** — por isso a migração/seed funcionam
> mesmo com as políticas ligadas.

---

## O que ativar no painel do Supabase (além dos SQLs)

Isso é o que você precisa **habilitar/configurar** no dashboard:

1. **Authentication → Providers → Email:** deixe o provedor **Email** habilitado.
2. **Login por CÓDIGO (OTP) e não por link mágico:**
   - Vá em **Authentication → Emails → Templates → "Magic Link"**.
   - No corpo do template, use o token numérico em vez do link. Inclua `{{ .Token }}`
     (ex: “Seu código de acesso é: **{{ .Token }}**”). É isso que faz o e-mail chegar como
     um código de 6 dígitos para digitar dentro do app (resolve a pegadinha do iPhone).
3. **Authentication → Providers → Email → "Allow new users to sign up":** deixe **ligado**.
   - Necessário porque o aluno/professor convidado é um usuário novo. Quem controla o acesso
     é o **trigger de convite** + RLS: sem convite, o login cria a conta mas **não gera perfil**
     e a pessoa não enxerga nada.
4. **(Opcional, segurança) Authentication → Sessions/Advanced:** reduzir o **OTP expiry**
   (padrão 3600s) para ~600s (10 min).
5. **(Opcional) Authentication → URL Configuration:** coloque o **Site URL** =
   `https://mauriciofurlan.github.io/meutreino/`.
6. **SMTP próprio (Resend):** só quando for escalar. **Authentication → Emails → SMTP Settings**
   → colar host/porta/usuário/senha do Resend. É só configuração, **sem backend**. Não precisa agora.

Nada de SMS (é pago). Nada de Edge Function.

---

## Ordem de execução dos scripts

| Ordem | Arquivo | O que faz | Quando rodar |
|------|---------|-----------|--------------|
| 1 | `01_schema.sql` | Tabelas + índices | Agora |
| 2 | `02_functions_triggers.sql` | Helpers, `get_my_access()`, trigger de convite, `updated_at` | Agora |
| 3 | `03_rls.sql` | Liga RLS + todas as políticas | Agora |
| 4 | `04_seed_owner.sql` | Promove **você** a `owner` | **Após seu 1º login por OTP** |
| 5 | `05_migrate_workout.sql` | Migra treino (JSONB) + logs de hoje | **Após o aluno logar** (ver abaixo) |

---

## Passo a passo completo

1. **Rode `01` → `02` → `03`** no SQL Editor, nesta ordem. (Podem ser reexecutados sem quebrar.)
2. **Configure o painel** conforme a seção acima (Email OTP com `{{ .Token }}`).
3. **Faça seu 1º login** (quando o `login.html` existir — Fase 2). Isso cria sua linha em `auth.users`.
4. **Edite e rode `04_seed_owner.sql`** trocando `SEU-EMAIL@EXEMPLO.COM` pelo seu e-mail →
   você vira `owner`.
5. **Provisione o piloto** para migrar seu treino real:
   - Como o modelo é 1 professor por aluno, e você é o `owner`, use um **e-mail separado** para
     testar o papel de aluno (dica: aliases do Gmail funcionam, ex: `voce+aluno@gmail.com`).
   - Crie um **convite de professor** (o seu professor) e um **convite de aluno** (esse e-mail
     de teste), cada um fazendo login por OTP para materializar os perfis.
     *(Enquanto o app de owner/professor não existe — Fases 4/8 — dá para inserir os convites
     direto por SQL; me peça que eu gero esse insert.)*
6. **Edite e rode `05_migrate_workout.sql`** trocando `ALUNO@EXEMPLO.COM` pelo e-mail do aluno →
   migra o treino prescrito (com a nota do treinador) e os 22 registros de hoje.

---

## Regerar a migração

O `05_migrate_workout.sql` é **gerado** por `../build_migration.mjs` a partir do treino e do
`../backup/workout_logs.json`. Para regerar (ex: após novo backup):

```bash
node ../build_migration.mjs
```

---

## Verificações rápidas (rode no SQL Editor)

```sql
-- perfis existentes
select id, role, full_name, email, status, access_expires_at from public.profiles;

-- estado de acesso do usuário logado (deve refletir a regra segura)
select public.get_my_access();

-- plano ativo do aluno
select title, jsonb_object_keys(structure) as dia from public.workout_plans where is_active;

-- quantidade de logs migrados
select count(*) from public.workout_logs;
```
