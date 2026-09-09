// Testes do código de login que sobrevive ao app ser descartado.
//
// No Android com pouca memória, o Chrome/PWA descarta a aba quando o aluno
// minimiza o app para buscar o código no e-mail. Ao voltar, a página recarrega
// do zero. Antes disso aqui, ele caía de volta na etapa do e-mail e pedia outro
// código — e o Supabase sobrescreve o token, invalidando justamente o código
// que ele tinha acabado de copiar. Guardamos o e-mail para devolvê-lo direto à
// etapa do código. Aqui rodam as funções REAIS de login.html, sem cópia.
import fs from 'fs';
import vm from 'vm';

const read = (f) => fs.readFileSync(f, 'utf8');

const inlineScript = (file) => {
  const blocks = [...read(file).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
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

const HTML = read('login.html');
const LOGIN = inlineScript('login.html');

// ====================================================================
// 1. As funções reais, com um localStorage de mentira
// ====================================================================
const fakeStorage = (impl) => {
  const box = new Map();
  return impl || {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
    removeItem: (k) => box.delete(k),
    _box: box
  };
};

const carrega = (storage) => {
  const ctx = { localStorage: storage, Date, JSON };
  const src = [
    HTML.match(/const PENDING_KEY = [^\n]+/)[0],
    HTML.match(/const PENDING_TTL = [^\n]+/)[0],
    grabFrom(LOGIN, 'savePending'),
    grabFrom(LOGIN, 'readPending'),
    grabFrom(LOGIN, 'clearPending'),
    '({ savePending, readPending, clearPending, PENDING_KEY, PENDING_TTL })'
  ].join('\n');
  return new vm.Script(src).runInNewContext(ctx);
};

const st = fakeStorage();
const api = carrega(st);

eq('sem nada guardado não restaura', api.readPending(), null);

api.savePending('aluno@email.com');
eq('guarda e devolve o e-mail', api.readPending().email, 'aluno@email.com');

api.clearPending();
eq('limpar apaga de verdade', api.readPending(), null);

// A janela precisa cobrir a ida ao e-mail sem passar da validade do OTP.
eq('janela de 30 minutos', api.PENDING_TTL, 30 * 60 * 1000);

// Fora do prazo não restaura — e ainda limpa o rastro do e-mail do aparelho.
st.setItem('mt_pending_otp', JSON.stringify({ email: 'velho@email.com', ts: Date.now() - 31 * 60 * 1000 }));
eq('estado vencido não restaura', api.readPending(), null);
eq('estado vencido é descartado', st.getItem('mt_pending_otp'), null);

st.setItem('mt_pending_otp', JSON.stringify({ email: 'quase@email.com', ts: Date.now() - 29 * 60 * 1000 }));
eq('dentro do prazo restaura', api.readPending().email, 'quase@email.com');

// Lixo no storage não pode derrubar a tela de login.
st.setItem('mt_pending_otp', '{isso não é json');
eq('JSON quebrado não explode', api.readPending(), null);
st.setItem('mt_pending_otp', JSON.stringify({ ts: Date.now() }));
eq('registro sem e-mail não restaura', api.readPending(), null);

// Navegador com storage bloqueado (aba anônima, cookies de terceiros barrados):
// o login precisa seguir funcionando, só sem a rede de proteção.
const bloqueado = carrega({
  getItem: () => { throw new Error('bloqueado'); },
  setItem: () => { throw new Error('bloqueado'); },
  removeItem: () => { throw new Error('bloqueado'); }
});
let explodiu = false;
try { bloqueado.savePending('x@y.com'); bloqueado.readPending(); bloqueado.clearPending(); } catch (e) { explodiu = true; }
eq('storage bloqueado não quebra o login', explodiu, false);

// ====================================================================
// 2. O fluxo da tela usa o estado guardado
// ====================================================================
// Só guarda depois que o Supabase confirmou o envio — guardar antes deixaria o
// aluno preso numa etapa de código que nunca chegou.
eq('guarda só após o envio dar certo',
   /if \(error\) \{ showMsg\('Erro ao enviar[^\n]*\n\s*savePending\(currentEmail\);/.test(LOGIN), true);
eq('boot restaura quando não há sessão',
   /showLogin\(\);\s*\n\s*const pending = readPending\(\);/.test(LOGIN), true);
eq('restaurar leva à etapa do código', /goToCodeStep\('Digite o código que enviamos\.', false\)/.test(LOGIN), true);
// Abrir o teclado sozinho no retorno atrapalha quem volta com o código copiado.
eq('restaurar não rouba o foco', /goToCodeStep\('Digite o código que enviamos\.', false\)/.test(LOGIN), true);

// Depois de entrar, o e-mail não fica sobrando no aparelho.
eq('entrar limpa o estado',
   /Código inválido ou expirado[^\n]*\n\s*clearPending\(\);/.test(LOGIN), true);
eq('"usar outro e-mail" limpa o estado',
   /backBtn'\)\.addEventListener\('click', \(\) => \{\s*\n\s*clearPending\(\);/.test(LOGIN), true);
eq('sair limpa o estado', /signOut\(\);\s*\n\s*clearPending\(\);\s*\n\s*location\.reload/.test(LOGIN), true);
eq('logout pela URL limpa o estado', /signOut\(\);\s*\n\s*clearPending\(\);\s*\n\s*history\.replaceState/.test(LOGIN), true);

// ====================================================================
// 3. Saída para quem perdeu a janela de 30 min
// ====================================================================
// O caminho antigo (digitar o e-mail de novo) pede um código novo e mata o que
// está na caixa de entrada. Este atalho só troca de etapa.
eq('existe o atalho "Já tenho um código"',
   /<button type="button" class="link" id="haveCodeBtn">Já tenho um código<\/button>/.test(HTML), true);
const atalho = LOGIN.match(/el\('haveCodeBtn'\)\.addEventListener\([\s\S]*?\n    \}\);/)[0];
eq('atalho não dispara novo código', /signInWithOtp/.test(atalho), false);
eq('atalho exige o e-mail', /if \(!email\)/.test(atalho), true);
eq('atalho também guarda o estado', /savePending\(currentEmail\)/.test(atalho), true);
eq('atalho vai para a etapa do código', /goToCodeStep\(/.test(atalho), true);

// Regra da casa: nada de emoji em elemento novo de interface.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
eq('atalho sem emoji', EMOJI.test('Já tenho um código'), false);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
