// Valida as funções REAIS de public/metrics.js — o módulo que professor.html,
// treinador.html, evolucao.html e index.html carregam: toLocalISO, e1rm e
// computeStreak (regra do descanso que não quebra a sequência).
import fs from 'fs';
import vm from 'vm';

const METRICS = fs.readFileSync('public/metrics.js', 'utf8');
// Script clássico: roda com um `window` falso e devolve a API exposta.
const api = new vm.Script(METRICS + '\n;window.Metrics').runInNewContext({ window: {} });
const { toLocalISO, e1rm, isTrainingDate, computeStreak } = api;

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

// ---------- toLocalISO ----------
// 04/08/2026 às 22h local: toISOString daria 2026-08-05. Deve dar 2026-08-04.
eq('toLocalISO 22h não vira o dia', toLocalISO(new Date(2026, 7, 4, 22, 30)), '2026-08-04');
eq('toLocalISO 00h05',              toLocalISO(new Date(2026, 7, 4, 0, 5)),  '2026-08-04');
eq('toLocalISO 23h59 fim de mês',   toLocalISO(new Date(2026, 6, 31, 23, 59)), '2026-07-31');
eq('bug antigo confirmado (UTC)',   new Date(2026, 7, 4, 22, 30).toISOString().split('T')[0], '2026-08-05');

// ---------- e1rm (Epley) ----------
eq('e1rm 100x1 = 100',    Math.round(e1rm(100, 1)), 103); // 100*(1+1/30)
eq('e1rm 100x10',         Math.round(e1rm(100, 10)), 133);
eq('e1rm 100x5 > 105x1',  e1rm(100, 5) > e1rm(105, 1), true);
eq('e1rm sem peso = 0',   e1rm(null, 10), 0);
eq('e1rm sem reps = 0',   e1rm(80, 0), 0);

// ---------- computeStreak ----------
const SEG_A_SEX = new Set(['Segunda','Terça','Quarta','Quinta','Sexta']);
const d = (s) => new Date(s + 'T12:00:00');

// Domingo 09/08/2026. Semana 03-07/ago (seg-sex) toda treinada.
// O fim de semana (sáb 08 + dom 09) é descanso e NÃO pode quebrar.
eq('descanso não quebra a sequência',
  computeStreak(new Set(['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']), SEG_A_SEX, d('2026-08-09')).current,
  5);

// Duas semanas cheias, atravessando dois fins de semana = 10
eq('duas semanas cheias atravessam 2 fins de semana',
  computeStreak(new Set([
    '2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31',
    '2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07'
  ]), SEG_A_SEX, d('2026-08-09')).current,
  10);

// Faltou na quarta 05/08 → conta só quinta e sexta
eq('falta em dia prescrito quebra',
  computeStreak(new Set(['2026-08-03','2026-08-04','2026-08-06','2026-08-07']), SEG_A_SEX, d('2026-08-09')).current,
  2);

// Hoje (terça 04/08) é dia prescrito e ainda não treinou: não quebra, mantém a segunda
eq('hoje sem treino ainda não quebra',
  computeStreak(new Set(['2026-08-03']), SEG_A_SEX, d('2026-08-04')).current,
  1);

// Ontem (segunda) faltou → zerado
eq('falta ontem zera',
  computeStreak(new Set(['2026-07-31']), SEG_A_SEX, d('2026-08-04')).current,
  0);

// Plano 3x/semana (seg/qua/sex): treinou os 3, terça e quinta são descanso
const SEG_QUA_SEX = new Set(['Segunda','Quarta','Sexta']);
eq('plano 3x: dias vagos no meio não quebram',
  computeStreak(new Set(['2026-08-03','2026-08-05','2026-08-07']), SEG_QUA_SEX, d('2026-08-09')).current,
  3);

// Treinar em dia de descanso não conta como sequência, mas também não estraga
eq('treino extra em descanso não quebra',
  computeStreak(new Set(['2026-08-03','2026-08-05','2026-08-07','2026-08-08']), SEG_QUA_SEX, d('2026-08-09')).current,
  3);

// Recorde: sequência antiga de 5 preservada mesmo com a atual zerada
const comRecorde = computeStreak(new Set([
  '2026-07-20','2026-07-21','2026-07-22','2026-07-23','2026-07-24'  // 5 seguidos
  // semana seguinte inteira em falta
]), SEG_A_SEX, d('2026-08-09'));
eq('recorde guardado com atual zerada', [comRecorde.current, comRecorde.best], [0, 5]);

// Sem nenhum treino
eq('sem treino algum', computeStreak(new Set(), SEG_A_SEX, d('2026-08-09')).current, 0);

// ---------- isTrainingDate ----------
eq('sábado não é dia prescrito (seg-sex)', isTrainingDate('2026-08-08', SEG_A_SEX), false);
eq('segunda é dia prescrito',              isTrainingDate('2026-08-03', SEG_A_SEX), true);
eq('domingo prescrito quando no plano',    isTrainingDate('2026-08-09', new Set(['Domingo'])), true);

// ---------- index.html: lado da ESCRITA da data ----------
// É aqui que session_date é gravado. Se continuar em UTC, o treino da noite vai
// para o dia seguinte e a correção no treinador não resolve nada.
// toLocalISO agora vem de metrics.js — a tela precisa carregá-lo e usá-lo.
const idxHtml = fs.readFileSync('index.html', 'utf8');
// index.html tem um <script> pequeno de bootstrap antes do principal: pega o maior.
const idxJs = [...idxHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).sort((a, b) => b.length - a.length)[0];

const grabFrom = (source, name) => {
  const i = source.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('não achei ' + name + ' em index.html');
  let depth = 0, started = false;
  for (let p = i; p < source.length; p++) {
    if (source[p] === '{') { depth++; started = true; }
    else if (source[p] === '}') { depth--; if (started && depth === 0) return source.slice(i, p + 1); }
  }
};

eq('index.html carrega metrics.js', /<script src="\/metrics\.js"><\/script>/.test(idxHtml), true);
eq('index.html não tem cópia de toLocalISO', /function toLocalISO\(/.test(idxJs), false);

const idxApi = new Function(
  // getDateForDay lê o modo do plano ativo; no sandbox não há página, então o
  // global é fixado em 'weekly' (o caso que este teste cobre).
  "let planMode = 'weekly';\n" +
  grabFrom(METRICS, 'toLocalISO') + '\n' +
  grabFrom(idxJs, 'getDateForDay') + '\n' +
  'return { toLocalISO, getDateForDay };'
)();

eq('index.html getDateForDay usa toLocalISO', /toLocalISO\(target\)/.test(grabFrom(idxJs, 'getDateForDay')), true);
eq('index.html sem toISOString em data', /toISOString\(\)\.split/.test(idxJs), false);

// getDateForDay: dia de hoje deve devolver a data local de hoje
const hojeLocal = idxApi.toLocalISO(new Date());
const nomeHoje = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][new Date().getDay()];
eq('getDateForDay(hoje) = data local de hoje', idxApi.getDateForDay(nomeHoje), hojeLocal);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
