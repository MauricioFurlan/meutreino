// Testes do que o ALUNO ganhou: menu lateral (hamburger) em index.html,
// gráfico de evolução por exercício dentro do histórico (Chart.js sob demanda)
// e a tela evolucao.html (semanal/mensal).
//
// Como não há build para os scripts inline, aqui se mistura:
//   · função pura extraída e executada de verdade (o que dá para testar sozinho)
//   · asserção sobre o código da tela (o que só existe amarrado ao DOM)
// O segundo tipo é chato, mas é o que impede regressão silenciosa em coisas
// como "o Chart.js voltou para o <head>" ou "o menu perdeu um item".
import fs from 'fs';
import vm from 'vm';

const read = (f) => fs.readFileSync(f, 'utf8');
const inlineScript = (f) => {
  const m = read(f).match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('sem script inline em ' + f);
  return m[1];
};
const grabFrom = (source, name) => {
  const i = source.indexOf(`function ${name}(`);
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

const idxHtml = read('index.html');
const idxJs = inlineScript('index.html');
const evoHtml = read('evolucao.html');
const evoJs = inlineScript('evolucao.html');
const METRICS = read('public/metrics.js');

// ====================================================================
// MENU LATERAL (index.html)
// ====================================================================
eq('hamburger no header', /class="menu-btn" id="menuBtn" onclick="openDrawer\(\)"/.test(idxHtml), true);
eq('botão antigo de Orientações saiu do header', /class="notes-btn"/.test(idxHtml), false);
eq('CSS morto do botão antigo removido', /\.notes-btn/.test(idxHtml), false);

const itens = [...idxHtml.matchAll(/drawerGo\('(\w+)'\)/g)].map(m => m[1]);
eq('menu tem os 4 destinos', itens, ['notes', 'anamnese', 'weekly', 'monthly']);

const drawerGo = grabFrom(idxJs, 'drawerGo');
eq('Orientações abrem o modal (sem sair da tela)', /openNotesModal\(\); return;/.test(drawerGo), true);
eq('anamnese vai para a tela do aluno', /location\.href = 'anamnese\.html'/.test(drawerGo), true);
eq('semanal abre evolucao#weekly',  /evolucao\.html#weekly/.test(drawerGo), true);
eq('mensal abre evolucao#monthly',  /evolucao\.html#monthly/.test(drawerGo), true);
eq('menu fecha antes de navegar',   /^function drawerGo\(destino\) \{\s*closeDrawer\(\);/m.test(drawerGo), true);
eq('ESC fecha o menu', /e\.key === 'Escape'\) closeDrawer\(\)/.test(idxJs), true);
eq('acesso bloqueado esconde o menu', /menuBtn'\)\.style\.display = 'none'/.test(idxJs), true);

// Aviso de orientação nova: sem isso, esconder as Orientações dentro do menu
// faria o aluno perder o recado do professor.
eq('badge quando a orientação é nova',
  /if \(seen !== \(trainerNoteUpdated \|\| '1'\)\)/.test(idxJs), true);
eq('abrir o modal marca como visto', /markNoteAsSeen\(\);/.test(grabFrom(idxJs, 'openNotesModal')), true);
eq('chave do "já vi" é por aluno', /'noteSeen:' \+ studentId/.test(idxJs), true);
eq('orientação carrega mesmo sem treino ativo',
  idxJs.indexOf('loadTrainerNote();') < idxJs.indexOf("from('workout_plans')"), true);

// ====================================================================
// GRÁFICO DO EXERCÍCIO (dentro do modal de histórico)
// ====================================================================
eq('gráfico vive no modal de histórico',
  /id="historyChartBtn" onclick="toggleExerciseChart\(\)"/.test(idxHtml), true);
eq('Chart.js NÃO está no caminho crítico',
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js/.test(idxHtml), false);
eq('Chart.js é injetado sob demanda',
  /s\.src = 'https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.0/.test(idxJs), true);
eq('CSP permite o CDN do gráfico',
  /script-src[^"]*https:\/\/cdn\.jsdelivr\.net/.test(idxHtml), true);
eq('não baixa duas vezes (cache da promise)', /if \(window\.Chart\) return Promise\.resolve\(\);/.test(idxJs), true);
eq('falha de rede libera nova tentativa', /chartLibPromise = null; reject/.test(idxJs), true);

eq('histórico sabe se o exercício é cardio',
  /function toggleHistory\(exerciseName, isCardioExercise\)/.test(idxJs), true);
eq('card passa a flag de cardio', /toggleHistory\('\$\{exName\.replace\(\/'\/g,"\\\\'"\)\}', \$\{allCardio\}\)/.test(idxJs), true);
eq('cardio usa o gráfico de minutos', /renderCardioChart\(currentHistoryExercise/.test(idxJs), true);
eq('musculação usa volume + 1RM',     /renderStrengthChart\(currentHistoryExercise/.test(idxJs), true);
eq('só séries hard entram no volume', /\.eq\('set_type', 'hard'\)/.test(idxJs), true);
eq('janela do gráfico é a compartilhada', /CHART_WINDOW_DAYS - 1/.test(idxJs), true);
eq('fechar o modal destrói o gráfico',
  /resetExerciseChart\(\);/.test(grabFrom(idxJs, 'closeHistoryModal')), true);
eq('reset destrói a instância antiga',
  /historyChartInstance\.destroy\(\)/.test(grabFrom(idxJs, 'resetExerciseChart')), true);
// Mensagem de erro não pode apagar o <canvas> (era o que travava a reabertura)
eq('erro escreve em .chart-info, não no container',
  /box\.querySelector\('\.chart-info'\)\.innerHTML = html/.test(idxJs), true);

// frequencyHtml: janela FIXA de 12 semanas (e não "da 1ª à última sessão")
{
  const api = new vm.Script(
    grabFrom(METRICS, 'toLocalISO') + '\n' +
    grabFrom(METRICS, 'formatDayMonth') + '\n' +
    'const CHART_WINDOW_WEEKS = 12;\n' +
    grabFrom(idxJs, 'frequencyHtml') + '\n' +
    '({ frequencyHtml })'
  ).runInNewContext();

  const hoje = new Date();
  const isoBack = (n) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  eq('fez 1 vez → 1/12 semanas (não 100%)',
    /1\/12 semanas \(8%\)/.test(api.frequencyHtml([isoBack(0)])), true);
  eq('3 semanas seguidas → 3/12',
    /3\/12 semanas/.test(api.frequencyHtml([isoBack(0), isoBack(7), isoBack(14)])), true);
  eq('duas sessões na MESMA semana contam 1',
    /1\/12 semanas/.test(api.frequencyHtml([isoBack(0), isoBack(1)])), true);
  eq('sem sessão → 0/12', /0\/12 semanas \(0%\)/.test(api.frequencyHtml([])), true);
  // Conta só os <span> das bolinhas — o <div class="freq-dots"> em volta também
  // casaria com um regex ingênuo de "freq-dot".
  eq('12 bolinhas na régua', (api.frequencyHtml([]).match(/<span class="freq-dot/g) || []).length, 12);
}

// ====================================================================
// evolucao.html
// ====================================================================
{
  let erro = null;
  try { new vm.Script(evoJs, { filename: 'evolucao.html' }); } catch (e) { erro = e.message; }
  eq('sintaxe ok: evolucao.html', erro, null);
}
eq('evolucao é só do aluno', /guard\('student'/.test(evoJs), true);
eq('evolucao usa o próprio id', /studentId = profile\.id;/.test(evoJs), true);
eq('evolucao carrega metrics.js', /<script src="\/metrics\.js"><\/script>/.test(evoHtml), true);
eq('evolucao NÃO carrega Chart.js', /chart\.js/.test(evoHtml), false);
eq('evolucao NÃO carrega jspdf', /jspdf/.test(evoHtml), false);
eq('evolucao tem semanal e mensal',
  [/switchView\('weekly'\)/.test(evoHtml), /switchView\('monthly'\)/.test(evoHtml)], [true, true]);
eq('faltas saem do plano ativo, não de "todo dia menos domingo"',
  /prescribedDaySet\(plan && plan\.structure\)/.test(evoJs), true);
eq('volume só de hard sets', /hardVolume\(/.test(evoJs), true);
eq('sessões filtradas com o fuso fixo', /'T00:00:00' \+ TZ/.test(evoJs), true);
eq('sem plano ativo avisa em vez de inventar falta',
  /não é possível calcular faltas/.test(evoJs), true);
eq('tela de bloqueio para acesso vencido', /onBlocked: showBlock/.test(evoJs), true);
eq('volta para o treino', /location\.href='index\.html'/.test(evoHtml), true);

// Navegação não entra no futuro (semana/mês à frente seria tela de "?")
eq('semana futura bloqueada', /if \(weekOffset \+ dir > 0\) return;/.test(evoJs), true);
eq('mês futuro bloqueado',    /if \(monthOffset \+ dir > 0\) return;/.test(evoJs), true);

// Comparativo com o período anterior
{
  const api = new vm.Script(evoJs.match(/const cmp = [\s\S]*?\n\};/)[0] + '\n({ cmp })').runInNewContext();
  eq('subiu 25%',            [api.cmp(50, 40).arrow, api.cmp(50, 40).abs, api.cmp(50, 40).cls], ['↑', 25, 'up']);
  eq('caiu 20%',             [api.cmp(40, 50).arrow, api.cmp(40, 50).abs, api.cmp(40, 50).cls], ['↓', 20, 'down']);
  eq('igual não vira seta',  [api.cmp(40, 40).arrow, api.cmp(40, 40).abs, api.cmp(40, 40).cls], ['=', 0, '']);
  // Sem base anterior não existe "+100%": mostra 0 em vez de inventar evolução.
  eq('sem base anterior não inventa %', [api.cmp(40, 0).arrow, api.cmp(40, 0).abs], ['=', 0]);
}

// ====================================================================
// Infraestrutura: guard com lista de papéis e cache offline
// ====================================================================
{
  const guardJs = read('auth-guard.js');
  eq('guard aceita lista de papéis', /const allowed = Array\.isArray\(requiredRole\) \? requiredRole : \[requiredRole\];/.test(guardJs), true);
  eq('guard compara com includes', /!allowed\.includes\(profile\.role\)/.test(guardJs), true);
  eq('cópia em public/ está sincronizada', read('public/auth-guard.js') === guardJs, true);
}
{
  const sw = read('sw.js');
  eq('service worker cacheia a tela nova', /'\/evolucao\.html'/.test(sw), true);
  eq('service worker cacheia metrics.js', /'\/metrics\.js'/.test(sw), true);
  eq('cache trocou de nome (senão a lista velha fica)', /meutreino-v2/.test(sw), true);
  eq('cópia em public/ está sincronizada', read('public/sw.js') === sw, true);
}
eq('evolucao.html entra no build do vite', /'evolucao',/.test(read('vite.config.js')), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
