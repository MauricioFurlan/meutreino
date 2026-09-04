// Testes do modal "Ver histórico" do exercício (tela do aluno).
// O X no canto de cima fecha sem rolar até o fim; o botão Fechar do rodapé
// continua existindo, e o cabeçalho gruda no topo enquanto a lista rola.
import fs from 'fs';

const HTML = fs.readFileSync('index.html', 'utf8');

let pass = 0, fail = 0;
const eq = (nome, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log(`${ok ? 'PASS' : 'FALHOU'}  ${nome}` + (ok ? '' : `\n        esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(real)}`));
  ok ? pass++ : fail++;
};

const modal = HTML.match(/<div class="history-modal" id="historyModal">[\s\S]*?\n  <\/div>/)[0];

// O X e o título dividem o cabeçalho.
eq('modal tem cabeçalho', /<div class="history-modal-header">/.test(modal), true);
eq('título continua no cabeçalho', /history-modal-header[\s\S]*?id="historyModalTitle"/.test(modal), true);
eq('X fecha o histórico', /class="history-modal-x" onclick="closeHistoryModal\(\)"/.test(modal), true);
eq('X é legível por leitor de tela', /aria-label="Fechar histórico"/.test(modal), true);
eq('X está dentro do cabeçalho', /history-modal-header[\s\S]*?history-modal-x[\s\S]*?<\/div>/.test(modal), true);

// "também": o Fechar do rodapé não sai de cena.
eq('botão Fechar continua no rodapé',
   /<button class="history-modal-close" onclick="closeHistoryModal\(\)">Fechar<\/button>/.test(modal), true);
eq('as duas saídas chamam a mesma função',
   (modal.match(/closeHistoryModal\(\)/g) || []).length, 2);

// Quem rola é o .history-modal-content; sem sticky o X sumiria no primeiro
// arrasto de um histórico de quatro semanas.
const regraHeader = HTML.match(/\.history-modal-header \{[\s\S]*?\}/)[0];
eq('cabeçalho gruda no topo', /position: sticky/.test(regraHeader), true);
eq('cabeçalho encosta na borda de cima', /top: -16px/.test(regraHeader), true);
eq('cabeçalho tem fundo próprio (a lista passa por baixo)',
   /background: var\(--bg-card\)/.test(regraHeader), true);
eq('cabeçalho fica na frente da lista', /z-index: 1/.test(regraHeader), true);
// O padding de 16px do container é cancelado para a faixa ir de ponta a ponta.
eq('faixa vai de ponta a ponta', /margin: -16px -16px 12px/.test(regraHeader), true);
const regraContent = HTML.match(/\.history-modal-content \{[\s\S]*?\}/)[0];
eq('é o content que rola', /overflow-y: auto/.test(regraContent), true);
eq('o padding cancelado é mesmo 16px', /padding: 16px/.test(regraContent), true);

// O modal de sair usa a mesma caixa, mas não ganhou cabeçalho nenhum.
const sair = HTML.match(/<div class="history-modal logout-modal"[\s\S]*?\n  <\/div>/)[0];
eq('modal de sair segue sem X', /history-modal-x/.test(sair), false);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
