// Testes do menu lateral do aluno: sem emoji nos itens e com o prazo do
// acompanhamento ("Contratado até ...").
//
// O prazo vem de profiles.access_expires_at, que o professor define no cadastro
// do aluno (duração em meses) ou na edição (data do vencimento). Aqui roda a
// função REAL de index.html, sem cópia.
import fs from 'fs';
import vm from 'vm';

const read = (f) => fs.readFileSync(f, 'utf8');

const inlineScript = (file) => {
  const blocks = [...read(file).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (blocks.length === 0) throw new Error('sem script inline em ' + file);
  return blocks.sort((a, b) => b.length - a.length)[0];
};

const grabFrom = (source, name) => {
  let i = source.indexOf(`async function ${name}(`);
  if (i < 0) i = source.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('não achei ' + name);
  let depth = 0, started = false;
  for (let p = i; p < source.length; p++) {
    if (source[p] === '{') { depth++; started = true; }
    else if (source[p] === '}') { depth--; if (started && depth === 0) return source.slice(i, p + 1); }
  }
  throw new Error('fim não encontrado: ' + name);
};

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

const HTML = read('index.html');
const ALUNO = inlineScript('index.html');

// ====================================================================
// 1. Menu sem emoji
// ====================================================================
const drawerHtml = HTML.match(/<nav class="drawer"[\s\S]*?<\/nav>/)[0];
// Faixas de emoji (pictogramas, setas decoradas, símbolos diversos). O ✕ de
// fechar é tipografia, não emoji, e fica de fora da conta de propósito.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const semBotaoFechar = drawerHtml.replace(/<button class="drawer-close"[\s\S]*?<\/button>/, '');
eq('nenhum emoji no menu lateral', EMOJI.test(semBotaoFechar), false);
eq('o ✕ de fechar continua lá', /drawer-close/.test(drawerHtml), true);
eq('sobrou span de ícone vazio?', /di-icon/.test(HTML), false);
// Os destinos do menu seguem os mesmos, só sem a figurinha na frente.
eq('itens do menu continuam nomeados',
   [...drawerHtml.matchAll(/class="di-label">([^<]+)</g)].map(m => m[1]),
   ['Orientações', 'Resultado da anamnese', 'Evoluções', 'Configurações', 'Sair']);

// ====================================================================
// 2. Prazo do acompanhamento
// ====================================================================
const { planValidity } = new vm.Script(
  grabFrom(ALUNO, 'planValidity') + '\n({ planValidity })'
).runInNewContext({});

const HOJE = '2026-09-03';
const em = (expires) => planValidity(expires, HOJE);

eq('sem vencimento não mostra selo', em(null), null);
eq('vencimento vazio não mostra selo', em(''), null);
eq('data inválida não mostra selo', em('sem data'), null);

// Longe do fim: a data basta, e em ano curto para caber no selo.
eq('plano em dia mostra a data', em('2026-12-03'), { text: 'Plano até 03/12/26', ending: false });
eq('longe do fim não acende o alerta', em('2027-03-03').ending, false);

// Perto do fim o que importa é o aperto, não a data.
eq('7 dias vira contagem', em('2026-09-10'), { text: 'Plano acaba em 7 dias', ending: true });
eq('8 dias ainda é data', em('2026-09-11'), { text: 'Plano até 11/09/26', ending: false });
eq('amanhã sem número solto', em('2026-09-04'), { text: 'Plano acaba amanhã', ending: true });
// O acesso vale até o fim do dia do vencimento: 0 dia é último dia, não vencido.
eq('vence hoje é o último dia', em(HOJE), { text: 'Último dia do plano', ending: true });
eq('plano vencido', em('2026-08-30'), { text: 'Plano vencido', ending: true });

// A virada do horário de verão não pode "comer" um dia da contagem.
eq('atravessa mudança de fuso sem perder dia', em('2026-10-10').text, 'Plano até 10/10/26');

// ====================================================================
// 3. A tela lê o prazo do perfil
// ====================================================================
eq('selo do plano fica na testeira do menu',
   /drawer-sub-row[\s\S]*?id="drawerPlanChip"/.test(drawerHtml), true);
eq('selo começa escondido', /id="drawerPlanChip" style="display:none;"/.test(HTML), true);
// O selo não pode virar mais um item da lista — foi essa a confusão.
eq('selo não está entre os itens', /drawer-items[\s\S]*?drawerPlanChip/.test(drawerHtml), false);
eq('o prazo vem do perfil do aluno',
   /renderPlanValidity\(profile\.access_expires_at\)/.test(ALUNO), true);
// access_expires_at já vem no perfil do guard — nada de consulta extra.
eq('auth-guard já traz o campo', /access_expires_at/.test(read('auth-guard.js')), true);
eq('cópia do guard em public/ igual', read('public/auth-guard.js') === read('auth-guard.js'), true);

// ====================================================================
// 4. Item de menu tem cara de botão
// ====================================================================
// Sem os ícones, texto solto no escuro não passava clicável. A superfície e a
// borda são o que separa o item do recado do plano.
const regraItem = HTML.match(/\.drawer-item \{[\s\S]*?\}/)[0];
eq('item tem superfície própria', /background: var\(--bg-secondary\)/.test(regraItem), true);
eq('item tem borda', /border: 1px solid var\(--border\)/.test(regraItem), true);
eq('item respira do vizinho', /margin-bottom: 8px/.test(regraItem), true);
const regraToque = HTML.match(/\.drawer-item:active \{[\s\S]*?\}/)[0];
eq('toque no item responde', /border-color: var\(--accent\)/.test(regraToque), true);
// O selo não tem caixa nenhuma — é a diferença que evita a confusão.
const regraSelo = HTML.match(/\.drawer-plan-chip \{[\s\S]*?\}/)[0];
eq('selo não usa a superfície dos itens', /background/.test(regraSelo), false);
eq('CSS morto do bloco antigo saiu', /\.drawer-plan \{/.test(HTML), false);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
