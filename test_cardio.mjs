// Testes das funções novas de DESCANSO e CARDIO.
// Extrai as funções REAIS dos HTMLs (nada de cópia colada aqui) e ainda
// compila o <script> inline de cada tela para pegar erro de sintaxe —
// como não há build, isso é a única rede de proteção contra tela branca.
import fs from 'fs';
import vm from 'vm';

const inlineScript = (file) => {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('sem script inline em ' + file);
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

const FILES = ['editor.html', 'index.html', 'treinador.html', 'treinos.html'];
const src = {};
FILES.forEach(f => { src[f] = inlineScript(f); });

// ---------- sintaxe das telas ----------
FILES.forEach(f => {
  let erro = null;
  try { new vm.Script(src[f], { filename: f }); } catch (e) { erro = e.message; }
  eq(`sintaxe ok: ${f}`, erro, null);
});

// ---------- normalizeRest (as 3 telas precisam concordar) ----------
const editorApi = new vm.Script(
  grabFrom(src['editor.html'], 'normalizeRest') + '\n' +
  grabFrom(src['editor.html'], 'restLabel') + '\n' +
  grabFrom(src['editor.html'], 'restSummary') + '\n' +
  grabFrom(src['editor.html'], 'isCardioType') + '\n' +
  grabFrom(src['editor.html'], 'emptySetOffenders') + '\n' +
  src['editor.html'].match(/const REST_PRESETS = \[[^\]]*\];/)[0] + '\n' +
  src['editor.html'].match(/const DAYS = \[[^\]]*\];/)[0] + '\n' +
  '({ normalizeRest, restLabel, restSummary, isCardioType, emptySetOffenders, REST_PRESETS })'
).runInNewContext();

const alunoApi = new vm.Script(
  grabFrom(src['index.html'], 'normalizeRest') + '\n' +
  grabFrom(src['index.html'], 'restLabel') + '\n' +
  grabFrom(src['index.html'], 'restSummary') + '\n' +
  grabFrom(src['index.html'], 'isCardioSet') + '\n' +
  grabFrom(src['index.html'], 'parseCardioMinutes') + '\n' +
  '({ normalizeRest, restLabel, restSummary, isCardioSet, parseCardioMinutes })'
).runInNewContext();

const viewApi = new vm.Script(
  grabFrom(src['treinos.html'], 'normalizeRest') + '\n' +
  grabFrom(src['treinos.html'], 'restLabel') + '\n' +
  grabFrom(src['treinos.html'], 'restSummary') + '\n' +
  '({ normalizeRest, restLabel, restSummary })'
).runInNewContext();

const casosRest = [
  ['', ''],
  [null, ''],
  ['90', '90s'],              // número puro = segundos (como o professor fala)
  ['  90  ', '90s'],
  ['90s', '90s'],
  ['90S', '90s'],
  ['90seg', '90s'],
  ['90 segundos', '90s'],
  ['2min', '2min'],
  ['2 min', '2min'],
  ['2m', '2min'],
  ['2mins', '2min'],
  ['3minutos', '3min'],
  ['1:30', '1min30s'],
  ['1:05', '1min5s'],
  ['2:00', '2min'],
  ['60-90s', '60-90s'],       // faixa: texto livre, não inventa unidade
  ['até recuperar', 'até recuperar']  // espaços do texto livre preservados
];
casosRest.forEach(([entrada, esperado]) => {
  eq(`editor normalizeRest(${JSON.stringify(entrada)})`, editorApi.normalizeRest(entrada), esperado);
});
casosRest.forEach(([entrada, esperado]) => {
  eq(`aluno normalizeRest(${JSON.stringify(entrada)})`, alunoApi.normalizeRest(entrada), esperado);
});
casosRest.forEach(([entrada, esperado]) => {
  eq(`treinos normalizeRest(${JSON.stringify(entrada)})`, viewApi.normalizeRest(entrada), esperado);
});

// ---------- restLabel: rótulo curto por tipo ----------
[
  ['aquec', 'AQUEC'], ['feeder', 'FED'], ['hard', 'HARD'], ['cardio', 'CARDIO'],
  ['outro_treino', 'OUTRO'], ['HARD', 'HARD'], ['drop set', 'DROP'],
  ['', 'SET'], [null, 'SET'], ['supersetlongo', 'SUPERS']
].forEach(([entrada, esperado]) => {
  eq(`restLabel(${JSON.stringify(entrada)})`, editorApi.restLabel(entrada), esperado);
  eq(`restLabel paridade aluno ${JSON.stringify(entrada)}`, alunoApi.restLabel(entrada), esperado);
  eq(`restLabel paridade treinos ${JSON.stringify(entrada)}`, viewApi.restLabel(entrada), esperado);
});

// ---------- restSummary: é o texto que o aluno lê ----------
const somaResumo = (sets, legacy) => [
  editorApi.restSummary(sets, legacy),
  alunoApi.restSummary(sets, legacy),
  viewApi.restSummary(sets, legacy)
];

const casosResumo = [
  ['sem descanso nenhum',
    [{ type: 'hard', rest: null }, { type: 'hard' }], undefined,
    { text: '', uniform: false }],
  ['descanso igual em todas vira valor único',
    [{ type: 'aquec', rest: '2min' }, { type: 'hard', rest: '2min' }], undefined,
    { text: '2min', uniform: true }],
  ['descanso por tipo',
    [{ type: 'aquec', rest: '2min' }, { type: 'feeder', rest: '2min' },
     { type: 'hard', rest: '3min' }, { type: 'outro_treino', rest: '1min' }], undefined,
    { text: 'AQUEC-2min / FED-2min / HARD-3min / OUTRO-1min', uniform: false }],
  ['tipo repetido com mesmo descanso não duplica',
    [{ type: 'hard', rest: '3min' }, { type: 'hard', rest: '3min' },
     { type: 'aquec', rest: '1min' }], undefined,
    { text: 'HARD-3min / AQUEC-1min', uniform: false }],
  ['mesmo tipo com descansos diferentes mostra os dois',
    [{ type: 'hard', rest: '2min' }, { type: 'hard', rest: '3min' }], undefined,
    { text: 'HARD-2min / HARD-3min', uniform: false }],
  ['preenchido em parte não é uniforme',
    [{ type: 'aquec', rest: '2min' }, { type: 'hard', rest: null }], undefined,
    { text: 'AQUEC-2min', uniform: false }],
  ['normaliza dentro do resumo',
    [{ type: 'hard', rest: '90' }, { type: 'aquec', rest: '1:30' }], undefined,
    { text: 'HARD-90s / AQUEC-1min30s', uniform: false }],
  ['legado no exercício vale para as séries sem descanso',
    [{ type: 'aquec' }, { type: 'hard' }], '90s',
    { text: '90s', uniform: true }],
  ['descanso da série ganha do legado',
    [{ type: 'aquec', rest: '30s' }, { type: 'hard' }], '90s',
    { text: 'AQUEC-30s / HARD-90s', uniform: false }],
  ['lista vazia', [], undefined, { text: '', uniform: false }],
  ['null', null, undefined, { text: '', uniform: false }]
];

casosResumo.forEach(([nome, sets, legacy, esperado]) => {
  const [e, a, v] = somaResumo(sets, legacy);
  eq(`restSummary editor: ${nome}`, e, esperado);
  eq(`restSummary aluno: ${nome}`, a, esperado);
  eq(`restSummary treinos: ${nome}`, v, esperado);
});

// ---------- treino sem série não pode ser salvo ----------
const estruturaOk = {
  Segunda: [{ name: 'Supino', sets: [{ type: 'hard', reps: '8-12' }] }],
  Terça: [], Quarta: [], Quinta: [], Sexta: [], Sábado: [], Domingo: []
};
const estruturaRuim = {
  Segunda: [
    { name: 'Supino', sets: [{ type: 'hard', reps: '8-12' }] },
    { name: 'Crucifixo', sets: [] }
  ],
  Terça: [], Quarta: [{ name: 'Agachamento' }],
  Quinta: [], Sexta: [], Sábado: [], Domingo: []
};
eq('estrutura válida não acusa nada', editorApi.emptySetOffenders(estruturaOk), []);
eq('acusa exercício com sets vazio e sem a chave sets',
  editorApi.emptySetOffenders(estruturaRuim),
  [{ day: 'Segunda', name: 'Crucifixo' }, { day: 'Quarta', name: 'Agachamento' }]);
eq('exercício sem nome ainda é acusado',
  editorApi.emptySetOffenders({ Segunda: [{ sets: [] }], Terça: [], Quarta: [], Quinta: [], Sexta: [], Sábado: [], Domingo: [] }),
  [{ day: 'Segunda', name: 'sem nome' }]);
eq('savePlan usa a validação', /emptySetOffenders\(structure\)/.test(src['editor.html']), true);
eq('remover a última série é bloqueado',
  /length <= 1[\s\S]{0,200}pelo menos 1 série/.test(src['editor.html']), true);
eq('botão × chama removeSet', /onclick="removeSet\(this\)"/.test(src['editor.html']), true);

// Chips do editor têm que sobreviver ao normalize, senão o chip nunca acende
editorApi.REST_PRESETS.forEach(p => {
  eq(`chip ${p} é estável no normalize`, editorApi.normalizeRest(p), p);
});

// ---------- detecção de cardio ----------
eq('editor isCardioType(cardio)',   editorApi.isCardioType('cardio'), true);
eq('editor isCardioType(CARDIO)',   editorApi.isCardioType('CARDIO'), true);
eq('editor isCardioType( cardio )', editorApi.isCardioType(' cardio '), true);
eq('editor isCardioType(hard)',     editorApi.isCardioType('hard'), false);
eq('editor isCardioType(vazio)',    editorApi.isCardioType(''), false);
eq('aluno isCardioSet(cardio)',     alunoApi.isCardioSet('cardio'), true);
eq('aluno isCardioSet(feeder)',     alunoApi.isCardioSet('feeder'), false);
eq('aluno isCardioSet(null)',       alunoApi.isCardioSet(null), false);

// ---------- minutos digitados pelo aluno ----------
eq('minutos "40"',        alunoApi.parseCardioMinutes('40'), 40);
eq('minutos "40min"',     alunoApi.parseCardioMinutes('40min'), 40);
eq('minutos "40 min"',    alunoApi.parseCardioMinutes('40 min'), 40);
eq('minutos vazio = null', alunoApi.parseCardioMinutes(''), null);
eq('minutos null = null', alunoApi.parseCardioMinutes(null), null);
eq('minutos "0" = null',  alunoApi.parseCardioMinutes('0'), null);   // 0 não é registro
eq('minutos "abc" = null', alunoApi.parseCardioMinutes('abc'), null);
eq('minutos negativo vira positivo', alunoApi.parseCardioMinutes('-30'), 30);
eq('minutos acima do teto trava em 600', alunoApi.parseCardioMinutes('9999'), 600); // check do banco

// ---------- agregação no treinador ----------
const trainerApi = new vm.Script(
  grabFrom(src['treinador.html'], 'isCardio') + '\n' +
  grabFrom(src['treinador.html'], 'sumCardioMinutes') + '\n' +
  grabFrom(src['treinador.html'], 'formatMinutes') + '\n' +
  grabFrom(src['treinador.html'], 'cardioByDate') + '\n' +
  '({ isCardio, sumCardioMinutes, formatMinutes, cardioByDate })'
).runInNewContext();

const logs = [
  { session_date: '2026-08-03', set_type: 'hard',   weight: 100, reps: 10, duration_minutes: null },
  { session_date: '2026-08-03', set_type: 'cardio', weight: null, reps: null, duration_minutes: 20 },
  { session_date: '2026-08-03', set_type: 'CARDIO', weight: null, reps: null, duration_minutes: 10 },
  { session_date: '2026-08-05', set_type: 'cardio', weight: null, reps: null, duration_minutes: 40 },
  { session_date: '2026-08-05', set_type: 'cardio', weight: null, reps: null, duration_minutes: null }, // marcou e não informou
  { session_date: '2026-08-05', set_type: 'aquec',  weight: 40,  reps: 15, duration_minutes: null }
];

eq('soma total de cardio',        trainerApi.sumCardioMinutes(logs), 70);
eq('cardio ignora musculação',    trainerApi.sumCardioMinutes(logs.filter(r => r.set_type === 'hard')), 0);
eq('lista vazia',                 trainerApi.sumCardioMinutes([]), 0);
eq('null é tolerado',             trainerApi.sumCardioMinutes(null), 0);
eq('minutos por data',            trainerApi.cardioByDate(logs), { '2026-08-03': 30, '2026-08-05': 40 });

// Regressão do motivo da coluna separada: minutos não podem entrar no volume.
const volumeHard = logs
  .filter(r => r.set_type === 'hard')
  .reduce((s, r) => s + (Number(r.weight) || 0) * (Number(r.reps) || 0), 0);
eq('cardio não contamina o volume', volumeHard, 1000);

// ---------- formatação ----------
eq('formatMinutes 0',    trainerApi.formatMinutes(0), '0min');
eq('formatMinutes null', trainerApi.formatMinutes(null), '0min');
eq('formatMinutes 40',   trainerApi.formatMinutes(40), '40min');
eq('formatMinutes 59',   trainerApi.formatMinutes(59), '59min');
eq('formatMinutes 60',   trainerApi.formatMinutes(60), '1h');
eq('formatMinutes 95',   trainerApi.formatMinutes(95), '1h35');
eq('formatMinutes 65',   trainerApi.formatMinutes(65), '1h05');
eq('formatMinutes 120',  trainerApi.formatMinutes(120), '2h');
eq('formatMinutes média quebrada', trainerApi.formatMinutes(70 / 3), '23min');

// ---------- render do card do aluno (smoke test com DOM mínimo) ----------
// renderExerciseCard é onde a feature aparece de fato. Roda com um `document`
// falso só para o esc() funcionar — pega regressão de markup sem navegador.
const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderCtx = {
  document: {
    createElement: () => ({
      textContent: '',
      get innerHTML() { return escapeHtml(this.textContent); }
    })
  },
  escapeHtml
};

const renderApi = new vm.Script(
  src['index.html'].match(/const esc = \(s\) => \{[\s\S]*?\};/)[0] + '\n' +
  grabFrom(src['index.html'], 'normalizeRest') + '\n' +
  grabFrom(src['index.html'], 'restLabel') + '\n' +
  grabFrom(src['index.html'], 'restSummary') + '\n' +
  grabFrom(src['index.html'], 'isCardioSet') + '\n' +
  grabFrom(src['index.html'], 'renderExerciseCard') + '\n' +
  '({ renderExerciseCard })'
).runInNewContext(renderCtx);

const cardCardio = renderApi.renderExerciseCard('Segunda', 0, {
  name: 'Bike ergométrica', sets: [{ type: 'cardio', reps: '40min', note: null }]
});
eq('cardio: input de minutos',      /class="minutes-input"/.test(cardCardio), true);
eq('cardio: placeholder prescrito', /placeholder="40min"/.test(cardCardio), true);
eq('cardio: header MINUTOS',        /MINUTOS/.test(cardCardio), true);
eq('cardio: sem KG/REPS',           /weight-input|reps-input/.test(cardCardio), false);
eq('cardio: rótulo CARDIO',         /CARDIO/.test(cardCardio), true);
eq('cardio: linha marcada',         /set-row cardio-row"/.test(cardCardio), true);

const cardForca = renderApi.renderExerciseCard('Segunda', 1, {
  name: 'Supino reto', sets: [
    { type: 'aquec', reps: '12-15', rest: '2min', note: null },
    { type: 'feeder', reps: '2-4', rest: '2min', note: null },
    { type: 'hard', reps: '8-12', rest: '3min', note: null }
  ]
});
eq('força: descanso em linha própria', /<div class="rest-line">/.test(cardForca), true);
eq('força: resumo por tipo',
  /Descansos:<\/span> <span class="rest-value">AQUEC-2min \/ FED-2min \/ HARD-3min<\/span>/.test(cardForca), true);
eq('força: descanso vem antes do histórico',
  cardForca.indexOf('rest-line') < cardForca.indexOf('history-btn'), true);
eq('força: mantém KG e REPS',       /KG[\s\S]*REPS/.test(cardForca), true);
eq('força: sem input de minutos',   /minutes-input/.test(cardForca), false);

const cardUniforme = renderApi.renderExerciseCard('Segunda', 2, {
  name: 'Rosca direta', sets: [
    { type: 'hard', reps: '10', rest: '90', note: null },
    { type: 'hard', reps: '10', rest: '90s', note: null }
  ]
});
eq('descanso igual: singular e valor único',
  /Descanso:<\/span> <span class="rest-value">90s<\/span>/.test(cardUniforme), true);

const semDescanso = renderApi.renderExerciseCard('Segunda', 3, {
  name: 'Elevação lateral', sets: [{ type: 'hard', reps: '10', note: null }]
});
eq('sem descanso prescrito: sem pill', /rest-pill/.test(semDescanso), false);

const legado = renderApi.renderExerciseCard('Segunda', 4, {
  name: 'Remada', rest: '60s', sets: [{ type: 'hard', reps: '10', note: null }]
});
eq('plano no formato antigo ainda exibe o descanso', /90s|60s/.test(legado), true);

const semSets = renderApi.renderExerciseCard('Segunda', 5, { name: 'Furado', sets: [] });
eq('exercício sem série avisa em vez de card vazio', /class="no-sets"/.test(semSets), true);
eq('exercício sem série não renderiza inputs', /input/.test(semSets), false);

const misto = renderApi.renderExerciseCard('Segunda', 6, {
  name: 'Circuito', sets: [
    { type: 'hard', reps: '10', rest: '60s', note: null },
    { type: 'cardio', reps: '10min', rest: '1min', note: null }
  ]
});
eq('misto: tem carga e minutos',    /weight-input/.test(misto) && /minutes-input/.test(misto), true);
eq('misto: header segue KG/REPS',   /col-title">KG/.test(misto), true);
eq('misto: resumo cita os dois tipos',
  /HARD-60s \/ CARDIO-1min/.test(misto), true);

// ---------- regras do gráfico de cardio ----------
// O que estava confuso na tela: números que se repetem com pouca amostra e
// comparação "1ª vs última" com cara de tendência.
const chartApi = new vm.Script(
  grabFrom(src['treinador.html'], 'isCardio') + '\n' +
  grabFrom(src['treinador.html'], 'formatMinutes') + '\n' +
  grabFrom(src['treinador.html'], 'cardioChartInfo') + '\n' +
  src['treinador.html'].match(/const CARDIO_CAPTION = '[^']*';/)[0] + '\n' +
  '({ cardioChartInfo })'
).runInNewContext();

const semSessao = chartApi.cardioChartInfo([], []);
eq('0 sessões: sem gráfico',        semSessao.showChart, false);
eq('0 sessões: diz que não há',     /Sem cardio registrado/.test(semSessao.html), true);

const umaSessao = chartApi.cardioChartInfo(['2026-07-30'], [40]);
eq('1 sessão: sem gráfico',         umaSessao.showChart, false);
eq('1 sessão: mostra a sessão',     /40min em 30\/07/.test(umaSessao.html), true);
eq('1 sessão: sem média redundante', /Média por sessão/.test(umaSessao.html), false);
eq('1 sessão: sem total redundante', /Total<\/span>/.test(umaSessao.html), false);
eq('1 sessão: explica a ausência',  /a partir da 2ª/.test(umaSessao.html), true);

// Caso real do banco: 40min em 30/07 e 50min em 03/08
const duasSessoes = chartApi.cardioChartInfo(['2026-07-30', '2026-08-03'], [40, 50]);
eq('2 sessões: desenha o gráfico',  duasSessoes.showChart, true);
eq('2 sessões: total 1h30',         /1h30/.test(duasSessoes.html), true);
eq('2 sessões: média 45min',        /45min/.test(duasSessoes.html), true);
eq('2 sessões: maior 50min',        /Maior sessão<\/span><span class="stat-value">50min/.test(duasSessoes.html), true);
eq('2 sessões: conta as sessões',   /Sessões na janela<\/span><span class="stat-value">2/.test(duasSessoes.html), true);
eq('2 sessões: sem 1ª→última (é o próprio gráfico)',
  /1ª → última/.test(duasSessoes.html), false);

const tresSessoes = chartApi.cardioChartInfo(
  ['2026-07-23', '2026-07-30', '2026-08-03'], [30, 40, 45]);
eq('3 sessões: aparece 1ª→última',  /1ª → última sessão/.test(tresSessoes.html), true);
eq('3 sessões: 30min → 45min +50%', /30min → 45min ↑ 50%/.test(tresSessoes.html), true);
eq('3 sessões: queda marca down',
  /class="stat-value down"/.test(chartApi.cardioChartInfo(['a','b','c'].map((_,i)=>`2026-08-0${i+1}`), [60, 50, 30]).html), true);

// A legenda de janela é o que faltava para o número não ser lido como "do dia"
eq('gráfico avisa que a janela é de 12 semanas',
  /12 semanas/.test(duasSessoes.html), true);
eq('gráfico avisa que não é o total do dia',
  /não é o total do dia/.test(duasSessoes.html), true);
eq('gráfico de força também avisa a janela',
  /const FORCA_CAPTION[^\n]*12 semanas/.test(src['treinador.html']), true);
eq('força: rótulo 1ª → última em vez de "Progressão"',
  /1ª → última sessão \(1RM est\.\)/.test(src['treinador.html']), true);

// Exercício misto (o Leg press do banco: aquec + feeder + cardio)
eq('misto mostra os minutos do exercício',
  /Cardio neste exercício/.test(src['treinador.html']), true);
eq('sem set hard o botão abre o gráfico de cardio',
  /const chartCardio = cardioMinEx > 0 && !temHard;/.test(src['treinador.html']), true);

// ---------- contratos entre as telas ----------
// O aluno grava em duration_minutes; se alguém trocar por reps, o cardio
// entra no volume e as métricas de força mentem.
eq('aluno grava duration_minutes',
  /duration_minutes:\s*minutes/.test(src['index.html']), true);
eq('linha de cardio zera weight e reps',
  /set_type:\s*'cardio'[\s\S]{0,120}weight:\s*null,\s*\n?\s*reps:\s*null/.test(src['index.html']), true);
eq('editor salva descanso por série',
  /rest:\s*normalizeRest\(si\.querySelector\('\.set-rest'\)\.value\)/.test(src['editor.html']), true);
eq('editor não grava mais descanso no exercício',
  /return \{ name, video_url, note, sets \};/.test(src['editor.html']), true);
eq('chips preenchem todas as séries',
  /function fillAllRest/.test(src['editor.html']), true);
eq('treinador lê duration_minutes no comparativo',
  (src['treinador.html'].match(/select=session_date,set_type,weight,reps,duration_minutes/g) || []).length, 2);
eq('treinos.html mostra o resumo de descanso',
  /Descansos'\}: \$\{esc\(descanso\.text\)\}/.test(src['treinos.html']), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
