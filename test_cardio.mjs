// Testes das funções novas de DESCANSO e CARDIO.
// Extrai as funções REAIS dos HTMLs (nada de cópia colada aqui) e ainda
// compila o <script> inline de cada tela para pegar erro de sintaxe —
// como não há build, isso é a única rede de proteção contra tela branca.
import fs from 'fs';
import vm from 'vm';

const inlineScript = (file) => {
  // A página pode ter mais de um <script> inline (ex: index.html tem um
  // pequeno de bootstrap antes do principal). O maior é sempre o da página.
  const html = fs.readFileSync(file, 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (blocks.length === 0) throw new Error('sem script inline em ' + file);
  return blocks.sort((a, b) => b.length - a.length)[0];
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

const FILES = ['editor.html', 'index.html', 'treinador.html', 'treinos.html', 'evolucao.html'];
const src = {};
FILES.forEach(f => { src[f] = inlineScript(f); });

// As contas de cardio/data/volume saíram dos HTMLs para o módulo compartilhado.
// O teste passa a ler de lá — é a mesma função que as três telas carregam.
const METRICS = fs.readFileSync('public/metrics.js', 'utf8');

// ---------- sintaxe das telas ----------
FILES.forEach(f => {
  let erro = null;
  try { new vm.Script(src[f], { filename: f }); } catch (e) { erro = e.message; }
  eq(`sintaxe ok: ${f}`, erro, null);
});

// metrics.js é script clássico (não módulo): mesma checagem de sintaxe.
{
  let erro = null;
  try { new vm.Script(METRICS, { filename: 'metrics.js' }); } catch (e) { erro = e.message; }
  eq('sintaxe ok: public/metrics.js', erro, null);
}

// ---------- normalizeRest (as 3 telas precisam concordar) ----------
const editorApi = new vm.Script(
  // emptySetOffenders lê o modo do editor; no sandbox não há página, então os
  // globais são fixados no modo semanal (o caso que este teste cobre).
  "let currentMode = 'weekly';\nlet cycleLetters = ['A', 'B', 'C'];\n" +
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

// ---------- agregação (metrics.js, usada pelo treinador e pelo aluno) ----------
const trainerApi = new vm.Script(
  grabFrom(METRICS, 'isCardio') + '\n' +
  grabFrom(METRICS, 'sumCardioMinutes') + '\n' +
  grabFrom(METRICS, 'formatMinutes') + '\n' +
  grabFrom(METRICS, 'cardioByDate') + '\n' +
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
  src['index.html'].match(/const REST_UNIT = .*;/)[0] + '\n' +
  grabFrom(src['index.html'], 'restUnitToSeconds') + '\n' +
  grabFrom(src['index.html'], 'restToSeconds') + '\n' +
  grabFrom(src['index.html'], 'restLabel') + '\n' +
  grabFrom(src['index.html'], 'restSummary') + '\n' +
  grabFrom(src['index.html'], 'isCardioSet') + '\n' +
  grabFrom(src['index.html'], 'renderExerciseCard') + '\n' +
  '({ renderExerciseCard, restToSeconds })'
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
// O descanso prescrito vira botão na linha da série (2min, 2min, 3min).
eq('força: um botão de descanso por série',
  (cardForca.match(/class="rest-timer-btn"/g) || []).length, 3);
eq('força: botão abre o tempo daquela série',
  /openRestTimer\(120,[\s\S]*openRestTimer\(120,[\s\S]*openRestTimer\(180,/.test(cardForca), true);
eq('força: rótulo do botão é o tempo prescrito',
  />2min<\/button>[\s\S]*>3min<\/button>/.test(cardForca), true);
// Sem pill: repetir na pill o que já está em cada linha era ruído.
eq('força: sem pill quando todo descanso virou botão',
  /rest-pill/.test(cardForca), false);
eq('força: coluna do descanso tem título',
  /col-title col-rest/.test(cardForca), true);
eq('força: mantém KG e REPS',       /KG[\s\S]*REPS/.test(cardForca), true);
eq('força: sem input de minutos',   /minutes-input/.test(cardForca), false);

const cardUniforme = renderApi.renderExerciseCard('Segunda', 2, {
  name: 'Rosca direta', sets: [
    { type: 'hard', reps: '10', rest: '90', note: null },
    { type: 'hard', reps: '10', rest: '90s', note: null }
  ]
});
eq('descanso igual: botão em cada uma das duas séries',
  (cardUniforme.match(/class="rest-timer-btn"/g) || []).length, 2);
eq('descanso igual: "90" e "90s" dão o mesmo tempo',
  (cardUniforme.match(/openRestTimer\(90,/g) || []).length, 2);

const semDescanso = renderApi.renderExerciseCard('Segunda', 3, {
  name: 'Elevação lateral', sets: [{ type: 'hard', reps: '10', note: null }]
});
eq('sem descanso prescrito: sem pill', /rest-pill/.test(semDescanso), false);
// Sem tempo nenhum a coluna NAO existe: nem célula vazia, nem título, nem
// a classe que abre a 5ª coluna na grade.
eq('sem descanso prescrito: sem coluna de tempo',
  /rest-cell|col-rest|has-rest/.test(semDescanso), false);
eq('sem descanso prescrito: header volta ao formato antigo',
  /<div class="set-row set-header"><span class="set-label"><\/span><span class="col-title">KG<\/span><span class="col-title">REPS<\/span><span><\/span><\/div>/.test(semDescanso),
  true);
// Texto livre também não cria coluna: nada ali vira cronômetro.
const soLivre = renderApi.renderExerciseCard('Segunda', 9, {
  name: 'Alongamento', sets: [{ type: 'hard', reps: '30s', rest: 'até recuperar', note: null }]
});
eq('só texto livre: sem coluna de tempo', /col-rest|rest-cell/.test(soLivre), false);
eq('só texto livre: pill ainda informa o combinado',
  /rest-value">até recuperar</.test(soLivre), true);

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
eq('misto: botão de descanso nas duas linhas',
  /openRestTimer\(60,[\s\S]*openRestTimer\(60,/.test(misto), true);
eq('misto: linha de cardio também tem título da coluna',
  /col-title col-rest/.test(misto), true);

// Texto livre não vira cronômetro: continua visível como leitura na pill.
const livre = renderApi.renderExerciseCard('Segunda', 7, {
  name: 'Prancha', sets: [
    { type: 'hard', reps: '30s', rest: 'até recuperar', note: null },
    { type: 'hard', reps: '30s', rest: '90s', note: null }
  ]
});
eq('livre: só a série com tempo válido ganha botão',
  (livre.match(/class="rest-timer-btn"/g) || []).length, 1);
eq('livre: singular quando a pill lista um item só',
  /Descanso:<\/span>/.test(livre), true);
eq('livre: a pill guarda o que não virou botão',
  /rest-value">HARD-até recuperar<\/span>/.test(livre), true);
eq('livre: célula vazia mantém a grade alinhada',
  (livre.match(/<span class="rest-cell"><\/span>/g) || []).length, 1);
eq('livre: uma série com tempo já abre a coluna',
  /class="set-row has-rest"/.test(livre), true);
eq('faixa 60-90s usa o maior valor',
  /openRestTimer\(90,/.test(renderApi.renderExerciseCard('Segunda', 8, {
    name: 'Remada', sets: [{ type: 'hard', reps: '10', rest: '60-90s', note: null }]
  })), true);

// ---------- regras do gráfico de cardio ----------
// O que estava confuso na tela: números que se repetem com pouca amostra e
// comparação "1ª vs última" com cara de tendência.
const chartApi = new vm.Script(
  grabFrom(METRICS, 'isCardio') + '\n' +
  grabFrom(METRICS, 'formatMinutes') + '\n' +
  grabFrom(METRICS, 'cardioChartInfo') + '\n' +
  METRICS.match(/const CARDIO_CAPTION = '[^']*';/)[0] + '\n' +
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
  /const FORCA_CAPTION[^\n]*12 semanas/.test(METRICS), true);
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
eq('descanso é escolhido por série, não em bloco',
  /function fillAllRest/.test(src['editor.html']), false);
eq('campo de descanso abre o seletor',
  /class="set-rest"[^>]*onfocus="openRestPicker\(this\)"/.test(src['editor.html']), true);
eq('pickRest altera só o campo aberto',
  /function pickRest\(value\) \{[\s\S]{0,200}restPickerInput\.value = value;/.test(src['editor.html']), true);
eq('"usar em todas" existe como ação explícita',
  /function applyRestToAll/.test(src['editor.html']), true);
eq('a fileira de chips de descanso saiu do card',
  /renderRestChips/.test(src['editor.html']), false);

// Markup real do seletor, com ensureRestPicker trocado por um stub.
const pickerApi = new vm.Script(
  grabFrom(src['editor.html'], 'normalizeRest') + '\n' +
  src['editor.html'].match(/const REST_PRESETS = \[[^\]]*\];/)[0] + '\n' +
  'let restPickerInput = null; let __html = "";\n' +
  'function ensureRestPicker() { return { set innerHTML(v) { __html = v; } }; }\n' +
  grabFrom(src['editor.html'], 'renderRestPicker') + '\n' +
  '({ render: (v) => { restPickerInput = { value: v }; renderRestPicker(); return __html; } })'
).runInNewContext();

const pickerVazio = pickerApi.render('');
eq('seletor: uma opção por preset',
  (pickerVazio.match(/class="rest-opt/g) || []).length, editorApi.REST_PRESETS.length);
eq('seletor: título deixa claro que é só desta série',
  /Descanso desta série/.test(pickerVazio), true);
eq('seletor: campo vazio não acende nenhuma opção', /rest-opt on/.test(pickerVazio), false);
eq('seletor: tem Limpar', /onclick="pickRest\(''\)">Limpar/.test(pickerVazio), true);
eq('seletor: "usar em todas" é opt-in', /applyRestToAll\(\)">Usar em todas/.test(pickerVazio), true);
eq('seletor: avisa que dá para digitar', /digite direto no campo/.test(pickerVazio), true);

eq('seletor: acende a opção do valor atual',
  /class="rest-opt on" onclick="pickRest\('90s'\)">90s</.test(pickerApi.render('90s')), true);
eq('seletor: acende mesmo com valor não normalizado (90)',
  /class="rest-opt on" onclick="pickRest\('90s'\)"/.test(pickerApi.render('90')), true);
eq('seletor: valor livre não acende nada',
  /rest-opt on/.test(pickerApi.render('até recuperar')), false);
eq('treinador lê duration_minutes no comparativo',
  (src['treinador.html'].match(/select=session_date,set_type,weight,reps,duration_minutes/g) || []).length, 2);
eq('treinos.html mostra o resumo de descanso',
  /Descansos'\}: \$\{esc\(descanso\.text\)\}/.test(src['treinos.html']), true);

// ---------- comparativo do card do dia (hoje vs. último treino) ----------
// É a pergunta diária: o cardio de hoje foi maior que o do treino anterior?
const cmpApi = new vm.Script(
  grabFrom(METRICS, 'isCardio') + '\n' +
  grabFrom(METRICS, 'formatMinutes') + '\n' +
  grabFrom(METRICS, 'cardioByDate') + '\n' +
  grabFrom(METRICS, 'formatDayMonth') + '\n' +
  grabFrom(METRICS, 'previousCardioSession') + '\n' +
  grabFrom(METRICS, 'cardioComparison') + '\n' +
  '({ previousCardioSession, cardioComparison, formatDayMonth })'
).runInNewContext();

const historico = [
  { session_date: '2026-07-30', exercise_name: 'Bike', set_type: 'cardio', duration_minutes: 40 },
  { session_date: '2026-07-30', exercise_name: 'Esteira', set_type: 'cardio', duration_minutes: 10 },
  { session_date: '2026-07-23', exercise_name: 'Bike', set_type: 'cardio', duration_minutes: 30 },
  { session_date: '2026-07-23', exercise_name: 'Supino', set_type: 'hard', duration_minutes: null }
];

eq('sessão anterior é a mais recente antes da data',
  cmpApi.previousCardioSession(historico, '2026-08-05'), { date: '2026-07-30', minutes: 50 });
eq('sessão anterior ignora a própria data',
  cmpApi.previousCardioSession(historico, '2026-07-30'), { date: '2026-07-23', minutes: 30 });
eq('sem histórico anterior devolve null',
  cmpApi.previousCardioSession(historico, '2026-07-01'), null);
eq('previousCardioSession tolera null', cmpApi.previousCardioSession(null, '2026-08-05'), null);
eq('só o mesmo exercício entra na comparação do card',
  cmpApi.previousCardioSession(historico.filter(r => r.exercise_name === 'Bike'), '2026-08-05'),
  { date: '2026-07-30', minutes: 40 });
eq('musculação não vira sessão de cardio',
  cmpApi.previousCardioSession(historico.filter(r => r.exercise_name === 'Supino'), '2026-08-05'), null);

const subiu = cmpApi.cardioComparison(50, { date: '2026-07-30', minutes: 40 }, 'hoje');
eq('subiu: direção up', subiu.dir, 'up');
eq('subiu: +25%', subiu.diff, 25);
eq('subiu: texto do card', /hoje <strong class="cmp-now">50min<\/strong> · último <strong class="cmp-prev">40min<\/strong> <span class="cmp-up">↑25%<\/span> <span class="cmp-when">em 30\/07<\/span>/.test(subiu.html), true);

const caiu = cmpApi.cardioComparison(30, { date: '2026-08-03', minutes: 40 }, 'hoje');
eq('caiu: direção down', caiu.dir, 'down');
eq('caiu: -25%', caiu.diff, -25);
eq('caiu: seta para baixo', /cmp-down">↓25%/.test(caiu.html), true);

const igual = cmpApi.cardioComparison(40, { date: '2026-08-03', minutes: 40 }, 'hoje');
eq('igual: sem seta enganosa', igual.dir, 'flat');
eq('igual: diz "igual"', /= igual/.test(igual.html), true);

const primeiro = cmpApi.cardioComparison(50, null, 'hoje');
eq('primeiro registro: sem porcentagem', primeiro.diff, null);
eq('primeiro registro: avisa que é o 1º', /1º cardio registrado/.test(primeiro.html), true);
eq('primeiro registro: não inventa 100%', /%/.test(primeiro.html), false);
eq('anterior zerado é tratado como primeiro',
  cmpApi.cardioComparison(50, { date: '2026-07-30', minutes: 0 }, 'hoje').dir, 'first');
eq('sem cardio no dia não gera comparativo', cmpApi.cardioComparison(0, null, 'hoje'), null);
eq('data passada usa a data no lugar de "hoje"',
  /^03\/08 <strong/.test(cmpApi.cardioComparison(50, null, '03/08').html), true);
eq('formatDayMonth', cmpApi.formatDayMonth('2026-08-05'), '05/08');

// Contratos de tela do comparativo
eq('card do dia usa o comparativo',
  /🏃 Cardio: \$\{cmpDia\.html\}/.test(src['treinador.html']), true);
eq('card do exercício usa o comparativo',
  /cardioComparison\(cardioMinEx, prevEx, cmpLabel\)/.test(src['treinador.html']), true);
eq('"hoje" só quando a data é hoje',
  /date === toLocalISO\(new Date\(\)\) \? 'hoje'/.test(src['treinador.html']), true);
eq('busca o cardio anterior na mesma leva de queries',
  /session_date=lt\.\$\{date\}&duration_minutes=not\.is\.null/.test(src['treinador.html']), true);

// ---------- ficha formatada (treinos.html) ----------
// Sandbox próprio: reaproveitar o do renderExerciseCard reusaria o mesmo
// contexto e o `const esc` colidiria.
const fichaCtx = {
  document: {
    createElement: () => ({
      textContent: '',
      get innerHTML() { return escapeHtml(this.textContent); }
    })
  },
  escapeHtml
};

const fichaApi = new vm.Script(
  src['treinos.html'].match(/const esc = \(s\) => \{[\s\S]*?\};/)[0] + '\n' +
  grabFrom(src['treinos.html'], 'normalizeRest') + '\n' +
  grabFrom(src['treinos.html'], 'restLabel') + '\n' +
  grabFrom(src['treinos.html'], 'restSummary') + '\n' +
  grabFrom(src['treinos.html'], 'isCardioType') + '\n' +
  grabFrom(src['treinos.html'], 'groupLabel') + '\n' +
  grabFrom(src['treinos.html'], 'safeVideoUrl') + '\n' +
  grabFrom(src['treinos.html'], 'renderViewExercise') + '\n' +
  grabFrom(src['treinos.html'], 'renderViewDay') + '\n' +
  '({ renderViewExercise, renderViewDay, safeVideoUrl, groupLabel })'
).runInNewContext(fichaCtx);

const fichaForca = fichaApi.renderViewExercise({
  name: 'Supino reto', video_url: 'https://youtu.be/abc', note: 'Pegada média',
  sets: [
    { type: 'aquec', reps: '12-15', rest: '2min' },
    { type: 'hard', reps: '8-12', rest: '3min', note: 'até a falha' }
  ]
}, 1);
eq('ficha: exercício é um card',        /class="v-ex"/.test(fichaForca), true);
eq('ficha: número do exercício',        /class="v-ex-num">1</.test(fichaForca), true);
eq('ficha: nome destacado',             /class="v-ex-name">Supino reto</.test(fichaForca), true);
eq('ficha: séries em pills',            (fichaForca.match(/class="v-set"/g) || []).length, 2);
eq('ficha: tipo e valor separados',
  /class="v-set-type">AQUEC<\/span><span class="v-set-val">12-15</.test(fichaForca), true);
eq('ficha: descanso em pill própria',   /class="v-pill">⏱ Descansos: AQUEC-2min \/ HARD-3min</.test(fichaForca), true);
eq('ficha: vídeo vira link',            /<a class="v-pill link" href="https:\/\/youtu.be\/abc"/.test(fichaForca), true);
eq('ficha: link não abre no mesmo app', /rel="noopener"/.test(fichaForca), true);
eq('ficha: nota do exercício',          /class="v-note">❗ Pegada média</.test(fichaForca), true);
eq('ficha: nota de série',              /class="v-note sub">📝 HARD: até a falha</.test(fichaForca), true);
eq('ficha: sem tag de cardio em força', /v-tag cardio/.test(fichaForca), false);

const fichaCardio = fichaApi.renderViewExercise({
  name: 'Bike ergométrica', sets: [{ type: 'cardio', reps: '40min' }]
}, 3);
eq('ficha: cardio ganha tag',           /class="v-tag cardio">🏃 Cardio</.test(fichaCardio), true);
eq('ficha: pill de cardio marcada',     /class="v-set cardio"/.test(fichaCardio), true);
eq('ficha: tempo aparece como valor',   /v-set-val">40min</.test(fichaCardio), true);

const fichaVazia = fichaApi.renderViewExercise({ name: 'Furado', sets: [] }, 2);
eq('ficha: exercício sem série avisa',  /class="v-empty">Sem séries definidas</.test(fichaVazia), true);
eq('ficha: sem nome não quebra',
  /v-ex-name">Sem nome</.test(fichaApi.renderViewExercise({ sets: [] }, 1)), true);

eq('ficha: url perigosa não vira link', fichaApi.safeVideoUrl('javascript:alert(1)'), null);
eq('ficha: url http passa',             fichaApi.safeVideoUrl('http://x.com/v'), 'http://x.com/v');
eq('ficha: campo vazio não vira link',  fichaApi.safeVideoUrl(''), null);
eq('ficha: exercício com url inválida não renderiza <a>',
  /<a /.test(fichaApi.renderViewExercise({ name: 'X', video_url: 'javascript:alert(1)', sets: [] }, 1)), false);

eq('ficha: rótulo de grupo por tamanho',
  [2, 3, 4].map(fichaApi.groupLabel), ['BISET', 'TRISET', 'GIANT SET']);

const diaFicha = fichaApi.renderViewDay('Segunda', [
  { name: 'Supino', group: 'g1', sets: [{ type: 'hard', reps: '10' }] },
  { name: 'Crucifixo', group: 'g1', sets: [{ type: 'hard', reps: '12' }] },
  { name: 'Rosca', sets: [{ type: 'hard', reps: '10' }] }
]);
eq('dia: cabeçalho com contagem',   /v-day-name">Segunda<\/span>\s*<span class="v-day-count">3 exercícios</.test(diaFicha), true);
eq('dia: grupo tem moldura',        /class="v-group"><span class="v-group-label">🔗 BISET</.test(diaFicha), true);
eq('dia: numeração é contínua',     (diaFicha.match(/v-ex-num">(\d)</g) || []).join(','), 'v-ex-num">1<,v-ex-num">2<,v-ex-num">3<');
eq('dia: grupo de 1 não vira moldura',
  /v-group/.test(fichaApi.renderViewDay('Terça', [{ name: 'Solto', group: 'g9', sets: [] }])), false);
eq('dia: singular quando é 1 exercício',
  /1 exercício</.test(fichaApi.renderViewDay('Terça', [{ name: 'Solto', sets: [] }])), true);
eq('viewPlan usa o novo render',    /renderViewDay\(day, list\)/.test(src['treinos.html']), true);
eq('ficha: chips de resumo no topo', /class="v-chips"/.test(src['treinos.html']), true);

// ====================================================================
// Nenhuma função compartilhada ficou órfã.
// Ao mover as contas para metrics.js, o risco é a tela usar um nome que não
// existe mais nela e não carregar o módulo — a página abre em branco e nenhum
// teste de sintaxe pega isso, porque o erro é só em tempo de execução.
// ====================================================================
{
  const shared = [...METRICS.matchAll(/^(?:function|const)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  eq('metrics.js expõe as funções esperadas',
    ['toLocalISO', 'computeStreak', 'isTrainingDate', 'prescribedDaySet', 'e1rm',
     'formatMinutes', 'formatDurationHM', 'cardioByDate', 'sumCardioMinutes',
     'cardioChartInfo', 'getWeekRange', 'hardVolume', 'isEffectiveSet'].every(n => shared.includes(n)), true);

  const PAGES = ['index.html', 'professor.html', 'treinador.html', 'evolucao.html',
                 'editor.html', 'treinos.html', 'anamnese.html', 'anotacoes.html', 'owner.html'];
  const orfaos = [];
  PAGES.forEach(f => {
    const html = fs.readFileSync(f, 'utf8');
    const js = inlineScript(f);
    const carregaMetrics = /<script src="\/metrics\.js"><\/script>/.test(html);
    if (carregaMetrics) return;  // tem tudo disponível
    shared.forEach(nome => {
      const usa = new RegExp(`\\b${nome}\\s*[(\\[.,;)]`).test(js);
      const declara = new RegExp(`(?:function|const|let|var)\\s+${nome}\\b`).test(js);
      if (usa && !declara) orfaos.push(`${f}: ${nome}`);
    });
  });
  eq('nenhuma tela usa função compartilhada sem carregar metrics.js', orfaos, []);

  // Colisão de nome entre metrics.js e o script inline.
  // Dois <script> clássicos dividem o MESMO escopo lexical global: um `const DAYS`
  // repetido nos dois estoura "Identifier has already been declared" e a tela abre
  // em branco. Concatenar e parsear reproduz exatamente esse erro — e nenhuma
  // checagem de sintaxe arquivo-por-arquivo o pegaria.
  const colisoes = [];
  PAGES.forEach(f => {
    if (!/<script src="\/metrics\.js"><\/script>/.test(fs.readFileSync(f, 'utf8'))) return;
    try { new vm.Script(METRICS + '\n' + inlineScript(f), { filename: f }); }
    catch (e) { colisoes.push(`${f}: ${e.message}`); }
  });
  eq('metrics.js + script da tela convivem no mesmo escopo', colisoes, []);
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
