// Testes dos três ajustes desta rodada:
//   1. Ícone PWA novo (mira + halter) com variante do professor
//   2. Tipo de montagem escolhido ANTES do editor e travado depois
//   3. Autocomplete de subtítulo do dia (regiões musculares + aprendizado)
//
// Como não há build para os scripts inline, aqui se mistura:
//   · função pura extraída e executada de verdade (filterSubtitles/normKey)
//   · asserção sobre o código da tela (o que só existe amarrado ao DOM)
// O segundo tipo é chato, mas é o que impede regressão silenciosa em coisas
// como "as abas Semanal/Cíclico voltaram" ou "o manifest do professor sumiu".
import fs from 'fs';
import vm from 'vm';

const read = (f) => fs.readFileSync(f, 'utf8');
const inlineScript = (f) => {
  const blocks = [...read(f).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]);
  if (blocks.length === 0) throw new Error('sem script inline em ' + f);
  // O maior bloco é sempre o script da página
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

const edHtml = read('editor.html');
const edJs = inlineScript('editor.html');
const trHtml = read('treinos.html');
const trJs = inlineScript('treinos.html');

// ====================================================================
// 1. ÍCONES
// ====================================================================
const iconAluno = read('icon-aluno.svg');
const iconPro = read('icon-professor.svg');

eq('ícone do aluno não tem mais o texto MF', /MF/.test(iconAluno), false);
eq('ícone do professor não tem mais o texto MF', /MF/.test(iconPro), false);
eq('SVG antigo icon-192.svg removido', fs.existsSync('icon-192.svg'), false);
eq('SVG antigo icon-512.svg removido', fs.existsSync('icon-512.svg'), false);

// Mira: anel com retícula. Halter: barra + 4 anilhas = 5 retângulos.
const conta = (svg, re) => (svg.match(re) || []).length;
eq('mira do aluno tem retícula (dasharray)', /stroke-dasharray/.test(iconAluno), true);
eq('mira do professor tem retícula (dasharray)', /stroke-dasharray/.test(iconPro), true);
eq('halter do aluno tem barra + 4 anilhas', conta(iconAluno, /<rect x=/g), 5);
eq('halter do professor tem barra + 4 anilhas', conta(iconPro, /<rect x=/g), 5);

// Conteúdo dentro da zona segura do recorte maskable (raio 76.8 em 192)
const raioMira = Number(iconAluno.match(/r="(\d+)" fill="none"/)[1]);
const espessura = Number(iconAluno.match(/stroke-width="(\d+)"/)[1]);
eq('mira cabe na zona segura do maskable', raioMira + espessura / 2 <= 76.8, true);

// Cores distintas entre os dois apps
eq('aluno usa o ciano do app', /#00bcd4/.test(iconAluno), true);
eq('professor usa dourado (diferencia na gaveta)', /#f5c518/.test(iconPro), true);
eq('professor não usa o ciano do aluno', /#00bcd4/.test(iconPro), false);

// O plugin do Vite gera os 4 PNGs a partir dos 2 SVGs
const vite = read('vite.config.js');
['icon-192.png', 'icon-512.png', 'icon-pro-192.png', 'icon-pro-512.png'].forEach(png => {
  eq(`vite.config.js gera ${png}`, vite.includes(`'${png}'`), true);
});
['icon-192.png', 'icon-512.png', 'icon-pro-192.png', 'icon-pro-512.png'].forEach(png => {
  eq(`${png} existe em public/`, fs.existsSync('public/' + png), true);
});

// Dois manifests = dois apps instaláveis com ícones diferentes
const manAluno = JSON.parse(read('public/manifest.json'));
const manPro = JSON.parse(read('public/manifest-pro.json'));
eq('manifests têm id distinto', manAluno.id !== manPro.id, true);
eq('manifest do aluno aponta para o ícone do aluno', manAluno.icons.map(i => i.src), ['icon-192.png', 'icon-512.png']);
eq('manifest do professor aponta para o ícone pro', manPro.icons.map(i => i.src), ['icon-pro-192.png', 'icon-pro-512.png']);
eq('nome do app do professor se diferencia', manPro.short_name !== manAluno.short_name, true);

// Cada página puxa o manifest do seu papel
const PAGES_PRO = ['professor.html', 'treinos.html', 'editor.html', 'treinador.html', 'anotacoes.html', 'owner.html'];
const PAGES_ALUNO = ['index.html', 'evolucao.html', 'config.html', 'anamnese.html'];
PAGES_PRO.forEach(p => {
  const h = read(p);
  eq(`${p} usa manifest-pro.json`, /rel="manifest" href="\/manifest-pro\.json"/.test(h), true);
  eq(`${p} usa icon-pro-192.png`, /apple-touch-icon" href="\/icon-pro-192\.png"/.test(h), true);
});
PAGES_ALUNO.forEach(p => {
  const h = read(p);
  eq(`${p} usa manifest.json`, /rel="manifest" href="\/manifest\.json"/.test(h), true);
  eq(`${p} usa icon-192.png`, /apple-touch-icon" href="\/icon-192\.png"/.test(h), true);
});

// login.html é compartilhado: troca o manifest pelo último papel do aparelho
const loginHtml = read('login.html');
eq('login troca o manifest pelo papel salvo', /mt_last_role/.test(loginHtml), true);
eq('login pode virar manifest-pro', /manifest-pro\.json/.test(loginHtml), true);
eq('auth-guard grava o papel do aparelho', /mt_last_role/.test(read('auth-guard.js')), true);
// public/ é o que vai para dist/ — a cópia da raiz não é usada em produção
eq('public/auth-guard.js está em sincronia', read('public/auth-guard.js'), read('auth-guard.js'));
eq('public/sw.js está em sincronia', read('public/sw.js'), read('sw.js'));

// SW precisa de cache novo, senão o celular segue servindo o ícone antigo.
// Fixar a versão exata quebra a cada bump legítimo — basta ela ter avançado.
const sw = read('public/sw.js');
const swVer = Number((sw.match(/CACHE_NAME = 'meutreino-v(\d+)'/) || [])[1]);
eq('cache do SW foi renomeado', swVer >= 3, true);
['icon-pro-192.png', 'icon-pro-512.png', 'manifest-pro.json'].forEach(a => {
  eq(`SW cacheia ${a}`, sw.includes(`'/${a}'`), true);
});

// ====================================================================
// 2. TIPO DE MONTAGEM: escolhido antes, travado depois
// ====================================================================
eq('abas Semanal/Cíclico saíram do editor', /mode-tab/.test(edHtml), false);
eq('setMode() (que trocava o modo) não existe mais', /setMode\(/.test(edHtml), false);
eq('editor mostra selo do modo em vez de abas', /class="mode-badge pending" id="modeBadge"/.test(edHtml), true);
eq('CSS do selo existe', /\.mode-badge \{/.test(edHtml), true);

// treinos.html pergunta o tipo antes de navegar
eq('Novo Treino abre o seletor de tipo', /getElementById\('newBtn'\)\.onclick = openModePick/.test(trJs), true);
eq('seletor tem opção Semanal', /startNewPlan\('weekly'\)/.test(trHtml), true);
eq('seletor tem opção Cíclico', /startNewPlan\('cyclic'\)/.test(trHtml), true);
const startNewPlan = grabFrom(trJs, 'startNewPlan');
eq('o tipo escolhido viaja na URL do editor', /'editor\.html\?' \+ newPlanEditorParam \+ '&mode=' \+ mode/.test(startNewPlan), true);
eq('Importar segue livre (um nível antes)', /importBtn'\)\.onclick = \(\) => location\.href = 'editor\.html\?' \+ editorParam \+ '&importar=1'/.test(trJs), true);

// applyMode só exibe; não reconstrói os dias (não converte semanal↔cíclico)
const applyMode = grabFrom(edJs, 'applyMode');
eq('applyMode não reconstrói os dias', /rebuildDays\(\)/.test(applyMode), false);
eq('applyMode normaliza para weekly|cyclic', /mode === 'cyclic' \? 'cyclic' : 'weekly'/.test(applyMode), true);
eq('modo começa indefinido', /let currentMode = null;/.test(edJs), true);

// Editar herda o modo do treino
eq('edição aplica o modo do próprio plano', /applyMode\(plan\.mode === 'cyclic' \? 'cyclic' : 'weekly'\)/.test(edJs), true);
eq('edição avisa que o modo é herdado', /Herdado deste treino/.test(edJs), true);
// Criar usa o modo da URL; sem ele, pergunta
eq('criação lê o modo da URL', /const urlMode = getParam\('mode'\)/.test(edJs), true);
eq('sem modo definido, o editor pergunta', /openModePicker\(\);/.test(edJs), true);
const savePlan = grabFrom(edJs, 'savePlan');
eq('não salva sem tipo de montagem', /if \(!currentMode\) \{ openModePicker\(\); return; \}/.test(savePlan), true);

// Importação: filtrada pelo modo, exceto no fluxo "um nível antes"
const openImport = grabFrom(edJs, 'openImport');
eq('openImport recebe o flag de fluxo livre', /function openImport\(free\)/.test(openImport), true);
eq('fluxo livre só vale sem modo definido', /importFreeMode = !!free && !currentMode/.test(openImport), true);
eq('botão de importar do editor não é livre', /onclick="openImport\(false\)"/.test(edHtml), true);
eq('importar vindo de treinos.html é livre', /openImport\(true\)/.test(edJs), true);

const pickStudent = grabFrom(edJs, 'pickImportStudent');
eq('lista de treinos filtra pelo modo atual', /\(p\.mode \|\| 'weekly'\) === wantMode/.test(pickStudent), true);
eq('card do treino mostra o tipo', /const modeLabel = \(p\.mode \|\| 'weekly'\) === 'cyclic'/.test(pickStudent), true);
const loadStudents = grabFrom(edJs, 'loadImportStudents');
eq('contagem de treinos por aluno respeita o modo', /if \(wantMode && \(r\.mode \|\| 'weekly'\) !== wantMode\) return;/.test(loadStudents), true);
const confirmImport = grabFrom(edJs, 'confirmImport');
eq('importação incompatível é barrada', /if \(currentMode && importMode !== currentMode\)/.test(confirmImport), true);
const closeImport = grabFrom(edJs, 'closeImport');
eq('cancelar importação pede o tipo em vez de assumir', /if \(!currentMode\) openModePicker\(\);/.test(closeImport), true);

// Preview de importação funcionava só para semanal
const pickPlan = grabFrom(edJs, 'pickImportPlan');
eq('preview cobre treino cíclico', /const previewKeys = isCyclic/.test(pickPlan), true);

// ====================================================================
// 3. SUBTÍTULO: sugestões de região muscular
// ====================================================================
const sql = read('sql/19_subtitle_library.sql');
eq('tabela subtitle_library criada', /CREATE TABLE IF NOT EXISTS public\.subtitle_library/.test(sql), true);
eq('subtítulo é único por professor', /UNIQUE\(coach_id, name_lower\)/.test(sql), true);
eq('use_count ordena as sugestões', /use_count  INT NOT NULL DEFAULT 1/.test(sql), true);
eq('RLS habilitado', /ALTER TABLE public\.subtitle_library ENABLE ROW LEVEL SECURITY/.test(sql), true);
eq('4 políticas de RLS (select/insert/update/delete)', (sql.match(/CREATE POLICY sublib_/g) || []).length, 4);
eq('professor só vê os próprios subtítulos', /USING \( coach_id = auth\.uid\(\) OR public\.is_owner\(\) \)/.test(sql), true);

// Campo de subtítulo ancora a lista de sugestões
eq('campo de subtítulo tem wrapper para o autocomplete', /className = 'subtitle-field'/.test(edJs), true);
eq('CSS do wrapper existe', /\.subtitle-field \{ position: relative;/.test(edHtml), true);
eq('lista do subtítulo é marcada (ac-subtitle)', /'ac-list ac-subtitle'/.test(edJs), true);
eq('digitar no subtítulo dispara sugestões', /classList\.contains\('day-subtitle-input'\)/.test(edJs), true);
eq('subtítulo aprendido pode ser removido', /removeSubtitleFromLibrary/.test(edJs), true);
eq('salvar alimenta a biblioteca de subtítulos', /upsertSubtitleLibrary\(subtitles\)/.test(savePlan), true);
eq('biblioteca carrega junto com a de exercícios', /loadSubtitleLibrary\(\);/.test(edJs), true);

// --- Execução real de normKey + filterSubtitles ---
const defaultsBlock = edJs.match(/const DEFAULT_SUBTITLES = \[[\s\S]*?\n\];/)[0];
const normBlock = edJs.match(/const DEFAULT_SUBTITLES_NORM = .*;/)[0];
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  `${defaultsBlock}\n${grabFrom(edJs, 'normKey')}\n${normBlock}\n` +
  `let subtitleLibrary = [];\n${grabFrom(edJs, 'filterSubtitles')}\n` +
  // const de topo não vaza para o contexto: expõe via função
  `function setLib(l) { subtitleLibrary = l; }\n` +
  `function getDefaults() { return DEFAULT_SUBTITLES; }`,
  ctx
);
const { normKey, filterSubtitles, setLib, getDefaults } = ctx;
const DEFAULT_SUBTITLES = getDefaults();

eq('normKey tira acento e caixa', normKey('Bíceps'), 'biceps');
eq('normKey colapsa espaços', normKey('  Ombro   +  Peito '), 'ombro + peito');

// A lista padrão cobre o que o professor pediu
['Ombro', 'Peito', 'Costas', 'Perna', 'Posterior de Perna', 'Glúteo', 'Inferiores', 'Superiores',
 'Ombro + Peito', 'Ombro + Peito + Bíceps', 'Ombro + Peito + Tríceps', 'Ombro + Costas']
  .forEach(s => eq(`lista padrão tem "${s}"`, DEFAULT_SUBTITLES.includes(s), true));

// Cenário do professor: digita "o" e as opções de ombro vêm primeiro
const porO = filterSubtitles('o').map(r => r.name);
eq('digitar "o" traz Ombro primeiro', porO[0], 'Ombro');
eq('digitar "o" traz combinações de ombro', porO.filter(n => n.startsWith('Ombro')).length >= 4, true);

const porOmbro = filterSubtitles('ombro').map(r => r.name);
eq('digitar "ombro" só traz opções de ombro', porOmbro.every(n => normKey(n).includes('ombro')), true);
eq('digitar "ombro" traz Ombro + Peito + Bíceps', porOmbro.includes('Ombro + Peito + Bíceps'), true);

// Busca sem acento encontra a sugestão acentuada
eq('digitar "biceps" acha Bíceps', filterSubtitles('biceps').map(r => r.name).includes('Bíceps'), true);
eq('digitar "gluteo" acha Glúteo', filterSubtitles('gluteo').map(r => r.name).includes('Glúteo'), true);
eq('digitar "abdomen" acha Abdômen', filterSubtitles('abdomen').map(r => r.name).includes('Abdômen'), true);

// Campo vazio já sugere algo (não obriga o professor a adivinhar)
eq('campo vazio sugere opções', filterSubtitles('').length, 8);
eq('no máximo 8 sugestões', filterSubtitles('a').length <= 8, true);

// O que o professor digitou antes vence a lista padrão
setLib([
  { id: 's1', name: 'Ombro + Trapézio + Antebraço', use_count: 9, _norm: normKey('Ombro + Trapézio + Antebraço') },
  { id: 's2', name: 'Ombro', use_count: 3, _norm: normKey('Ombro') },
]);
const comLib = filterSubtitles('ombro');
eq('o mais usado pelo professor vem primeiro', comLib[0].name, 'Ombro + Trapézio + Antebraço');
eq('os dois subtítulos do professor vêm antes de qualquer padrão',
  comLib.slice(0, 2).map(r => r.name), ['Ombro + Trapézio + Antebraço', 'Ombro']);
eq('depois deles vêm as sugestões padrão', !!comLib[2]._default, true);
eq('"Ombro" não duplica entre biblioteca e padrão',
  comLib.filter(r => r.name === 'Ombro').length, 1);
eq('subtítulo do professor não vem marcado como padrão', !!comLib[0]._default, false);
eq('subtítulo do professor traz id (permite remover)', comLib[1].id, 's2');
eq('sugestão padrão não traz id', comLib.find(r => r._default).id, null);

// Termo desconhecido: nada é inventado (fica só o que o professor digitou)
eq('termo inédito não retorna sugestão falsa', filterSubtitles('xablau').length, 0);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
