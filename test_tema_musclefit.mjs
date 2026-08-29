// Testes desta rodada:
//   1. Autocomplete do editor: nunca duas listas abertas ao mesmo tempo e
//      a lista some quando o campo perde o foco (bug relatado: abrir o
//      autocomplete do nome do exercício e depois o do subtítulo deixava
//      os dois na tela).
//   2. Tema MuscleFit (preto + ciano elétrico) como tema padrão, valendo
//      também para as telas do professor, via brand.css.
//
// Mesma mistura dos outros arquivos de teste: função pura extraída e
// executada de verdade quando dá, asserção sobre o código quando a lógica
// só existe amarrada ao DOM/CSS.
import fs from 'fs';
import vm from 'vm';

const read = (f) => fs.readFileSync(f, 'utf8');
const inlineScript = (f) => {
  const blocks = [...read(f).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]);
  if (blocks.length === 0) throw new Error('sem script inline em ' + f);
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

// DOM mínimo para rodar as funções de verdade
class FakeEl {
  constructor(classes = []) {
    this.classes = new Set(classes);
    this.classList = {
      add: (c) => this.classes.add(c),
      remove: (c) => this.classes.delete(c),
      contains: (c) => this.classes.has(c),
    };
  }
  get aberta() { return this.classes.has('show'); }
}

// ====================================================================
// 1. AUTOCOMPLETE: UMA LISTA POR VEZ
// ====================================================================
{
  const src = grabFrom(edJs, 'hideAllAcLists');
  const listaExercicio = new FakeEl(['ac-list', 'show']);
  const listaSubtitulo = new FakeEl(['ac-list', 'show']);
  const todas = [listaExercicio, listaSubtitulo];
  const sandbox = {
    document: { querySelectorAll: () => todas.filter(l => l.aberta) },
    lista: null,
  };

  // Abrindo a lista do subtítulo, a do exercício tem de fechar
  vm.runInNewContext(src + '\nhideAllAcLists(alvo);', Object.assign(sandbox, { alvo: listaSubtitulo }));
  eq('abrir uma lista fecha a outra', listaExercicio.aberta, false);
  eq('a lista que está abrindo continua aberta', listaSubtitulo.aberta, true);

  // Sem argumento: fecha tudo (clique fora / Escape)
  vm.runInNewContext(src + '\nhideAllAcLists();', Object.assign(sandbox, { alvo: null }));
  eq('sem argumento fecha todas', listaSubtitulo.aberta, false);
}

{
  const src = grabFrom(edJs, 'acListsLoseFocus');
  const rodar = (alvo) => vm.runInNewContext(src + '\nacListsLoseFocus(alvo);', { alvo });

  const campo = { matches: (s) => s.includes('input'), closest: () => null };
  const itemDaLista = { matches: () => true, closest: (s) => (s === '.ac-list' ? {} : null) };
  const corpoDaPagina = { matches: () => false, closest: () => null };

  eq('focar outro campo fecha as sugestões', rodar(campo), true);
  eq('clique dentro da lista não fecha (não cancela a escolha)', rodar(itemDaLista), false);
  eq('foco solto no body não fecha', rodar(corpoDaPagina), false);
  eq('alvo sem matches não quebra', rodar({}), false);
}

// A lógica que só existe amarrada ao DOM: garantir que as duas listas passam
// pelo mesmo portão antes de aparecer.
eq('showAcList fecha as outras antes de abrir',
  /function showAcList[\s\S]{0,320}?hideAllAcLists\(list\)/.test(edJs), true);
eq('showSubtitleAcList fecha as outras antes de abrir',
  /function showSubtitleAcList[\s\S]{0,320}?hideAllAcLists\(list\)/.test(edJs), true);
eq('abrir sugestão fecha o seletor de descanso',
  (edJs.match(/hideAllAcLists\(list\);\s*\n\s*closeRestPicker\(\);/g) || []).length, 2);
eq('focusin em outro controle fecha as sugestões',
  /acListsLoseFocus\(e\.target\)\)\s*\{\s*\n\s*hideAllAcLists\(\);/.test(edJs), true);
eq('campo de exercício com menos de 2 letras não deixa lista velha aberta',
  /if \(e\.target\.value\.trim\(\)\.length >= 2\) showAcList[\s\S]{0,80}else hideAllAcLists\(\);/.test(edJs), true);
eq('Escape fecha as sugestões',
  /e\.key !== 'Escape'[\s\S]{0,160}hideAllAcLists\(\);/.test(edJs), true);
eq('clique fora mantém aberta só a lista do campo clicado',
  /closest\('\.exercise-top, \.subtitle-field'\);[\s\S]{0,160}hideAllAcLists\(wrap \?/.test(edJs), true);
eq('não sobrou o hideAllAcLists sem parâmetro na definição',
  /function hideAllAcLists\(except\)/.test(edJs), true);

// ====================================================================
// 2. TEMA MUSCLEFIT
// ====================================================================
const themeCss = read('theme.css');
const brandCss = read('brand.css');

const bloco = (nome) => {
  const re = nome === 'default'
    ? /:root,\s*\[data-theme="default"\]\s*\{([\s\S]*?)\}/
    : new RegExp(`\\[data-theme="${nome}"\\]\\s*\\{([\\s\\S]*?)\\}`);
  const m = themeCss.match(re);
  if (!m) throw new Error('bloco de tema não encontrado: ' + nome);
  return m[1];
};
const token = (nome, tk) => (bloco(nome).match(new RegExp(`--${tk}:\\s*([^;]+);`)) || [])[1];

eq('padrão usa o ciano elétrico da marca', token('default', 'accent'), '#00d5ff');
eq('padrão usa fundo preto neutro', token('default', 'bg-body'), '#08090c');
eq('padrão não usa mais o azul-marinho nos cartões', token('default', 'bg-card'), '#101419');
eq('padrão tem o triplete para os brilhos', token('default', 'accent-rgb'), '0,213,255');

// Os outros temas continuam intactos
eq('ember segue laranja', token('ember', 'accent'), '#f97316');
eq('emerald segue verde', token('emerald', 'accent'), '#10b981');
eq('daltonismo segue com azul claro', token('colorblind', 'accent'), '#4fc3f7');
eq('claro segue claro', token('light', 'bg-body'), '#f4f4f5');

// Todo tema precisa de --accent-rgb, senão os brilhos da brand.css sumiriam
const temas = ['default', 'ember', 'emerald', 'colorblind', 'steel', 'neon', 'highvis', 'light', 'corinthians', 'palmeiras', 'saopaulo', 'santos', 'flamengo'];
temas.forEach(t => eq(`${t} define --accent-rgb`, /^\d+,\d+,\d+$/.test(token(t, 'accent-rgb') || ''), true));
eq('nenhum tema ficou sem --accent-rgb',
  (themeCss.match(/--accent-rgb:/g) || []).length, temas.length);

// brand.css é token-driven: cor de marca só como fallback do var()
const brandRegras = brandCss.replace(/\/\*[\s\S]*?\*\//g, '');
const cyanForaDeVar = brandRegras
  .replace(/var\([^)]*\)/g, '')
  .match(/#[0-9a-fA-F]{6}/g) || [];
eq('brand.css não fixa cor de marca fora do var()', cyanForaDeVar, []);
eq('brand.css usa o accent do tema com fallback da marca',
  /var\(--accent,\s*#00d5ff\)/.test(brandCss), true);
eq('brand.css usa o triplete com fallback da marca',
  /var\(--accent-rgb,\s*0,213,255\)/.test(brandCss), true);
eq('brand.css não briga com !important', /!important/.test(brandRegras), false);
eq('brand.css não mexe no position do cabeçalho (treinador usa sticky)',
  /\.header\s*\{[^}]*position:/.test(brandCss), false);
// Regressão pega no navegador: declarar `position: relative` nesses botões
// arrancava o "Sair"/"← Voltar" do canto e jogava no meio do cabeçalho.
const regraBotoes = brandCss.match(/\.header \.logout-btn[\s\S]*?\{([^}]*)\}/)[1];
eq('botões do cabeçalho só ganham z-index', /position:/.test(regraBotoes), false);
eq('botões do cabeçalho sobem acima da faixa', /z-index:\s*2/.test(regraBotoes), true);
eq('logo (inline) ganha position para subir acima da faixa',
  /\.header \.app-logo \{ position: relative; z-index: 2; \}/.test(brandCss), true);
eq('botão secundário tracejado não virou CTA em caixa alta',
  /add-exercise-btn/.test(brandCss), false);
eq('brand.css desliga o clarão no tema claro',
  /\[data-theme="light"\] body::before \{ display: none; \}/.test(brandCss), true);
eq('brand.css tem a faixa diagonal da marca', /\.header::after/.test(brandCss), true);
eq('brand.css marca o título de seção com a barra ciano',
  /\.section-title::before/.test(brandCss), true);
eq('brand.css dá foco visível a quem navega por teclado',
  /:focus-visible/.test(brandCss), true);

// Todas as telas carregam a camada de marca, e DEPOIS do <style> inline
const paginas = ['login.html', 'index.html', 'professor.html', 'owner.html', 'editor.html',
  'treinos.html', 'treinador.html', 'anamnese.html', 'anotacoes.html', 'evolucao.html', 'config.html'];
paginas.forEach(p => {
  const html = read(p);
  const iBrand = html.indexOf('brand.css');
  eq(`${p} carrega brand.css`, iBrand > -1, true);
  const iStyle = html.lastIndexOf('<style');
  if (iStyle > -1) eq(`${p} carrega brand.css depois do <style> inline`, iBrand > iStyle, true);
  const iTheme = html.indexOf('theme.css');
  if (iTheme > -1) eq(`${p} carrega brand.css depois do theme.css`, iBrand > iTheme, true);
  eq(`${p} está dentro do <head>`, iBrand < html.indexOf('</head>'), true);
});

// A paleta antiga (azul-marinho + ciano apagado) não pode ter sobrado
const antigas = ['#0d2137', '#1a3a4f', '#00bcd4', '#0a2a3a', '#132d42', '#005a6a', '#0d0d0d'];
paginas.filter(p => p !== 'config.html').forEach(p => {
  const html = read(p).toLowerCase();
  const sobrou = antigas.filter(h => html.includes(h));
  eq(`${p} sem resto da paleta antiga`, sobrou, []);
});
// config.html mostra a paleta de TODOS os temas: só o cartão do padrão muda
eq('cartão do tema padrão atualizado no config',
  /theme-card\[data-theme="default"\]\.active \{ border-color: #00d5ff; \}/.test(read('config.html')), true);
eq('preview do tema padrão com as cores novas',
  /background:#101419[\s\S]{0,80}background:#00d5ff[\s\S]{0,80}background:#08090c/.test(read('config.html')), true);

// PWA: barra do sistema no ciano novo e cache renomeado
paginas.forEach(p => {
  const html = read(p);
  if (!/name="theme-color"/.test(html)) return;
  eq(`${p} theme-color no ciano novo`, /theme-color" content="#00d5ff"/.test(html), true);
});
eq('brand.css entra no build (link relativo, não absoluto)',
  /href="brand\.css"/.test(read('professor.html')), true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
