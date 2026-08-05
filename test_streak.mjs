// Valida a sequência (foguinho) do CARD DO ALUNO em professor.html, extraindo as
// funções reais do HTML. Garante que a regra é a mesma da tela de acompanhamento:
// só dia prescrito conta, descanso não quebra, hoje sem treino fica pendente.
import fs from 'fs';

function inlineScript(file) {
  return fs.readFileSync(file, 'utf8')
    .match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];
}

function grab(source, name) {
  const i = source.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`não achei ${name}`);
  let depth = 0, started = false;
  for (let p = i; p < source.length; p++) {
    if (source[p] === '{') { depth++; started = true; }
    else if (source[p] === '}') { depth--; if (started && depth === 0) return source.slice(i, p + 1); }
  }
  throw new Error(`fim não encontrado: ${name}`);
}

function api(file) {
  const js = inlineScript(file);
  const src = [
    js.match(/const DAYS = \[[^\]]*\];/)[0],
    js.match(/const STREAK_WINDOW_DAYS = \d+;/)[0],
    grab(js, 'toLocalISO'),
    grab(js, 'isTrainingDate'),
    grab(js, 'computeStreak'),
    'return { toLocalISO, isTrainingDate, computeStreak, STREAK_WINDOW_DAYS };'
  ].join('\n\n');
  return new Function(src)();
}

const prof = api('professor.html');
const trei = api('treinador.html');

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

const SEG_A_SEX = new Set(['Segunda','Terça','Quarta','Quinta','Sexta']);
const SEG_QUA_SEX = new Set(['Segunda','Quarta','Sexta']);
const d = (s) => new Date(s + 'T12:00:00');

// ---------- data local (não pode virar o dia à noite) ----------
eq('toLocalISO 22h30 não vira o dia', prof.toLocalISO(new Date(2026, 7, 4, 22, 30)), '2026-08-04');

// ---------- regra da sequência ----------
eq('semana cheia: fim de semana não quebra',
  prof.computeStreak(new Set(['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']), SEG_A_SEX, d('2026-08-09')).current,
  5);

eq('falta em dia prescrito quebra',
  prof.computeStreak(new Set(['2026-08-03','2026-08-04','2026-08-06','2026-08-07']), SEG_A_SEX, d('2026-08-09')).current,
  2);

eq('hoje sem treino ainda não quebra',
  prof.computeStreak(new Set(['2026-08-03']), SEG_A_SEX, d('2026-08-04')).current,
  1);

eq('falta ontem zera',
  prof.computeStreak(new Set(['2026-07-31']), SEG_A_SEX, d('2026-08-04')).current,
  0);

eq('plano 3x: dias vagos no meio não quebram',
  prof.computeStreak(new Set(['2026-08-03','2026-08-05','2026-08-07']), SEG_QUA_SEX, d('2026-08-09')).current,
  3);

const rec = prof.computeStreak(new Set(['2026-07-20','2026-07-21','2026-07-22','2026-07-23','2026-07-24']), SEG_A_SEX, d('2026-08-09'));
eq('recorde guardado com a atual zerada', [rec.current, rec.best], [0, 5]);

eq('sem treino algum', prof.computeStreak(new Set(), SEG_A_SEX, d('2026-08-09')).current, 0);

eq('sábado não é dia prescrito (seg-sex)', prof.isTrainingDate('2026-08-08', SEG_A_SEX), false);

// ---------- card e tela de detalhe têm que bater ----------
const cenarios = [
  [new Set(['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']), SEG_A_SEX, '2026-08-09'],
  [new Set(['2026-08-03','2026-08-05','2026-08-07']), SEG_QUA_SEX, '2026-08-09'],
  [new Set(['2026-08-03']), SEG_A_SEX, '2026-08-04'],
  [new Set(), SEG_A_SEX, '2026-08-09']
];
cenarios.forEach(([trained, presc, hoje], i) => {
  const a = prof.computeStreak(trained, presc, d(hoje)).current;
  const b = trei.computeStreak(trained, presc, d(hoje)).current;
  eq(`card == acompanhamento (cenário ${i + 1})`, a, b);
});

// ---------- dia do plano sem exercício não pode contar como treino ----------
// professor.html monta o Set filtrando structure[dia].length > 0; treinador.html faz
// o mesmo em prescribedDaySet(). Se um dia vazio contasse, viraria falta toda semana.
const profJs = inlineScript('professor.html');
eq('professor.html ignora dia vazio do plano',
  /Array\.isArray\(st\[d\]\) && st\[d\]\.length > 0/.test(profJs), true);
eq('treinador.html ignora dia vazio do plano',
  /length > 0/.test(grab(inlineScript('treinador.html'), 'prescribedDaySet')), true);

// ---------- ordenação alfabética da lista ----------
const byName = (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'pt-BR', { sensitivity: 'base' });
eq('ordem alfabética ignora acento e caixa',
  [{full_name:'Zé'},{full_name:'ana'},{full_name:'Ávila'},{full_name:'Bruno'}].sort(byName).map(x => x.full_name),
  ['ana','Ávila','Bruno','Zé']);
eq('professor.html ordena students com byName', /students = \(data \|\| \[\]\)\.sort\(byName\)/.test(profJs), true);
eq('professor.html ordena convites com byName', /pendingInvites = \(data \|\| \[\]\)\.sort\(byName\)/.test(profJs), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
