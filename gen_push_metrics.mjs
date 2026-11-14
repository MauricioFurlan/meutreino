// Gera supabase/functions/send-push/metrics.gen.mjs a partir de public/metrics.js.
//
// A Edge Function precisa da MESMA regra de sequência que o app mostra
// (computeStreak / computeStreakCyclic). Copiar a função à mão já deu errado
// uma vez neste projeto (duas cópias divergindo), então a cópia é gerada:
// metrics.js é script clássico, aqui ele vira um módulo ES que devolve
// window.Metrics. test_push.mjs falha se o gerado ficar desatualizado.
//
// Uso: node gen_push_metrics.mjs   (rodar depois de mexer em public/metrics.js)
import fs from 'node:fs';

export const OUT = 'supabase/functions/send-push/metrics.gen.mjs';

export function build() {
  const src = fs.readFileSync('public/metrics.js', 'utf8');
  return '// GERADO por gen_push_metrics.mjs a partir de public/metrics.js. Não editar.\n' +
    'const window = {};\n' + src + '\nexport default window.Metrics;\n';
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  fs.writeFileSync(OUT, build());
  console.log('gerado', OUT);
}
