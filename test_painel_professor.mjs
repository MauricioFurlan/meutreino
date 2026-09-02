// Harness rápido: roda o script inline de professor.html num DOM de mentira e
// exercita o pipeline de render (alertas -> lista -> resumo) com alunos fake.
import fs from 'fs';
import vm from 'vm';

const src = fs.readFileSync('professor.html', 'utf8');
const inline = [...src.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a,b)=>b.length-a.length)[0];
const metrics = fs.readFileSync('public/metrics.js', 'utf8');

const novoEl = () => ({
  innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  querySelectorAll: () => [], querySelector: () => null, addEventListener(){}, appendChild(){}
});
const els = {};
const doc = {
  getElementById: (id) => (els[id] = els[id] || novoEl()),
  querySelectorAll: () => [], querySelector: () => null,
  // esc() do app é textContent -> innerHTML: o elemento fake precisa escapar
  // de verdade, senão todo nome sairia vazio no HTML gerado.
  createElement: () => {
    const el = novoEl();
    let txt = '';
    Object.defineProperty(el, 'textContent', {
      get: () => txt,
      set: (v) => { txt = v == null ? '' : String(v); }
    });
    Object.defineProperty(el, 'innerHTML', {
      get: () => txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      set: () => {}
    });
    return el;
  },
  addEventListener(){}, body: novoEl()
};

const ctx = {
  document: doc, console, setTimeout, clearTimeout, Date, Math, JSON, Set, Map, Intl,
  guard: () => {}, confirm: () => false, alert: () => {}, location: { href: '' },
  _sb: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({}) }) }) }) },
  window: {}, localStorage: { getItem: () => null, setItem(){} }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(metrics, ctx);
vm.runInContext(inline, ctx);

const hoje = new Date();
const emDias = (n) => new Date(hoje.getTime() + n * 86400000).toISOString().slice(0, 10);

// let/const do script não viram propriedade do global: o fixture entra por
// atribuição DENTRO do contexto, e a leitura do estado também.
const dentro = (código) => vm.runInContext(código, ctx);
ctx.__fx = {};
ctx.__fx.students = [
  { id: 'a1', full_name: 'Ana Beatriz', email: 'a@x.com', gym_name: 'Smart', status: 'active', access_expires_at: emDias(3), birth_date: '1990-01-02' },
  { id: 'b2', full_name: 'Bruno Silva', email: 'b@x.com', gym_name: null, status: 'active', access_expires_at: emDias(-2), birth_date: null },
  { id: 'c3', full_name: 'Carlos Éder', email: 'c@x.com', gym_name: 'Bio', status: 'suspended', access_expires_at: emDias(100), birth_date: null },
  { id: 'd4', full_name: 'Daniela Souza', email: 'd@x.com', gym_name: null, status: 'active', access_expires_at: emDias(90), birth_date: null }
];
ctx.__fx.invites = [{ id: 'i1', full_name: 'Eduardo Lima', email: 'e@x.com', gym_name: null, created_at: hoje.toISOString() }];
ctx.__fx.sessions = { d4: { student_id: 'd4', started_at: hoje.toISOString(), ended_at: hoje.toISOString(), duration_seconds: 3600, rating: 4 } };
ctx.__fx.planEnd = { a1: emDias(1) };
ctx.__fx.notes = { b2: [{ id: 'r1', student_id: 'b2', alert_date: emDias(2), message: 'Renovar dieta' }] };
ctx.__fx.streaks = {};
dentro('students = __fx.students; pendingInvites = __fx.invites; sessionsMap = __fx.sessions;'
     + ' planEndMap = __fx.planEnd; noteAlertMap = __fx.notes; streakMap = __fx.streaks; maxStudents = 20;');

const dentro_busca = (t) => dentro('onSearch(' + JSON.stringify(t) + ')');
const dentro_filtro = (k) => dentro('setFilter(' + JSON.stringify(k) + ')');

let falhas = 0;
const ok = (nome, cond) => { console.log((cond ? 'PASS  ' : 'FALHOU ') + nome); if (!cond) falhas++; };

dentro('refreshPanel()');
const lista = () => els.studentsList.innerHTML;

ok('lista renderiza os 4 alunos', ['Ana Beatriz','Bruno Silva','Carlos Éder','Daniela Souza'].every(n => lista().includes(n)));
ok('convite pendente aparece sem filtro', lista().includes('Eduardo Lima'));
ok('e-mail do aluno saiu do card', !lista().includes('a@x.com'));
ok('nenhum emoji nos botões de ação', !/class="action-btn"[^>]*>[^<]*[\u{1F300}-\u{1FAFF}]/u.test(lista()));
ok('faixa de status vencendo/vencido/suspenso', lista().includes('st-expiring') && lista().includes('st-expired') && lista().includes('st-suspended'));
ok('botão de lembretes com contagem', lista().includes('Lembretes (1)'));
ok('resumo conta ativos, treinos e atenção', els.summaryBar.innerHTML.includes('alunos ativos') && els.summaryBar.innerHTML.includes('treinos hoje') && els.summaryBar.innerHTML.includes('pedem atenção'));
ok('alertas marcam quem precisa de atenção', dentro('attentionIds').has('a1') && dentro('attentionIds').has('b2') && !dentro('attentionIds').has('d4'));
ok('categorias guardam os ids', dentro('catIds').note.has('b2') && dentro('catIds').plan.has('a1'));
ok('chip de alerta virou filtro', els.alertsList.innerHTML.includes("setFilter('note')"));

// Ordem: quem tem alerta primeiro, depois quem treinou hoje
const ordem = dentro('filteredStudents()').map(s => s.id);
ok('ordem por atenção: alertas antes de quem treinou', ordem.indexOf('a1') < ordem.indexOf('d4') && ordem.indexOf('b2') < ordem.indexOf('d4'));
ok('quem treinou hoje vem antes de quem não fez nada', ordem.indexOf('d4') < ordem.indexOf('c3'));
dentro('toggleSort()');
ok('ordem A-Z pelo nome', dentro('filteredStudents()').map(s => s.id).join() === 'a1,b2,c3,d4');
dentro('toggleSort()');

// Busca sem acento
dentro_busca('eder');
ok('busca ignora acento', dentro('filteredStudents()').length === 1 && dentro('filteredStudents()')[0].id === 'c3');
dentro_busca('ACADEMIA-QUE-NAO-EXISTE');
ok('busca vazia mostra estado vazio', lista().includes('Nenhum aluno encontrado'));
dentro_busca('');

// Filtros
dentro_filtro('hoje');
ok('filtro "treinou hoje"', dentro('filteredStudents()').map(s => s.id).join() === 'd4');
ok('convite some sob filtro', !lista().includes('Eduardo Lima'));
dentro_filtro('atencao');
ok('filtro "atenção"', dentro('filteredStudents()').every(s => dentro('attentionIds').has(s.id)));
dentro_filtro('note');
ok('filtro por categoria de alerta', dentro('filteredStudents()').map(s => s.id).join() === 'b2');
dentro('clearFilters()');
ok('limpar filtros volta a lista inteira', dentro('filteredStudents()').length === 4);

// Sem alerta nenhum os conjuntos zeram
dentro('planEndMap = {}; noteAlertMap = {}; students = students.map(s => Object.assign({}, s, { access_expires_at: "%s", birth_date: null }));' .replace('%s', emDias(90)));
dentro('refreshPanel()');
ok('sem alertas, atenção zera', dentro('attentionIds').size === 0 && els.alertsSection.style.display === 'none');

// --- Janela do aniversário: 5 dias antes, o dia, 3 dias depois ---
const dataDe = (offsetDias) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDias);
  return `1990-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const selo = (offsetDias) => dentro(`getBirthdayInfo(${JSON.stringify(dataDe(offsetDias))}).badge`);

ok('aniversário hoje: selo "Hoje!"', selo(0).includes('Hoje!') && selo(0).includes('today'));
ok('amanhã', selo(1).includes('amanhã'));
ok('5 dias antes ainda aparece', selo(5).includes('em 5 dias'));
ok('6 dias antes não aparece', selo(6) === '');
ok('ontem', selo(-1).includes('ontem'));
ok('3 dias depois ainda aparece', selo(-3).includes('há 3 dias'));
ok('4 dias depois some', selo(-4) === '');
ok('mês inteiro não vale mais', selo(20) === '' && selo(-20) === '');
ok('sem data de nascimento não tem selo', dentro('getBirthdayInfo(null).badge') === '');

// Viradas de mês e de ano: 31/12 visto de 02/01 é "há 2 dias", não "em 363"
ok('vira o ano sem se perder', dentro('daysToBirthday(12, 31, new Date(2027, 0, 2))') === -2);
ok('vira o mês sem se perder', dentro('daysToBirthday(12, 3, new Date(2026, 10, 30))') === 3);

// O alerta de aniversário segue só no dia
const soAniversario = (offset) => {
  dentro('students = students.map((s, i) => Object.assign({}, s, { birth_date: i === 0 ? '
    + JSON.stringify(dataDe(offset)) + ' : null }))');
  dentro('refreshPanel()');
};
soAniversario(2);
ok('aniversário em 2 dias não entra em "pedem atenção"', dentro('attentionIds').size === 0);
soAniversario(0);
ok('aniversário hoje entra em "pedem atenção"', dentro('attentionIds').has('a1'));

console.log(`\n${falhas === 0 ? 'tudo certo' : falhas + ' falha(s)'}`);
process.exit(falhas ? 1 : 0);
