// Regras do push do aluno (supabase/functions/send-push/decide.mjs).
// Roda em UTC de propósito: é o fuso do runtime da Edge Function, e é ali que
// o brazilNow() precisa acertar o dia e a hora de Brasília.
process.env.TZ = 'UTC';

import fs from 'node:fs';
import { build, OUT } from './gen_push_metrics.mjs';
const M = (await import('./' + OUT)).default;
const { analyze, brazilNow, buildMessage, canReceive, dueKinds } =
  await import('./supabase/functions/send-push/decide.mjs');

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

// Horário de Brasília → instante real (UTC = BR + 3h)
const br = (y, mo, d, h, mi = 0) => brazilNow(Date.UTC(y, mo - 1, d, h + 3, mi));
const log = (session_date, weekday, extra = {}) => ({ session_date, weekday, created_at: session_date + 'T10:00:00Z', ...extra });

// ---------- cópia gerada em dia ----------
eq('metrics.gen.mjs igual ao public/metrics.js (rode node gen_push_metrics.mjs)', fs.readFileSync(OUT, 'utf8') === build(), true);

// ---------- fuso ----------
const seg7 = br(2026, 11, 16, 7, 5);        // segunda 16/11, 07:05 em Brasília
eq('brazilNow: dia de Brasília', M.toLocalISO(seg7), '2026-11-16');
eq('brazilNow: hora de Brasília', seg7.getHours(), 7);
eq('brazilNow: 22h30 de Brasília ainda é o mesmo dia', M.toLocalISO(br(2026, 11, 16, 22, 30)), '2026-11-16');

// ---------- relógio ----------
const prefs = { reminder_on: true, reminder_time: '07:00:00', risk_on: true, last_reminder_on: null, last_risk_on: null };
eq('lembrete na hora', dueKinds(prefs, seg7, '2026-11-16'), ['reminder']);
eq('antes da hora: nada', dueKinds(prefs, br(2026, 11, 16, 6, 50), '2026-11-16'), []);
eq('2h depois: janela fechou', dueKinds(prefs, br(2026, 11, 16, 9, 0), '2026-11-16'), []);
eq('já mandou hoje: não repete', dueKinds({ ...prefs, last_reminder_on: '2026-11-16' }, seg7, '2026-11-16'), []);
eq('lembrete desligado', dueKinds({ ...prefs, reminder_on: false }, seg7, '2026-11-16'), []);
eq('20h: alerta de sequência', dueKinds({ ...prefs, last_reminder_on: '2026-11-16' }, br(2026, 11, 16, 20, 0), '2026-11-16'), ['risk']);
eq('lembrete às 18h já mandado: sem alerta (um por dia)',
  dueKinds({ ...prefs, reminder_time: '18:00', last_reminder_on: '2026-11-16' }, br(2026, 11, 16, 20, 0), '2026-11-16'), []);
eq('lembrete às 20h: os dois juntos', dueKinds({ ...prefs, reminder_time: '20:00' }, br(2026, 11, 16, 20, 0), '2026-11-16'), ['reminder', 'risk']);

// ---------- semanal ----------
const semanal = {
  id: 'p1', mode: 'weekly', subtitles: { 'Segunda': 'Peito e tríceps' },
  structure: { 'Segunda': [{ name: 'Supino' }], 'Quarta': [{ name: 'Agacho' }], 'Sexta': [{ name: 'Remada' }], 'Domingo': [] }
};
const tresSeguidos = [log('2026-11-09', 'Segunda'), log('2026-11-11', 'Quarta'), log('2026-11-13', 'Sexta')];
let s = analyze(M, seg7, semanal, tresSeguidos);
eq('semanal: segunda é dia de treino', s.isWorkoutDay, true);
eq('semanal: sequência sem contar hoje', s.streak, 3);
let m = buildMessage('reminder', s, { name: 'joão silva', seed: 'aluno1' });
eq('semanal: título traz o nome do treino', m.title.includes('Peito e tríceps'), true);
eq('semanal: corpo fala da sequência', /3|4/.test(m.body), true);
m = buildMessage('risk', s, { seed: 'aluno1' });
eq('semanal: alerta cita a sequência', /3/.test(m.title + m.body), true);
eq('semanal: sem nome, nenhum texto com "undefined"/"null"', /undefined|null/.test(m.title + m.body), false);
// variação: dias seguidos não repetem a frase, e alunos diferentes variam
const textos = [];
for (let i = 0; i < 4; i++) {
  const d = new Date(seg7); d.setDate(d.getDate() + 7 * i);
  const st = analyze(M, d, semanal, []);
  textos.push(buildMessage('reminder', { ...st, today: M.toLocalISO(br(2026, 11, 16 + i, 7)) }, { seed: 'aluno1' }).body);
}
eq('semanal: dias seguidos não repetem a mesma frase', textos.every((t, i) => i === 0 || t !== textos[i - 1]), true);
const porAluno = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seed => buildMessage('reminder', s, { seed }).title));
eq('semanal: alunos diferentes recebem frases diferentes', porAluno.size > 1, true);
const comNome = new Set([...Array(12)].map((_, i) =>
  buildMessage('reminder', { ...s, today: M.toLocalISO(br(2026, 11, 1 + i, 7)) }, { name: 'MARIA souza', seed: 'x' }).title));
eq('semanal: primeiro nome aparece em alguma variação', [...comNome].some(t => t.includes('Maria')), true);
s = analyze(M, seg7, semanal, [...tresSeguidos, log('2026-11-16', 'Segunda')]);
eq('semanal: já treinou hoje → nada', [buildMessage('reminder', s), buildMessage('risk', s)], [null, null]);
s = analyze(M, br(2026, 11, 17, 7, 5), semanal, tresSeguidos);
eq('semanal: terça é descanso → nada', buildMessage('reminder', s), null);
s = analyze(M, br(2026, 11, 18, 7, 5), semanal, []);
m = buildMessage('reminder', s);
eq('semanal: quarta sem subtítulo nem sequência', [!!m.title, !!m.body, /undefined|null|NaN/.test(m.title + m.body)], [true, true, false]);
s = analyze(M, seg7, semanal, [log('2026-11-13', 'Sexta')]);
eq('semanal: sequência de 1 não gera alerta', buildMessage('risk', s), null);
eq('semanal: nada de "1 treinos"', /1 treinos/.test(buildMessage('reminder', s).body), false);

// ---------- cíclico ----------
const ciclico = {
  id: 'p2', mode: 'cyclic', days_per_week: 3, subtitles: { 'B': 'Costas' },
  cycle_sequence: ['A', 'B', 'rest', 'C', 'rest'],
  structure: { 'A': [{}], 'B': [{}], 'C': [{}] }
};
s = analyze(M, seg7, ciclico, [log('2026-11-14', 'A', { plan_id: 'p2' })]);
eq('cíclico: depois do A vem o B', s.next, 'B');
eq('cíclico: lembrete com o nome do treino', buildMessage('reminder', s).title.includes('Costas'), true);
s = analyze(M, br(2026, 11, 17, 7, 5), ciclico, [log('2026-11-15', 'B', { plan_id: 'p2' })]);
eq('cíclico: sem subtítulo usa "Treino C"', buildMessage('reminder', s).title.includes('Treino C'), true);
s = analyze(M, seg7, ciclico, [log('2026-11-15', 'B', { plan_id: 'p2' })]);
eq('cíclico: dia seguinte ao B é descanso', [s.isWorkoutDay, buildMessage('reminder', s)], [false, null]);
s = analyze(M, br(2026, 11, 17, 7, 5), ciclico, [log('2026-11-15', 'B', { plan_id: 'p2' })]);
eq('cíclico: descanso já cumprido → C', s.next, 'C');
s = analyze(M, br(2026, 11, 20, 7, 5), ciclico, [log('2026-11-15', 'B', { plan_id: 'p2' })]);
eq('cíclico: faltar não pula treino → ainda C', s.next, 'C');
s = analyze(M, seg7, ciclico, [log('2026-11-14', 'B', { plan_id: 'outro' }), log('2026-11-10', 'A', { plan_id: 'p2' })]);
eq('cíclico: posição só pelos logs do plano ativo', s.next, 'B');
s = analyze(M, seg7, ciclico, []);
eq('cíclico: sem histórico começa no A', s.next, 'A');

// meta semanal 3x: sexta 20/11 com 1 treino na semana → faltam 2, restam 3 dias: ainda não
const semana1 = [log('2026-11-16', 'A', { plan_id: 'p2' })];
s = analyze(M, br(2026, 11, 20, 20, 0), ciclico, semana1);
eq('cíclico: faltam 2 e restam 3 dias → sem alerta', buildMessage('risk', s), null);
s = analyze(M, br(2026, 11, 21, 20, 0), ciclico, semana1);
eq('cíclico: faltam 2 e restam 2 dias → alerta', buildMessage('risk', s).body.startsWith('Faltam 2 treinos e 2 dias na semana.'), true);
s = analyze(M, br(2026, 11, 22, 20, 0), ciclico, semana1);
eq('cíclico: já não dá mais → sem cobrança', buildMessage('risk', s), null);
const metaBatida = ['2026-11-16', '2026-11-17', '2026-11-18'].map((d, i) => log(d, 'ABC'[i], { plan_id: 'p2' }));
s = analyze(M, br(2026, 11, 20, 7, 5), ciclico, metaBatida);
eq('cíclico: meta da semana batida → sem lembrete', buildMessage('reminder', s), null);

// ---------- acesso ----------
const aluno = { role: 'student', status: 'active', access_expires_at: '2026-11-30' };
eq('acesso em dia', canReceive(aluno, '2026-11-16'), true);
eq('acesso vencido', canReceive({ ...aluno, access_expires_at: '2026-11-15' }, '2026-11-16'), false);
eq('suspenso', canReceive({ ...aluno, status: 'suspended' }, '2026-11-16'), false);
eq('professor não recebe', canReceive({ ...aluno, role: 'trainer' }, '2026-11-16'), false);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
