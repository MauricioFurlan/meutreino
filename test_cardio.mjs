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

// ---------- normalizeRest (editor e aluno precisam concordar) ----------
const editorApi = new vm.Script(
  grabFrom(src['editor.html'], 'normalizeRest') + '\n' +
  grabFrom(src['editor.html'], 'isCardioType') + '\n' +
  src['editor.html'].match(/const REST_PRESETS = \[[^\]]*\];/)[0] + '\n' +
  '({ normalizeRest, isCardioType, REST_PRESETS })'
).runInNewContext();

const alunoApi = new vm.Script(
  grabFrom(src['index.html'], 'normalizeRest') + '\n' +
  grabFrom(src['index.html'], 'isCardioSet') + '\n' +
  grabFrom(src['index.html'], 'parseCardioMinutes') + '\n' +
  '({ normalizeRest, isCardioSet, parseCardioMinutes })'
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
  name: 'Supino reto', rest: '90', sets: [
    { type: 'aquec', reps: '12-15', note: null },
    { type: 'hard', reps: '8-12', note: null }
  ]
});
eq('força: pill de descanso',       /class="rest-pill"/.test(cardForca), true);
eq('força: descanso normalizado',   /90s<\/span>/.test(cardForca), true);
eq('força: mantém KG e REPS',       /KG[\s\S]*REPS/.test(cardForca), true);
eq('força: sem input de minutos',   /minutes-input/.test(cardForca), false);

const semDescanso = renderApi.renderExerciseCard('Segunda', 2, {
  name: 'Rosca direta', sets: [{ type: 'hard', reps: '10', note: null }]
});
eq('sem descanso prescrito: sem pill', /rest-pill/.test(semDescanso), false);

const misto = renderApi.renderExerciseCard('Segunda', 3, {
  name: 'Circuito', rest: '60s', sets: [
    { type: 'hard', reps: '10', note: null },
    { type: 'cardio', reps: '10min', note: null }
  ]
});
eq('misto: tem carga e minutos',    /weight-input/.test(misto) && /minutes-input/.test(misto), true);
eq('misto: header segue KG/REPS',   /col-title">KG/.test(misto), true);

// ---------- contratos entre as telas ----------
// O aluno grava em duration_minutes; se alguém trocar por reps, o cardio
// entra no volume e as métricas de força mentem.
eq('aluno grava duration_minutes',
  /duration_minutes:\s*minutes/.test(src['index.html']), true);
eq('linha de cardio zera weight e reps',
  /set_type:\s*'cardio'[\s\S]{0,120}weight:\s*null,\s*\n?\s*reps:\s*null/.test(src['index.html']), true);
eq('editor salva rest no plano',
  /rest\s*=\s*restEl\s*\?\s*\(normalizeRest/.test(src['editor.html']), true);
eq('treinador lê duration_minutes no comparativo',
  (src['treinador.html'].match(/select=session_date,set_type,weight,reps,duration_minutes/g) || []).length, 2);
eq('treinos.html mostra o descanso',
  /Descanso \$\{esc\(rest\)\}/.test(src['treinos.html']), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
