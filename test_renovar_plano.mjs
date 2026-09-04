// Testes do "Renovar por meses" — no modal de edição do aluno (professor.html)
// e no do professor (owner.html). Os dois vendem período, não data: o botão
// calcula o novo vencimento e escreve no campo, e o Salvar do modal é que grava.
//
// Roda o código REAL das duas telas (nada copiado para cá) contra um DOM de
// mentira, e confere que as duas usam a mesma conta.
import fs from 'fs';
import vm from 'vm';

const read = (f) => fs.readFileSync(f, 'utf8');

const inlineScript = (file) => {
  const blocks = [...read(file).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (blocks.length === 0) throw new Error('sem script inline em ' + file);
  return blocks.sort((a, b) => b.length - a.length)[0];
};

const grabFrom = (source, name) => {
  let i = source.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('não achei ' + name);
  let depth = 0, started = false;
  for (let p = i; p < source.length; p++) {
    if (source[p] === '{') { depth++; started = true; }
    else if (source[p] === '}') { depth--; if (started && depth === 0) return source.slice(i, p + 1); }
  }
  throw new Error('fim não encontrado: ' + name);
};

const grabConst = (source, name) => {
  const m = source.match(new RegExp('^const ' + name + ' = .*$', 'm'));
  if (!m) throw new Error('não achei const ' + name);
  return m[0];
};

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

// Monta a tela: os dois campos do bloco de renovação e um relógio fixo, para o
// teste não depender do dia em que roda.
const montarTela = (arquivo, { hoje = '2026-09-03', vencimento = '', meses = '3' } = {}) => {
  const src = inlineScript(arquivo);
  const els = {
    editExpires: { value: vencimento },
    editRenewMonths: { value: meses },
    editRenewHint: { textContent: '' }
  };
  const toasts = [];
  const ctx = {
    document: { getElementById: (id) => els[id] || null },
    showToast: (t, err) => toasts.push({ t, err: !!err }),
    Date, Math, JSON, parseInt
  };
  const api = new vm.Script(
    grabConst(src, 'isoDe') + '\n' +
    // O relógio do teste é fixo; o resto da conta é o código de verdade.
    `const hojeISO = () => ${JSON.stringify(hoje)};\n` +
    grabFrom(src, 'addMonthsISO') + '\n' +
    grabFrom(src, 'renewPlanMonths') + '\n' +
    '({ addMonthsISO, renewPlanMonths })'
  ).runInNewContext(ctx);
  return { api, els, toasts };
};

for (const arquivo of ['professor.html', 'owner.html']) {
  console.log(`\n--- ${arquivo} ---`);
  const { api } = montarTela(arquivo);

  // Conta de meses, sem escorregar de mês.
  eq('3 meses cheios', api.addMonthsISO('2026-09-03', 3), '2026-12-03');
  eq('vira o ano', api.addMonthsISO('2026-11-15', 3), '2027-02-15');
  eq('12 meses', api.addMonthsISO('2026-09-03', 12), '2027-09-03');
  // 31/01 + 1 mês com setMonth cru daria 03/03: o aluno ganharia dias de graça
  // e a data mudaria de mês.
  eq('31/01 + 1 mês para no fim de fevereiro', api.addMonthsISO('2026-01-31', 1), '2026-02-28');
  eq('ano bissexto usa o dia 29', api.addMonthsISO('2028-01-31', 1), '2028-02-29');
  eq('31/03 + 1 mês vira 30/04', api.addMonthsISO('2026-03-31', 1), '2026-04-30');
  // Dia que existe nos dois meses passa reto.
  eq('30/01 + 1 mês', api.addMonthsISO('2026-01-30', 1), '2026-02-28');

  // Plano ainda válido: soma a partir do vencimento, sem perder os dias que sobraram.
  {
    const { api, els } = montarTela(arquivo, { hoje: '2026-09-03', vencimento: '2026-10-10', meses: '2' });
    api.renewPlanMonths();
    eq('renova antes de vencer soma do vencimento', els.editExpires.value, '2026-12-10');
    eq('a dica mostra a data nova', els.editRenewHint.textContent,
       'Novo vencimento: 10/12/2026 — confirme em Salvar.');
  }

  // Plano vencido: recomeça de hoje (não vale ressuscitar prazo velho).
  {
    const { api, els } = montarTela(arquivo, { hoje: '2026-09-03', vencimento: '2026-06-01', meses: '3' });
    api.renewPlanMonths();
    eq('renova depois de vencer conta de hoje', els.editExpires.value, '2026-12-03');
  }

  // Vencendo hoje ainda conta de hoje (base = hoje, não "ontem + meses").
  {
    const { api, els } = montarTela(arquivo, { hoje: '2026-09-03', vencimento: '2026-09-03', meses: '1' });
    api.renewPlanMonths();
    eq('vence hoje: soma a partir de hoje', els.editExpires.value, '2026-10-03');
  }

  // Sem data nenhuma no campo.
  {
    const { api, els } = montarTela(arquivo, { hoje: '2026-09-03', vencimento: '', meses: '6' });
    api.renewPlanMonths();
    eq('sem vencimento conta de hoje', els.editExpires.value, '2027-03-03');
  }

  // Entrada inválida não mexe na data.
  for (const meses of ['0', '', 'abc', '-2']) {
    const { api, els, toasts } = montarTela(arquivo, { vencimento: '2026-10-10', meses });
    api.renewPlanMonths();
    eq(`meses "${meses}" não altera o vencimento`, els.editExpires.value, '2026-10-10');
    eq(`meses "${meses}" avisa o professor`, toasts.length === 1 && toasts[0].err, true);
  }
}

// ====================================================================
// A tela grava o que o botão calculou
// ====================================================================
{
  const prof = inlineScript('professor.html');
  eq('professor salva o vencimento', /access_expires_at: expires/.test(prof), true);
  eq('professor limpa a dica ao abrir o modal',
     /editRenewHint'\)\.textContent = ''/.test(prof), true);

  const own = inlineScript('owner.html');
  eq('owner salva o vencimento', /access_expires_at: document\.getElementById\('editExpires'\)/.test(own), true);
  eq('owner carrega o vencimento atual no modal',
     /getElementById\('editExpires'\)\.value\s*=\s*t\.access_expires_at/.test(own), true);
  // O pagamento e o renovar do modal precisam dar a mesma data.
  eq('pagamento usa a mesma conta', /const periodEnd = addMonthsISO\(periodStart, months\)/.test(own), true);
  eq('pagamento não usa mais toISOString', /paid_at: hoje/.test(own), true);
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
