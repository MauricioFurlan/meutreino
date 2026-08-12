// Valida os cálculos dos gráficos da aba Evolução (anamnese.html), extraindo as
// funções reais do HTML. São funções puras de propósito: dá pra testar sem browser.
import fs from 'fs';

const js = fs.readFileSync('anamnese.html', 'utf8')
  .match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];

function grab(name) {
  const i = js.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('não achei ' + name);
  // Pula a lista de parâmetros: `function f(extra = {})` tem chaves no default e
  // contá-las junto fecharia o corpo da função na hora errada.
  let paren = 0, bodyStart = -1;
  for (let p = i; p < js.length; p++) {
    if (js[p] === '(') paren++;
    else if (js[p] === ')') { paren--; if (paren === 0) { bodyStart = js.indexOf('{', p); break; } }
  }
  if (bodyStart < 0) throw new Error('corpo não encontrado: ' + name);
  let depth = 0;
  for (let p = bodyStart; p < js.length; p++) {
    if (js[p] === '{') depth++;
    else if (js[p] === '}') { depth--; if (depth === 0) return js.slice(i, p + 1); }
  }
  throw new Error('fim não encontrado: ' + name);
}

const block = (name) => js.match(new RegExp(`const ${name} = \\[[\\s\\S]*?\\n\\];`))[0];
const line = (re) => js.match(re)[0];

const api = new Function([
  line(/const NUM = .*;/),
  line(/const fmtN = .*;/),
  block('KPI_DEFS'),
  block('CIRC_KEYS'),
  block('DOBRA_KEYS'),
  block('SYM_PAIRS'),
  line(/const SYM_ALERT_PERC = \d+;/),
  grab('bodyComp'),
  grab('firstLast'),
  grab('deltaClass'),
  grab('computeKpis'),
  grab('recompVerdict'),
  grab('comparePairs'),
  grab('symmetry'),
  'return { NUM, fmtN, bodyComp, firstLast, deltaClass, computeKpis, recompVerdict, comparePairs, symmetry, CIRC_KEYS, DOBRA_KEYS, SYM_ALERT_PERC };'
].join('\n\n'))();

const { bodyComp, firstLast, deltaClass, computeKpis, recompVerdict, comparePairs, symmetry, fmtN, CIRC_KEYS, DOBRA_KEYS } = api;

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};
const round = (n, d = 2) => n == null ? null : Number(n.toFixed(d));

// ---------- bodyComp: deriva kg a partir do peso e do % de gordura ----------
eq('bodyComp usa os kg quando informados',
  (() => { const r = bodyComp({ peso: 80, composicao: { massa_magra: 64, massa_gorda: 16, gordura: 20 } }); return [r.magra, r.gorda, round(r.gorduraPerc)]; })(),
  [64, 16, 20]);

eq('bodyComp deriva kg só com peso e %',
  (() => { const r = bodyComp({ peso: 80, composicao: { gordura: 25 } }); return [r.gorda, r.magra]; })(),
  [20, 60]);

eq('bodyComp calcula % quando só tem os kg',
  round(bodyComp({ composicao: { massa_magra: 60, massa_gorda: 20 } }).gorduraPerc),
  25);

eq('bodyComp sem dado suficiente = null', bodyComp({ peso: 80 }), null);
eq('bodyComp sem nada = null', bodyComp({}), null);
eq('bodyComp com % 100 (magra <= 0) = null', bodyComp({ peso: 80, composicao: { gordura: 100 } }), null);

// ---------- firstLast: ignora avaliação sem o campo preenchido ----------
const serie = [
  { assessment_date: '2026-01-10', data: { peso: 90 } },
  { assessment_date: '2026-02-10', data: {} },              // em branco: não pode virar o "último"
  { assessment_date: '2026-03-10', data: { peso: 85 } }
];
eq('firstLast pula avaliação sem o dado',
  (() => { const r = firstLast(serie, d => api.NUM(d.peso)); return [r.first.v, r.last.v, r.count]; })(),
  [90, 85, 2]);
eq('firstLast sem nenhum dado = null', firstLast(serie, d => api.NUM(d.altura)), null);

// ---------- deltaClass: direção do que é "bom" ----------
eq('gordura caindo é bom', deltaClass(-2, -1), 'good');
eq('gordura subindo é ruim', deltaClass(2, -1), 'bad');
eq('massa magra subindo é bom', deltaClass(1.5, 1), 'good');
eq('peso é neutro (depende do objetivo)', deltaClass(-3, 0), 'neutral');
eq('variação irrelevante é neutra', deltaClass(0.01, -1), 'neutral');

// ---------- computeKpis ----------
const kpis = computeKpis([
  { assessment_date: '2026-01-10', data: { peso: 90, imc: 29.4, composicao: { gordura: 28 } } },
  { assessment_date: '2026-03-10', data: { peso: 85, imc: 27.8, composicao: { gordura: 22 } } }
]);
const kpi = (label) => kpis.find(k => k.label === label);
eq('KPI % gordura: valor atual e delta', [kpi('% Gordura').value, round(kpi('% Gordura').delta)], [22, -6]);
eq('KPI % gordura caindo aparece como ganho', kpi('% Gordura').klass, 'good');
eq('KPI peso fica neutro', kpi('Peso').klass, 'neutral');
eq('KPI massa magra derivada do peso', [round(kpi('Massa magra').value), round(kpi('Massa magra').delta)], [66.3, 1.5]);
eq('KPI cintura ausente não aparece', kpi('Cintura'), undefined);
eq('KPI com uma só medição não tem delta',
  computeKpis([{ assessment_date: '2026-01-10', data: { peso: 90 } }]).find(k => k.label === 'Peso').delta,
  null);
eq('sem avaliação nenhuma não gera KPI', computeKpis([]), []);

// ---------- recompVerdict: leitura do cruzamento peso x gordura ----------
eq('peso estável + gordura caindo = recomposição', recompVerdict(0.3, -3), 'Recomposição: peso praticamente igual e menos gordura.');
eq('peso e gordura caindo = emagrecimento', recompVerdict(-5, -3), 'Emagrecimento com perda de gordura.');
eq('peso subindo e gordura caindo = massa magra', recompVerdict(4, -2), 'Peso subiu e a gordura caiu: ganho de massa magra.');
eq('peso caindo e gordura subindo = alerta', recompVerdict(-4, 2).startsWith('Atenção'), true);
eq('peso estável e gordura subindo = alerta', recompVerdict(0.2, 3).startsWith('Atenção'), true);
eq('nada relevante mudou', recompVerdict(0.2, 0.1), 'Sem mudança relevante no período.');
eq('sem dado nenhum = null', recompVerdict(null, null), null);

// ---------- comparePairs: só compara o que existe nas duas ----------
const cmp = comparePairs(CIRC_KEYS,
  { circunferencias: { cintura: 95, abdomen: 100, coxa_d: 58 } },
  { circunferencias: { cintura: 88, abdomen: 92 } },
  d => d.circunferencias);
eq('comparePairs ignora medida ausente na 2ª', cmp.map(p => p.key), ['cintura', 'abdomen']);
eq('comparePairs calcula o delta', cmp.map(p => p.delta), [-7, -8]);
eq('comparePairs mantém a ordem anatômica da lista', cmp[0].label, 'Cintura');

// Chave legada: avaliações antigas gravaram "suprailiaca" sem underscore.
const cmpD = comparePairs(DOBRA_KEYS,
  { dobras: { triceps: 12, suprailiaca: 20 } },
  { dobras: { triceps: 9, supra_iliaca: 15 } },
  d => d.dobras);
eq('comparePairs aceita a chave antiga suprailiaca', cmpD.map(p => p.key).sort(), ['supra_iliaca', 'triceps']);

eq('comparePairs sem nada em comum = vazio',
  comparePairs(CIRC_KEYS, { circunferencias: { cintura: 90 } }, { circunferencias: { quadril: 100 } }, d => d.circunferencias),
  []);

// ---------- symmetry ----------
const sym = symmetry({ circunferencias: { braco_d_contraido: 40, braco_e_contraido: 37, coxa_d: 60, coxa_e: 60 } });
eq('symmetry só devolve pares completos', sym.map(p => p.label), ['Braço contraído', 'Coxa']);
eq('symmetry calcula a diferença percentual sobre o maior lado', round(sym[0].diffPerc), 7.5);
eq('symmetry lados iguais = 0%', sym[1].diffPerc, 0);
eq('symmetry ignora lado faltando', symmetry({ circunferencias: { coxa_d: 60 } }), []);
eq('symmetry sem circunferências', symmetry({}), []);

// ---------- formatação ----------
eq('fmtN usa vírgula decimal', fmtN(66.25), '66,3');
eq('fmtN sem valor', fmtN(null), '-');

// ---------- HTML: os blocos e canvases existem ----------
const html = fs.readFileSync('anamnese.html', 'utf8');
['kpiGrid','compChart','recompChart','circChart','dobrasChart','simChart'].forEach(id => {
  eq(`HTML tem #${id}`, html.includes(`id="${id}"`), true);
});
eq('aba Evolução chama renderCharts', /if \(tab === 'charts'\) renderCharts\(\);/.test(html), true);
eq('canvas dos novos gráficos tem container com altura', /class="chart-box"[^>]*style="height:\d+px;"/.test(html), true);
eq('chart-box libera o max-height global do canvas', /\.chart-box canvas \{ max-height: none !important; \}/.test(html), true);

// ====================================================================
// Smoke test de render: roda renderExtraCharts() de verdade com DOM e Chart.js
// stubados. Pega id errado, bloco que não esconde e config de gráfico quebrada —
// coisas que teste de função pura não alcança.
// ====================================================================
function sandbox() {
  const els = {};
  const created = [];

  const fakeEl = (id) => ({
    id, style: {}, className: '', textContent: '', innerHTML: '',
    _attrs: {}, setAttribute(k, v) { this._attrs[k] = v; }, getAttribute(k) { return this._attrs[k]; }
  });

  // createElement precisa escapar de verdade, senão esc() devolveria string vazia.
  const fakeDiv = () => {
    const o = { _t: '' };
    Object.defineProperty(o, 'textContent', { get: () => o._t, set: (v) => { o._t = v; } });
    Object.defineProperty(o, 'innerHTML', {
      get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      set: (v) => { o._t = v; }
    });
    return o;
  };

  const doc = {
    getElementById: (id) => (els[id] = els[id] || fakeEl(id)),
    createElement: () => fakeDiv()
  };

  class ChartStub {
    constructor(canvas, config) {
      this.canvas = canvas; this.config = config; this.destroyed = false;
      created.push({ id: canvas.id, config, instance: this });
    }
    destroy() { this.destroyed = true; }
  }

  const src = [
    line(/const NUM = .*;/),
    line(/const fmtN = .*;/),
    line(/const shortDate = .*;/),
    line(/const esc = \(s\) => .*;/),
    block('KPI_DEFS'), block('CIRC_KEYS'), block('DOBRA_KEYS'), block('SYM_PAIRS'),
    line(/const SYM_ALERT_PERC = \d+;/),
    grab('bodyComp'), grab('firstLast'), grab('deltaClass'), grab('computeKpis'),
    grab('recompVerdict'), grab('comparePairs'), grab('symmetry'),
    grab('axisOpts'), grab('baseOpts'), grab('drawChart'), grab('blockState'),
    grab('renderExtraCharts'),
    'let assessments = [];',
    'let extraCharts = {};',
    'return (list) => { assessments = list; renderExtraCharts(); };'
  ].join('\n\n');

  const render = new Function('document', 'Chart', src)(doc, ChartStub);
  return { render, els, created };
}

const rico = [
  { assessment_date: '2026-01-10', data: {
    peso: 90, altura: 175, imc: 29.4,
    circunferencias: { cintura: 98, abdomen: 103, quadril: 104, torax: 100, braco_d_contraido: 38, braco_e_contraido: 36, coxa_d: 60, coxa_e: 59 },
    dobras: { triceps: 14, subescapular: 18, supra_iliaca: 22, abdominal: 26 },
    composicao: { gordura: 28 }
  }},
  { assessment_date: '2026-04-10', data: {
    peso: 89, altura: 175, imc: 29.1,
    circunferencias: { cintura: 91, abdomen: 95, quadril: 101, torax: 101, braco_d_contraido: 39.5, braco_e_contraido: 36, coxa_d: 61, coxa_e: 60.5 },
    dobras: { triceps: 10, subescapular: 14, supra_iliaca: 16, abdominal: 19 },
    composicao: { gordura: 22 }
  }}
];

{
  const { render, els, created } = sandbox();
  render(rico);
  const ids = created.map(c => c.id);
  eq('render cria os 5 gráficos novos', ids, ['compChart', 'recompChart', 'circChart', 'dobrasChart', 'simChart']);

  eq('bloco de KPIs aparece', els.blockDelta.style.display, 'block');
  eq('KPI de massa magra vai pra tela', /Massa magra/.test(els.kpiGrid.innerHTML), true);
  eq('subtítulo mostra o intervalo', els.deltaSub.textContent, '10/01/26 → 10/04/26');

  const comp = created.find(c => c.id === 'compChart').config;
  eq('composição é rosca', comp.type, 'doughnut');
  // 89 kg com 22% de gordura: 19,6 kg de gordura e 69,4 kg de massa magra.
  eq('rosca usa a última avaliação', comp.data.datasets[0].data, [69.4, 19.6]);

  const recomp = created.find(c => c.id === 'recompChart').config;
  eq('peso x gordura tem dois eixos', [recomp.data.datasets[0].yAxisID, recomp.data.datasets[1].yAxisID], ['y', 'y1']);
  eq('veredito de recomposição na nota', /Recomposição/.test(els.recompNote.innerHTML), true);

  const circ = created.find(c => c.id === 'circChart').config;
  eq('circunferências em barra horizontal', [circ.type, circ.options.indexAxis], ['bar', 'y']);
  eq('circunferências comparam 8 medidas', circ.data.labels.length, 8);
  eq('altura do box acompanha o nº de barras', els.circBox.style.height, '272px');

  const dobras = created.find(c => c.id === 'dobrasChart').config;
  eq('dobras comparam as 4 medidas presentes', dobras.data.labels.length, 4);
  eq('nota das dobras mostra a soma', /80,0 → 59,0 mm/.test(els.dobrasNote.innerHTML), true);

  const sim = created.find(c => c.id === 'simChart').config;
  eq('simetria compara braço e coxa', sim.data.labels, ['Braço contraído', 'Coxa']);
  eq('assimetria de 8,9% no braço vira alerta', /Braço contraído/.test(els.simNote.innerHTML), true);
  eq('nota de alerta ganha a classe warn', els.simNote.className, 'chart-note warn');
  eq('canvas recebe aria-label', typeof created.find(c => c.id === 'compChart') === 'object' && !!els.compChart.getAttribute('aria-label'), true);
}

// Uma avaliação só: nada de comparar primeira x última.
{
  const { render, els, created } = sandbox();
  render([rico[1]]);
  eq('1 avaliação: sem gráfico de circunferências', created.some(c => c.id === 'circChart'), false);
  eq('1 avaliação: sem gráfico de dobras', created.some(c => c.id === 'dobrasChart'), false);
  eq('1 avaliação: bloco de circunferências escondido', els.blockCirc.style.display, 'none');
  eq('1 avaliação: rosca de composição ainda aparece', created.some(c => c.id === 'compChart'), true);
  eq('1 avaliação: simetria ainda aparece', created.some(c => c.id === 'simChart'), true);
  eq('1 avaliação: KPI sem delta', /única medição/.test(els.kpiGrid.innerHTML), true);
}

// Nenhuma avaliação: nada de gráfico, nada de bloco vazio na tela.
{
  const { render, els, created } = sandbox();
  render([]);
  eq('sem avaliação não cria gráfico', created.length, 0);
  ['blockDelta', 'blockComp', 'blockRecomp', 'blockCirc', 'blockDobras', 'blockSim'].forEach(b => {
    eq(`sem avaliação esconde #${b}`, els[b].style.display, 'none');
  });
}

// Avaliação só com peso: não pode explodir nem inventar composição corporal.
{
  const { render, els, created } = sandbox();
  render([
    { assessment_date: '2026-01-10', data: { peso: 80 } },
    { assessment_date: '2026-02-10', data: { peso: 78 } }
  ]);
  eq('só peso: sem rosca de composição', created.some(c => c.id === 'compChart'), false);
  eq('só peso: gráfico de peso x gordura aparece', created.some(c => c.id === 'recompChart'), true);
  eq('só peso: veredito fala do peso', /Peso mudou/.test(els.recompNote.innerHTML), true);
  eq('só peso: KPI de peso presente', /Peso/.test(els.kpiGrid.innerHTML), true);
}

// Re-render não pode empilhar instância de Chart: no Chart.js real, reusar um canvas
// sem destruir a instância anterior estoura "Canvas is already in use".
{
  const { render, created } = sandbox();
  render(rico);
  const primeiros = created.slice();
  render(rico);
  eq('re-render recria os mesmos 5 gráficos', created.length, 10);
  eq('re-render destrói as instâncias antigas', primeiros.map(c => c.instance.destroyed), [true, true, true, true, true]);
}

// ====================================================================
// MODO ALUNO (somente leitura).
// A mesma tela serve o professor (lança/edita) e o aluno (consulta). O que o
// aluno NÃO pode ver ou fazer é regra de produto e precisa estar travada:
//   · nada de editar/excluir/lançar
//   · o campo `observacoes` (anotação do professor sobre ele) fica fora da tela
//     E do PDF que ele exporta
// ====================================================================
{
  const html = fs.readFileSync('anamnese.html', 'utf8');

  eq('anamnese aceita professor e aluno no guard',
    /guard\(\['trainer',\s*'student'\]/.test(js), true);
  eq('modo aluno tem flag própria', /let STUDENT_VIEW = false;/.test(js), true);
  eq('aluno entra pelo caminho somente-leitura',
    /if \(profile\.role === 'student'\)[\s\S]{0,80}initStudentView\(profile\)/.test(js), true);

  const initAluno = grab('initStudentView');
  eq('modo aluno liga a flag',            /STUDENT_VIEW = true;/.test(initAluno), true);
  eq('modo aluno usa o próprio id',       /studentId = profile\.id;/.test(initAluno), true);
  eq('modo aluno esconde o formulário',   /tabForm'\)\.style\.display = 'none'/.test(initAluno), true);
  eq('modo aluno esconde editar',         /btnEditAssessment'\)\.style\.display = 'none'/.test(initAluno), true);
  eq('modo aluno esconde excluir',        /btnDeleteAssessment'\)\.style\.display = 'none'/.test(initAluno), true);
  eq('modo aluno abre no histórico',      /switchTab\('history'\)/.test(initAluno), true);
  eq('modo aluno volta para o treino',    /location\.href = 'index\.html'/.test(initAluno), true);

  // O botão de PDF continua para os dois papéis (o aluno pode exportar).
  eq('botão de PDF não é escondido no modo aluno',
    /generatePDF\(\)/.test(html) && !/btnPdf'\)\.style\.display = 'none'/.test(js), true);

  // Observações: escondidas na tela e no PDF, pelo mesmo teste.
  eq('observações condicionadas na tela',
    /if \(d\.observacoes && !hideObservacoes\(\)\)/.test(js), true);
  eq('observações condicionadas no PDF',
    (js.match(/d\.observacoes && !hideObservacoes\(\)/g) || []).length, 2);
  eq('hideObservacoes é o modo aluno',
    /function hideObservacoes\(\) \{ return STUDENT_VIEW; \}/.test(js), true);

  // Simula as duas visões para garantir que a condição realmente filtra.
  const filtro = new Function(`
    let STUDENT_VIEW = arguments[0];
    ${grab('hideObservacoes')}
    const d = { observacoes: 'aluno desmotivado' };
    return !!(d.observacoes && !hideObservacoes());
  `);
  eq('professor vê as observações', filtro(false), true);
  eq('aluno não vê as observações', filtro(true), false);
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
