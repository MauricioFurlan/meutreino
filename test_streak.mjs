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
  // Preserva o `async ` na frente, senão o await do corpo vira erro de sintaxe.
  const start = source.slice(Math.max(0, i - 6), i) === 'async ' ? i - 6 : i;
  let depth = 0, started = false;
  for (let p = i; p < source.length; p++) {
    if (source[p] === '{') { depth++; started = true; }
    else if (source[p] === '}') { depth--; if (started && depth === 0) return source.slice(start, p + 1); }
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

// ====================================================================
// loadStreaks(): caminho de carregamento com o cliente Supabase stubado.
// Verifica o cache (não repetir N consultas a cada renovar/ativar) e o que
// acontece sem plano ativo ou com erro de rede.
// ====================================================================
function sandbox(planRows, logsById, forceError) {
  const state = { plansQueries: 0, logQueries: 0 };

  // Stub encadeável e "thenable" no formato do supabase-js.
  const from = (table) => {
    const q = { table, eqs: {} };
    const api = {
      select: () => api,
      in: () => api,
      gte: () => api,
      order: () => api,
      eq: (k, v) => { q.eqs[k] = v; return api; },
      then: (res, rej) => {
        let out;
        if (table === 'workout_plans') {
          state.plansQueries++;
          out = forceError === 'plans' ? { data: null, error: { message: 'falhou' } } : { data: planRows, error: null };
        } else {
          state.logQueries++;
          out = forceError === 'logs'
            ? { data: null, error: { message: 'falhou' } }
            : { data: (logsById[q.eqs.student_id] || []).map(d => ({ session_date: d })), error: null };
        }
        return Promise.resolve(out).then(res, rej);
      }
    };
    return api;
  };

  const fakeDiv = () => {
    const o = { _t: '' };
    Object.defineProperty(o, 'textContent', { get: () => o._t, set: (v) => { o._t = v; } });
    Object.defineProperty(o, 'innerHTML', { get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), set: (v) => { o._t = v; } });
    return o;
  };

  const profJsSrc = inlineScript('professor.html');
  const src = [
    profJsSrc.match(/const DAYS = \[[^\]]*\];/)[0],
    profJsSrc.match(/const STREAK_WINDOW_DAYS = \d+;/)[0],
    profJsSrc.match(/const esc = \(s\) => .*;/)[0],
    grab(profJsSrc, 'toLocalISO'),
    grab(profJsSrc, 'isTrainingDate'),
    grab(profJsSrc, 'computeStreak'),
    grab(profJsSrc, 'loadStreaks'),
    grab(profJsSrc, 'getStreakHtml'),
    'let students = [];',
    'let streakMap = {};',
    'let streakLoadedFor = "";',
    'return { load: async (list) => { students = list; await loadStreaks(); return streakMap; }, getStreakHtml, peek: () => streakMap };'
  ].join('\n\n');

  return { api: new Function('_sb', 'document', src)({ from }, { createElement: fakeDiv }), state };
}

// Plano seg/qua/sex e treinos nos 3 últimos dias prescritos, contados a partir de hoje.
const hoje = new Date();
const isoBack = (n) => {
  const d = new Date(hoje);
  d.setDate(hoje.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// Todos os dias da janela como dia prescrito: assim o cenário não depende do
// dia da semana em que o teste roda.
const TODOS_OS_DIAS = { Domingo: [1], Segunda: [1], Terça: [1], Quarta: [1], Quinta: [1], Sexta: [1], Sábado: [1] };
const planoTodoDia = (id) => ({ student_id: id, structure: TODOS_OS_DIAS });

{
  const { api, state } = sandbox([planoTodoDia('a1')], { a1: [isoBack(0), isoBack(1), isoBack(2)] });
  const map = await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('streak de 3 dias seguidos', map.a1.current, 3);
  eq('uma consulta de planos + uma de logs', [state.plansQueries, state.logQueries], [1, 1]);
  eq('chip mostra o número com foguinho', /🔥<\/span>3</.test(api.getStreakHtml('a1')), true);
  eq('chip quente não leva a classe cold', /class="streak-chip "/.test(api.getStreakHtml('a1')), true);

  // Segunda chamada (ex.: professor renovou o prazo) não pode refazer as consultas.
  await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('cache evita repetir consultas na mesma lista', [state.plansQueries, state.logQueries], [1, 1]);

  // Lista mudou (aluno novo) → recalcula.
  await api.load([{ id: 'a1', full_name: 'Ana' }, { id: 'a2', full_name: 'Bia' }]);
  eq('lista diferente recalcula', state.plansQueries, 2);
}

{
  // Sem plano ativo não dá para saber o que é descanso: aluno fica sem chip.
  const { api, state } = sandbox([], { a1: [isoBack(0)] });
  const map = await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('sem plano ativo não calcula streak', map.a1, undefined);
  eq('sem plano ativo não consulta logs', state.logQueries, 0);
  eq('sem plano ativo o chip não é renderizado', api.getStreakHtml('a1'), '');
}

{
  // Dia presente no plano mas sem exercício não é dia de treino.
  const { api } = sandbox([{ student_id: 'a1', structure: { Segunda: [], Terça: [], Quarta: [], Quinta: [], Sexta: [], Sábado: [], Domingo: [] } }], { a1: [isoBack(0)] });
  const map = await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('plano só com dias vazios não gera streak', map.a1, undefined);
}

{
  // Erro de rede: não pode "congelar" o cache e nunca mais tentar.
  const { api, state } = sandbox([planoTodoDia('a1')], {}, 'plans');
  await api.load([{ id: 'a1', full_name: 'Ana' }]);
  await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('erro nos planos libera o cache para nova tentativa', state.plansQueries, 2);
}

{
  const { api, state } = sandbox([planoTodoDia('a1')], {}, 'logs');
  await api.load([{ id: 'a1', full_name: 'Ana' }]);
  await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('erro nos logs libera o cache para nova tentativa', state.logQueries, 2);
}

{
  // Sem treino nenhum: chip cinza com zero, e não ausência de chip.
  const { api } = sandbox([planoTodoDia('a1')], { a1: [] });
  const map = await api.load([{ id: 'a1', full_name: 'Ana' }]);
  eq('sem treino a sequência é zero', map.a1.current, 0);
  eq('chip zerado ganha a classe cold', /streak-chip cold/.test(api.getStreakHtml('a1')), true);
  eq('tooltip avisa que não há treino registrado', /nenhum treino registrado/.test(api.getStreakHtml('a1')), true);
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
