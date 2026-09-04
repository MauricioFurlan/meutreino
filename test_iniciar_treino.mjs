// Testes da pergunta "quer começar o treino?" ao salvar (tela do aluno).
// Regra: se é o dia de treino do aluno, ele salva um exercício e o cronômetro
// ainda não começou, a tela pergunta se ele quer iniciar. O "sim" liga o
// cronômetro; o "não" não liga nada — e o exercício é salvo nas duas respostas.
//
// Roda o código REAL de index.html (nada copiado para cá) contra um DOM de
// mentira, mais uma checagem na fonte de que o salvamento não virou refém da
// resposta do aluno.
import fs from 'fs';
import vm from 'vm';

const inlineScript = (file) => {
  const html = fs.readFileSync(file, 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
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

const ALUNO = inlineScript('index.html');

// Monta a tela: a linha do cronômetro e o botão "Iniciar Treino" no estado
// pedido, mais os dubles de confirm() e do início de sessão.
const montarTela = ({
  planMode = 'weekly',
  currentTabDay = 'B',
  hoje = 'B',
  linhaVisivel = true,   // startWorkoutRow — some no dia de descanso e fora de hoje
  botaoVisivel = true,   // timerStartBtn — some com sessão em andamento/encerrada
  botaoDesabilitado = false,
  resposta = true        // o que o aluno responde no confirm
} = {}) => {
  const els = {
    startWorkoutRow: { style: { display: linhaVisivel ? 'flex' : 'none' } },
    timerStartBtn: { style: { display: botaoVisivel ? 'inline-block' : 'none' }, disabled: botaoDesabilitado }
  };
  const chamadas = { confirm: 0, start: 0, pergunta: null };
  const ctx = {
    planMode,
    currentTabDay,
    document: { getElementById: (id) => els[id] || null },
    getToday: () => hoje,
    confirm: (msg) => { chamadas.confirm++; chamadas.pergunta = msg; return resposta; },
    startWorkoutSession: async () => { chamadas.start++; }
  };
  const api = new vm.Script(
    ALUNO.match(/let startWorkoutDeclined = false;/)[0] + '\n' +
    grabFrom(ALUNO, 'isDayToday') + '\n' +
    grabFrom(ALUNO, 'canOfferStartWorkout') + '\n' +
    grabFrom(ALUNO, 'offerStartWorkout') + '\n' +
    '({ isDayToday, canOfferStartWorkout, offerStartWorkout })'
  ).runInNewContext(ctx);
  return { api, chamadas };
};

// ====================================================================
// 1. Qual dia é "hoje"
// ====================================================================
{
  const { api } = montarTela({ planMode: 'weekly', hoje: 'B' });
  eq('semanal: o dia de hoje é hoje', api.isDayToday('B'), true);
  eq('semanal: outro dia da semana não é hoje', api.isDayToday('C'), false);
}
{
  // No cíclico o treino aberto é sempre o de hoje — não existe aba de outro dia.
  const { api } = montarTela({ planMode: 'cyclic', currentTabDay: 'A', hoje: '2026-09-03' });
  eq('cíclico: o treino aberto é hoje', api.isDayToday('A'), true);
  eq('cíclico: outro treino não é o aberto', api.isDayToday('B'), false);
}
{
  const { api } = montarTela({ planMode: 'cyclic', currentTabDay: null });
  eq('cíclico sem treino aberto: nada é hoje', api.isDayToday(null), false);
}

// ====================================================================
// 2. Quando a pergunta pode aparecer
// ====================================================================
eq('botão à mão → pode perguntar', montarTela({}).api.canOfferStartWorkout(), true);
eq('dia de descanso (linha escondida) → não pergunta',
   montarTela({ linhaVisivel: false }).api.canOfferStartWorkout(), false);
eq('sessão em andamento (botão escondido) → não pergunta',
   montarTela({ botaoVisivel: false }).api.canOfferStartWorkout(), false);
eq('início já em curso (botão travado) → não pergunta',
   montarTela({ botaoDesabilitado: true }).api.canOfferStartWorkout(), false);

// ====================================================================
// 3. A pergunta em si
// ====================================================================
{
  const { api, chamadas } = montarTela({ resposta: true });
  await api.offerStartWorkout('B');
  eq('salvou sem cronômetro → perguntou', chamadas.confirm, 1);
  eq('a pergunta fala em começar o treino', /começou o treino/.test(chamadas.pergunta || ''), true);
  eq('respondeu sim → cronômetro iniciado', chamadas.start, 1);
}
{
  const { api, chamadas } = montarTela({ resposta: false });
  await api.offerStartWorkout('B');
  eq('respondeu não → nada de cronômetro', chamadas.start, 0);
  // Insistir a cada exercício seria chato: o botão "Iniciar Treino" fica ali.
  await api.offerStartWorkout('B');
  eq('depois do não, não pergunta de novo', chamadas.confirm, 1);
}
{
  const { api, chamadas } = montarTela({ resposta: true });
  await api.offerStartWorkout('C'); // aba de outro dia da semana
  eq('salvar em outro dia não pergunta', chamadas.confirm, 0);
}
{
  const { api, chamadas } = montarTela({ botaoVisivel: false });
  await api.offerStartWorkout('B');
  eq('com treino já em andamento não pergunta', chamadas.confirm, 0);
}

// ====================================================================
// 4. Salvar não depende da resposta
// ====================================================================
for (const fn of ['saveExercise', 'saveGroup']) {
  const src = grabFrom(ALUNO, fn);
  const i = src.indexOf('offerStartWorkout(day)');
  eq(`${fn} pergunta antes de gravar`, i > 0, true);
  const depois = src.slice(i);
  eq(`${fn} grava depois da pergunta`, /\.insert\(/.test(depois), true);
  // A pergunta não pode virar guarda: nada de "if (!await offer...) return".
  eq(`${fn} não usa a resposta como condição`, /(if|return|&&|\|\|)[^;\n]*offerStartWorkout/.test(src), false);
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
