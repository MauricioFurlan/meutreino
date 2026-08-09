# Roadmap SaaS — MeuTreino

> Análise do estado atual do app e tudo que precisa ser feito para transformá-lo em um SaaS comercial, na ordem de prioridade.

---

## Estado atual — O que já está pronto

O app tem uma base sólida. Muita coisa que trava outros projetos já está resolvida:

- **Multi-tenant real no banco**: cada aluno pertence a um professor (`coach_id`), RLS isola os dados por papel e por dono. Um professor não acessa dados de outro.
- **Hierarquia de papéis funcional**: `owner > trainer > student`, cada um com sua tela e permissões distintas.
- **Controle de acesso por prazo**: `access_expires_at` bloqueia alunos e professores automaticamente quando o período vence.
- **Convite por e-mail**: professor convida aluno, aluno faz login e o perfil é criado automaticamente via trigger.
- **Autenticação sem senha (OTP)**: menos atrito, menos suporte, sem "esqueci minha senha".
- **PWA instalável**: funciona como app no iOS e Android sem App Store.
- **Painel do owner**: gerencia professores, registra pagamentos, vê alertas de vencimento.

**Resumo honesto**: a arquitetura é a de um SaaS. O que falta é a camada comercial e de operação.

---

## Problemas críticos para resolver ANTES de cobrar

Esses itens precisam estar prontos antes de qualquer cliente pagar. São bloqueadores.

---

### 1. 🔴 Chave do Supabase exposta no código-fonte

**Problema**: A `SUPABASE_KEY` e a URL estão em texto claro em `login.html` e `auth-guard.js`, visíveis para qualquer pessoa que abrir o "Ver código-fonte" do navegador.

**Risco real**: A chave `anon` do Supabase é pública por design (o RLS protege o banco), mas a URL do projeto identifica seu tenant Supabase e pode ser usada para ataques de força bruta, scraping ou abuso da API. Além disso, se um dia você precisar rotacionar a chave, precisará alterar todos os arquivos.

**O que fazer**:
- Mover as credenciais para variáveis de ambiente usando um processo de build (Vite, Parcel, ou mesmo um `.env` processado).
- Usar uma plataforma de hosting com suporte a env vars (Vercel, Netlify, Cloudflare Pages) em vez de servir arquivos estáticos diretamente do GitHub Pages.
- No Supabase, configurar **Allowed Origins** para aceitar requisições só do seu domínio.

---

### 2. 🔴 Hospedagem no GitHub Pages não é adequada para SaaS

**Problema**: O app está servido em `/meutreino/` num repositório GitHub. O `manifest.json` e o `sw.js` têm caminhos hardcoded com `/meutreino/`, o nome do app é genérico ("Treino"), e não há domínio próprio.

**Risco real**: Você não controla a disponibilidade, não tem SSL customizado, não tem CDN adequada, e a URL `github.io/meutreino` não passa profissionalismo para clientes pagantes.

**O que fazer**:
- Registrar um domínio (ex: `meutreino.app`, `treinoapp.com.br`).
- Fazer deploy em Vercel, Netlify ou Cloudflare Pages (grátis para o volume inicial, com env vars e SSL automático).
- Atualizar `manifest.json` com o domínio final e nome de produto.
- Atualizar `sw.js` para usar caminhos relativos ou o domínio correto.

---

### 3. 🔴 Sem fluxo de pagamento integrado

**Problema**: O owner registra pagamentos de professores manualmente na tela. Não há como um professor se cadastrar e pagar sozinho.

**Risco real**: Com mais de 3-4 professores, a operação manual vira um gargalo. Você vai perder receita por esquecer de cobrar e gastar tempo com controle que poderia ser automático.

**O que fazer (opções em ordem de esforço)**:
- **Mínimo viável**: Integrar link de pagamento do Stripe ou Mercado Pago no e-mail de convite ao professor. O owner confirma manualmente após ver o pagamento — ainda manual, mas centralizado.
- **Automático**: Criar um webhook no Stripe/MP que, ao confirmar pagamento, chama uma Edge Function do Supabase para estender o `access_expires_at` do professor automaticamente.
- **Self-service**: Professor se cadastra, escolhe plano, paga e já entra — sem intervenção do owner.

A recomendação é começar pelo mínimo viável e evoluir conforme a demanda.

---

### 4. 🟡 Sem e-mail transacional configurado

**Problema**: Os e-mails de OTP (código de acesso) são enviados pelo próprio Supabase, que usa um domínio genérico. O e-mail de convite ao aluno é enviado manualmente (o professor copia e manda).

**Risco real**: E-mails de domínio genérico caem em spam. Sem e-mail próprio, você não tem como mandar notificações de vencimento, boas-vindas, ou recibos de pagamento.

**O que fazer**:
- Configurar um provedor SMTP no Supabase (Resend, SendGrid, Postmark) com seu domínio.
- Criar template de e-mail de boas-vindas para o aluno no 1º login.
- Criar e-mail automático de aviso 7 dias antes do vencimento do aluno.

---

### 5. 🟡 Nome, identidade visual e domínio genéricos

**Problema**: O app se chama "Treino" no manifest, nos títulos das páginas e no ícone SVG. Não tem logo real, não tem nome de produto definido.

**O que fazer**:
- Definir o nome do produto.
- Criar logo/ícone PNG (192x192 e 512x512) — o iOS e Android não renderizam SVG corretamente como ícone de app instalado.
- Atualizar todos os `<title>`, `manifest.json`, e telas de loading.

---

## O que construir depois (crescimento)

Esses itens não bloqueiam o lançamento, mas são necessários para escalar.

---

### 6. Página de marketing / landing page

Hoje o app não tem página pública. Professores em potencial precisam de uma página que explique o produto, mostre o preço e tenha um botão de "Começar". Sem isso, a aquisição de novos professores depende 100% de indicação direta.

**O que fazer**:
- Criar uma página simples (`/`) separada do app com: proposta de valor, prints de tela, preço, e CTA de cadastro.
- Pode ser uma página estática em HTML ou usar uma ferramenta como Framer, Webflow.

---

### 7. Self-service de cadastro para o professor

Hoje o professor só entra se o owner convidar. Isso não escala.

**O que fazer**:
- Criar um fluxo onde o professor acessa a landing page, informa e-mail, escolhe plano e paga.
- Após confirmação do pagamento, o sistema cria o convite e envia o acesso automaticamente.
- O owner continua podendo ver e gerenciar todos os professores no painel.

---

### 8. Planos e limites por tier

Hoje todos os professores têm as mesmas funcionalidades sem limite de alunos.

**Sugestão de estrutura**:
| Plano | Alunos | Preço sugerido |
|-------|--------|----------------|
| Starter | até 10 alunos | R$ 39/mês |
| Pro | até 30 alunos | R$ 79/mês |
| Ilimitado | sem limite | R$ 149/mês |

**O que fazer no banco**:
- Adicionar coluna `plan` e `student_limit` em `profiles` do trainer.
- Criar função que bloqueia o convite de novo aluno se o limite foi atingido.

---

### 9. Dashboard de métricas para o professor

Hoje o professor vê a lista de alunos, mas não tem visão agregada: quantos alunos treinaram essa semana, quem está sumido, quais exercícios são mais usados.

**O que construir**:
- Card de engajamento: % de alunos que logaram nos últimos 7 dias.
- Lista "em risco": alunos que não registram treino há mais de 7 dias.
- Gráfico de renovações próximas (vencimentos no próximo mês).

---

### 10. Notificações push

O app é uma PWA instalável, mas não tem notificações push. O aluno não sabe quando o professor adicionou uma anotação nova ou quando o treino foi atualizado.

**O que fazer**:
- Implementar Web Push API com service worker.
- Triggers no Supabase que disparam notificação quando: professor salva anotação, professor atualiza treino, aluno está há X dias sem treinar.

---

### 11. Upload de fotos na anamnese

O schema de `assessments` já tem comentário prevendo fotos (`-- fotos entram no futuro como URLs dentro de data`). A estrutura está preparada.

**O que fazer**:
- Criar bucket privado no Supabase Storage para fotos de avaliação.
- Adicionar upload na tela de anamnese com política de acesso: só o professor e o aluno veem as fotos.
- Considerar compressão client-side antes do upload (imagens de celular são grandes).

---

### 12. Exportação de dados (LGPD)

Para estar em conformidade com a LGPD, o usuário precisa poder exportar e deletar seus dados.

**O que fazer**:
- Botão "Exportar meus dados" que gera um JSON com todos os treinos e avaliações do aluno.
- Botão "Excluir minha conta" que remove o perfil (o cascade no banco já cuida das tabelas filhas).
- Política de privacidade e termos de uso publicados.

---

## Checklist de segurança antes do lançamento

- [ ] Chave Supabase fora do código-fonte (env vars no host)
- [ ] Allowed Origins configurado no Supabase
- [ ] `unsafe-inline` no CSP substituído por nonces ou hashes
- [ ] Rate limiting no Supabase (Auth → Rate limits)
- [ ] Backup automático do banco habilitado (Supabase → Database → Backups)
- [ ] MFA habilitado para a conta do owner no Supabase Dashboard
- [ ] Logs de acesso e erros monitorados (Supabase Logs ou Sentry)
- [ ] Domínio com HTTPS (automático nas plataformas recomendadas)

---

## Ordem de execução recomendada

```
Fase 1 — Fundação (antes de cobrar qualquer coisa)
  1. Domínio próprio + deploy em Vercel/Netlify
  2. Env vars para as credenciais do Supabase
  3. Ícones PNG reais + nome de produto definido
  4. E-mail transacional configurado (Resend + Supabase)
  5. Termos de uso e política de privacidade

Fase 2 — Monetização mínima (para os primeiros clientes)
  6. Link de pagamento no Stripe/Mercado Pago
  7. Webhook de pagamento → estende acesso do professor automaticamente
  8. E-mail de boas-vindas e aviso de vencimento

Fase 3 — Self-service (para escalar sem operação manual)
  9. Landing page pública
  10. Cadastro self-service do professor
  11. Planos e limites por tier

Fase 4 — Produto (retenção e diferenciação)
  12. Dashboard de métricas para o professor
  13. Notificações push
  14. Upload de fotos na anamnese
  15. Exportação de dados (LGPD)
```

---

## Infraestrutura atual vs. recomendada para SaaS

| Item | Atual | Recomendado para SaaS |
|------|-------|----------------------|
| Hosting | GitHub Pages | Vercel / Cloudflare Pages |
| Banco | Supabase (free tier) | Supabase Pro ($25/mês) |
| Autenticação | Supabase Auth (OTP) | ✅ Manter |
| E-mail | Supabase padrão | Resend + domínio próprio |
| Pagamentos | Manual | Stripe ou Mercado Pago |
| Monitoramento | Nenhum | Sentry (free tier) |
| Domínio | github.io/meutreino | Domínio próprio (R$40/ano) |

**Custo estimado para operar com até 20 professores**: ~R$ 200/mês (Supabase Pro + domínio + Resend). A partir de 3-4 professores pagando o plano Starter, o produto já se paga.

---

*Gerado em 2026-08-08 com base na análise do código-fonte do projeto.*
