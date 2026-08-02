// Executa arquivos SQL via Supabase Management API.
// Uso: node run_sql.mjs <PAT> <arquivo1.sql> [arquivo2.sql ...]
// O PAT vem por argumento (não fica salvo em arquivo).
import { readFileSync } from 'node:fs';

const [pat, ...files] = process.argv.slice(2);
const ref = 'qslvwyhpamazoqhcmqan';
const uri = `https://api.supabase.com/v1/projects/${ref}/database/query`;

if (!pat || files.length === 0) {
  console.error('Uso: node run_sql.mjs <PAT> <arquivo.sql> ...');
  process.exit(1);
}

for (const f of files) {
  const query = readFileSync(f, 'utf8');
  process.stdout.write(`\n=== ${f} ===\n`);
  try {
    const res = await fetch(uri, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const text = await res.text();
    console.log(`HTTP ${res.status}: ${text.slice(0, 800)}`);
    if (!res.ok) { console.log('>>> PAROU por erro.'); break; }
  } catch (e) {
    console.log('FETCH ERRO:', e.message);
    break;
  }
}
