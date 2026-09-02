// Testes da MEDALHA da bolinha do Salvar (tela do aluno).
// A bolinha cheia diz como a série foi contra a MESMA série na sessão anterior
// daquele dia: ouro subiu o volume, prata empatou, bronze caiu, e sem
// referência é ouro.
//
// Duas camadas, as duas com o código REAL (nada copiado para cá):
//   1. setMedal, a regra pura que vive em public/metrics.js;
//   2. a cola com a tela (applyMedal e os helpers de referência de index.html),
//      rodada contra um DOM de mentira — é onde moram os erros que a regra
//      sozinha não pega: linha vazia que ganha cor, referência que não é lida,
//      medalha antiga que não sai da bolinha.
import fs from 'fs';
import vm from 'vm';

const inlineScript = (file) => {
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

const HTML = fs.readFileSync('index.html', 'utf8');
const ALUNO = inlineScript('index.html');
const METRICS = fs.readFileSync('public/metrics.js', 'utf8');

// ====================================================================
// 1. A regra pura (metrics.js)
// ====================================================================
const { setMedal } = new vm.Script(
  grabFrom(METRICS, 'setMedal') + '\n({ setMedal })'
).runInNewContext();

const musc = (weight, reps) => ({ weight, reps, duration_minutes: null });
const cardio = (min) => ({ weight: null, reps: null, duration_minutes: min });

eq('mais carga, mesmas reps → ouro',   setMedal(musc(60, 10), musc(50, 10)), 'ouro');
eq('mesma carga, mais reps → ouro',    setMedal(musc(50, 12), musc(50, 10)), 'ouro');
eq('série idêntica → prata',           setMedal(musc(50, 10), musc(50, 10)), 'prata');
eq('menos carga, mesmas reps → bronze', setMedal(musc(40, 10), musc(50, 10)), 'bronze');
eq('mesma carga, menos reps → bronze', setMedal(musc(50, 8), musc(50, 10)), 'bronze');

// O volume é o produto: trocar carga por repetição pode dar empate ou ganho.
eq('60×10 vs 50×12 → produto empata → prata', setMedal(musc(60, 10), musc(50, 12)), 'prata');
eq('mais carga com menos reps pode piorar',   setMedal(musc(60, 8), musc(50, 12)), 'bronze');

// Sem com o que comparar não existe piora.
eq('sem sessão anterior → ouro',       setMedal(musc(50, 10), null), 'ouro');
eq('anterior indefinido → ouro',       setMedal(musc(50, 10), undefined), 'ouro');
eq('anterior sem nada preenchido → ouro', setMedal(musc(50, 10), musc(null, null)), 'ouro');

// Peso corporal (ou aluno que só anotou reps): compara as repetições.
eq('sem carga nos dois lados: mais reps → ouro',  setMedal(musc(null, 15), musc(null, 12)), 'ouro');
eq('sem carga nos dois lados: menos reps → bronze', setMedal(musc(null, 10), musc(null, 12)), 'bronze');
// Carga em um lado só cai no denominador comum (reps) em vez de acusar recaída
// de quem apenas deixou o campo em branco.
eq('carga só na semana passada: compara reps',    setMedal(musc(null, 12), musc(50, 10)), 'ouro');
eq('carga só hoje: compara reps',                 setMedal(musc(50, 10), musc(null, 12)), 'bronze');
// Só carga registrada dos dois lados: a carga é o volume.
eq('só carga nos dois lados: subiu → ouro',       setMedal(musc(60, null), musc(50, null)), 'ouro');

// Cardio: o volume da linha é o tempo.
eq('cardio: mais minutos → ouro',   setMedal(cardio(40), cardio(30)), 'ouro');
eq('cardio: mesmos minutos → prata', setMedal(cardio(30), cardio(30)), 'prata');
eq('cardio: menos minutos → bronze', setMedal(cardio(20), cardio(30)), 'bronze');
eq('cardio: primeira vez → ouro',   setMedal(cardio(20), cardio(null)), 'ouro');

// Strings vindas do dataset (é assim que a tela entrega os valores).
eq('valores em texto contam igual', setMedal({ weight: '60', reps: '10', duration_minutes: '' },
                                             { weight: '50', reps: '10', duration_minutes: '' }), 'ouro');
eq('texto vazio não vira zero-volume', setMedal({ weight: '', reps: '12', duration_minutes: '' },
                                                { weight: '', reps: '10', duration_minutes: '' }), 'ouro');

// ====================================================================
// 2. A cola com a tela (index.html) sobre um DOM de mentira
// ====================================================================
const fakeApi = new vm.Script(
  grabFrom(METRICS, 'setMedal') + '\n' +
  grabFrom(ALUNO, 'parseCardioMinutes') + '\n' +
  ALUNO.match(/const MEDALHAS = \[[^\]]*\];/)[0] + '\n' +
  ALUNO.match(/const MEDAL_TITULO = \{[\s\S]*?\};/)[0] + '\n' +
  grabFrom(ALUNO, 'setRowRef') + '\n' +
  grabFrom(ALUNO, 'clearRowRef') + '\n' +
  grabFrom(ALUNO, 'rowRef') + '\n' +
  grabFrom(ALUNO, 'rowValues') + '\n' +
  grabFrom(ALUNO, 'applyMedal') + '\n' +
  '({ setRowRef, clearRowRef, rowRef, applyMedal, MEDALHAS })'
).runInNewContext();

// DOM mínimo: só o que applyMedal toca (classList, dataset, inputs, title).
const classList = (inicial) => {
  const set = new Set(inicial || []);
  return {
    add: (...n) => n.forEach(x => set.add(x)),
    remove: (...n) => n.forEach(x => set.delete(x)),
    contains: (n) => set.has(n),
    toggle: (n, on) => { on ? set.add(n) : set.delete(n); },
    valores: () => [...set]
  };
};

// preenchida: true = a série tem log (a bolinha está cheia, classe .done).
const fakeRow = ({ kg = '', reps = '', min = '', cardio = false, preenchida = true } = {}) => {
  const check = {
    classList: classList(preenchida ? ['done'] : []),
    title: null,
    removeAttribute() { this.title = null; }
  };
  return {
    check,
    classList: classList(cardio ? ['cardio-row'] : []),
    dataset: {},
    querySelector(sel) {
      if (sel === '.check-icon') return check;
      if (sel === '.weight-input') return cardio ? null : { value: kg };
      if (sel === '.reps-input') return cardio ? null : { value: reps };
      if (sel === '.minutes-input') return cardio ? { value: min } : null;
      return null;
    }
  };
};

const medalhaDe = (row) => (row.check.classList.valores().find(c => c.startsWith('medal-')) || null);

// Ida e volta da referência guardada na linha.
{
  const row = fakeRow({ kg: '60', reps: '10' });
  fakeApi.setRowRef(row, { weight: 50, reps: 10, duration_minutes: null });
  eq('referência guardada na linha', { ...row.dataset }, { refWeight: '50', refReps: '10', refMinutes: '' });
  eq('referência lida de volta', fakeApi.rowRef(row), { weight: '50', reps: '10', duration_minutes: '' });
  fakeApi.clearRowRef(row);
  eq('referência limpa some do dataset', { ...row.dataset }, {});
  eq('sem referência rowRef devolve null', fakeApi.rowRef(row), null);
}

// Referência de série sem carga (peso corporal) ainda é referência.
{
  const row = fakeRow({ reps: '15' });
  fakeApi.setRowRef(row, { weight: null, reps: 12, duration_minutes: null });
  eq('referência só de reps não é null', fakeApi.rowRef(row) !== null, true);
}

// applyMedal: a cor sai da comparação com a referência.
{
  const melhorou = fakeRow({ kg: '60', reps: '10' });
  fakeApi.setRowRef(melhorou, { weight: 50, reps: 10, duration_minutes: null });
  fakeApi.applyMedal(melhorou);
  eq('subiu o volume → ouro na bolinha', medalhaDe(melhorou), 'medal-ouro');
  eq('ouro explica o porquê', melhorou.check.title, 'Volume acima da última vez');

  const empatou = fakeRow({ kg: '50', reps: '10' });
  fakeApi.setRowRef(empatou, { weight: 50, reps: 10, duration_minutes: null });
  fakeApi.applyMedal(empatou);
  eq('empatou → prata', medalhaDe(empatou), 'medal-prata');

  const caiu = fakeRow({ kg: '40', reps: '10' });
  fakeApi.setRowRef(caiu, { weight: 50, reps: 10, duration_minutes: null });
  fakeApi.applyMedal(caiu);
  eq('caiu → bronze', medalhaDe(caiu), 'medal-bronze');
}

// Sem referência: ouro, mas o texto não inventa uma "última vez".
{
  const primeira = fakeRow({ kg: '50', reps: '10' });
  fakeApi.applyMedal(primeira);
  eq('sem parâmetro → ouro', medalhaDe(primeira), 'medal-ouro');
  eq('sem parâmetro não fala em última vez', primeira.check.title, 'Primeiro registro desta série');
}

// Linha vazia não ganha medalha (a bolinha nem está cheia).
{
  const vazia = fakeRow({ preenchida: false });
  fakeApi.setRowRef(vazia, { weight: 50, reps: 10, duration_minutes: null });
  fakeApi.applyMedal(vazia);
  eq('série vazia fica sem medalha', medalhaDe(vazia), null);
  eq('série vazia fica sem título', vazia.check.title, null);
}

// Salvar de novo com outro valor troca a cor: sem o remove, a bolinha ficaria
// com duas medalhas e a primeira (mais forte no CSS) mandaria na cor.
{
  const row = fakeRow({ kg: '60', reps: '10' });
  fakeApi.setRowRef(row, { weight: 50, reps: 10, duration_minutes: null });
  fakeApi.applyMedal(row);
  const depois = fakeRow({ kg: '40', reps: '10' });
  depois.check.classList.add('medal-ouro'); // resíduo do salvar anterior
  fakeApi.setRowRef(depois, { weight: 50, reps: 10, duration_minutes: null });
  fakeApi.applyMedal(depois);
  eq('medalha anterior sai da bolinha',
    depois.check.classList.valores().filter(c => c.startsWith('medal-')), ['medal-bronze']);
}

// Cardio passa pelos minutos, não por kg×reps.
{
  const row = fakeRow({ min: '40', cardio: true });
  fakeApi.setRowRef(row, { weight: null, reps: null, duration_minutes: 30 });
  fakeApi.applyMedal(row);
  eq('cardio com mais minutos → ouro', medalhaDe(row), 'medal-ouro');
}

// ====================================================================
// 3. Onde a tela chama (o que o DOM falso não alcança)
// ====================================================================
eq('sintaxe ok: index.html',
  (() => { try { new vm.Script(ALUNO, { filename: 'index.html' }); return null; } catch (e) { return e.message; } })(), null);

// A referência precisa ser gravada ANTES do return que pula a série já logada
// hoje — senão a linha que o aluno acabou de preencher fica sem com o que
// comparar e cai em ouro para sempre.
{
  const trecho = ALUNO.slice(ALUNO.indexOf('lastData.forEach'), ALUNO.indexOf('lastData.forEach') + 900);
  eq('loadLastWorkout guarda a referência antes do excludeSets',
    trecho.indexOf('setRowRef(row, record)') < trecho.indexOf('excludeSets && excludeSets.has'), true);
}

// A cor só pode ser pintada depois que loadLastWorkout trouxe a referência.
eq('loadTodayData pinta as medalhas depois do loadLastWorkout',
  /await loadLastWorkout\(day, setsWithData\);[\s\S]{0,300}?dayRows\(day\)\.forEach\(applyMedal\)/.test(ALUNO), true);

eq('markSaved aplica a medalha', /check\.classList\.remove\('just-saved'\);\s*\n\s*applyMedal\(row\);/.test(ALUNO), true);

// Trocar de dia tem de levar a referência junto: a do dia que saiu compararia
// a série errada.
eq('resetDayInputs limpa a referência', /function resetDayInputs[\s\S]*?clearRowRef\(row\)/.test(ALUNO), true);
eq('resetDayInputs tira a medalha da bolinha',
  /classList\.remove\('done', 'just-saved', \.\.\.MEDALHAS\)/.test(ALUNO), true);

// ====================================================================
// 4. CSS: as três cores existem e a bolinha as usa
// ====================================================================
eq('CSS define ouro, prata e bronze',
  ['.check-icon.medal-ouro', '.check-icon.medal-prata', '.check-icon.medal-bronze'].every(s => HTML.includes(s)), true);
eq('a bolinha cheia usa a cor da medalha', /\.check-icon\.done \{[\s\S]*?var\(--medal\)/.test(HTML), true);
// Sem esse fallback, uma bolinha sem classe de medalha ficaria transparente.
eq('sem medalha vale a cor do tema', /\.check-icon \{ --medal: var\(--save-done\); \}/.test(HTML), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
