// Valida workoutSummary (public/metrics.js) — a conta do resumo que aparece
// para o aluno ao encerrar o treino.
import fs from 'fs';
import vm from 'vm';

const METRICS = fs.readFileSync('public/metrics.js', 'utf8');
const api = new vm.Script(METRICS + '\n;window.Metrics').runInNewContext({ window: {} });
const { workoutSummary } = api;

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

const s = (exercise_name, set_number, set_type, weight, reps, duration_minutes = null) =>
  ({ exercise_name, set_number, set_type, weight, reps, duration_minutes });

const anterior = [
  s('Supino', 1, 'aquec', 20, 15),
  s('Supino', 2, 'serie', 40, 10),
  s('Supino', 3, 'serie', 40, 10),
  s('Tríceps', 1, 'serie', 25, 12),
  s('Esteira', 1, 'cardio', null, null, 10),
];
const hoje = [
  s('Supino', 1, 'aquec', 20, 15),
  s('Supino', 2, 'serie', 42.5, 10),
  s('Supino', 3, 'serie', 40, 8),
  s('Tríceps', 1, 'serie', 25, 12),
  s('Esteira', 1, 'cardio', null, null, 15),
  s('Crucifixo', 1, 'serie', 14, 12),   // exercício novo: sem comparação
];

const r = workoutSummary(hoje, anterior);
eq('tem sessão anterior', r.hasPrev, true);
eq('séries contadas', [r.sets, r.prevSets], [6, 5]);
eq('volume ignora aquecimento e cardio', [r.volume, r.prevVolume], [425 + 320 + 300 + 168, 400 + 400 + 300]);
eq('cardio somado', [r.cardio, r.prevCardio], [15, 10]);
eq('superou só no supino (e1rm subiu)', r.improved, [
  { exercise: 'Supino', weight: 42.5, reps: 10, prevWeight: 40, prevReps: 10 }
]);
// aquec igual = prata; 42,5×10 ouro; 40×8 bronze; tríceps igual prata;
// esteira 15>10 ouro; crucifixo sem referência = ouro (regra da bolinha)
eq('medalhas iguais às bolinhas', r.medals, { ouro: 3, prata: 2, bronze: 1 });

const primeira = workoutSummary(hoje, []);
eq('primeira vez: sem anterior', primeira.hasPrev, false);
eq('primeira vez: nada "superado"', primeira.improved, []);

eq('sem nada', workoutSummary([], []).sets, 0);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
