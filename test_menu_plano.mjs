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

eq('sem vencimento não mostra nada', em(null), null);
eq('vencimento vazio não mostra nada', em(''), null);
eq('data inválida não mostra nada', em('sem data'), null);

eq('plano em dia', em('2026-12-03'),
   { label: 'Contratado até 03/12/2026', desc: 'Faltam 91 dias.', ending: false });
// Acaba longe: nada de alarme.
eq('longe do fim não acende o alerta', em('2027-03-03').ending, false);

// O acesso vale até o fim do dia do vencimento — por isso 0 dia é "último dia",
// não "encerrado".
eq('vence hoje é o último dia', em(HOJE),
   { label: 'Contratado até 03/09/2026', desc: 'Último dia do plano.', ending: true });
eq('falta 1 dia no singular', em('2026-09-04').desc, 'Falta 1 dia.');
eq('faltam 2 dias no plural', em('2026-09-05').desc, 'Faltam 2 dias.');

// Uma semana ou menos acende o alerta: dá tempo de falar com o professor.
eq('7 dias ainda alerta', em('2026-09-10').ending, true);
eq('8 dias já não alerta', em('2026-09-11').ending, false);

eq('plano vencido', em('2026-08-30'),
   { label: 'Encerrado em 30/08/2026', desc: 'Fale com seu professor para renovar.', ending: true });

// A virada do horário de verão não pode "comer" um dia da contagem.
eq('atravessa mudança de fuso sem perder dia', em('2026-10-20').desc, 'Faltam 47 dias.');

// ====================================================================
// 3. A tela lê o prazo do perfil
// ====================================================================
eq('menu tem o bloco do plano', /id="drawerPlan"/.test(HTML), true);
eq('bloco começa escondido', /id="drawerPlanSection" style="display:none;"/.test(HTML), true);
eq('o prazo vem do perfil do aluno',
   /renderPlanValidity\(profile\.access_expires_at\)/.test(ALUNO), true);
// access_expires_at já vem no perfil do guard — nada de consulta extra.
eq('auth-guard já traz o campo', /access_expires_at/.test(read('auth-guard.js')), true);
eq('cópia do guard em public/ igual', read('public/auth-guard.js') === read('auth-guard.js'), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
