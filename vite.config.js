import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// ─── Plugin: injeta window.__ENV no <head> de cada HTML ───────────────────────
// Isso evita o uso de import.meta.env em scripts não-módulo, mantendo
// a compatibilidade com os scripts inline existentes.
function injectEnvPlugin(env) {
  const snippet = `<script>window.__ENV=${JSON.stringify({
    SUPABASE_URL: env.VITE_SUPABASE_URL,
    SUPABASE_KEY: env.VITE_SUPABASE_KEY,
  })};</script>`;

  return {
    name: 'inject-env',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n  ${snippet}`);
    },
  };
}

// ─── Plugin: gera ícones PNG a partir dos SVGs via @resvg/resvg-js ───────────
function generateIconsPlugin() {
  return {
    name: 'generate-png-icons',
    async buildStart() {
      // Gera os PNGs na pasta public/ ANTES do build
      // assim o Vite os copia para dist/ como arquivos estáticos (sem hash)
      const { Resvg } = await import('@resvg/resvg-js');
      const publicDir = resolve(process.cwd(), 'public');

      // Duas variantes: aluno (ciano, vazado) e professor (dourado, cheio).
      // Cada uma tem um único SVG de origem, renderizado em 192 e 512 px.
      const icons = [
        { size: 192, src: 'icon-aluno.svg', out: 'icon-192.png' },
        { size: 512, src: 'icon-aluno.svg', out: 'icon-512.png' },
        { size: 192, src: 'icon-professor.svg', out: 'icon-pro-192.png' },
        { size: 512, src: 'icon-professor.svg', out: 'icon-pro-512.png' },
      ];

      for (const { size, src, out } of icons) {
        const svg = fs.readFileSync(resolve(process.cwd(), src), 'utf8');
        const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
        const pngBuffer = resvg.render().asPng();
        fs.writeFileSync(resolve(publicDir, out), pngBuffer);
        console.log(`  ✓ ${out} → public/`);
      }
    },
  };
}

// ─── Páginas do app (multi-page) ──────────────────────────────────────────────
const pages = [
  'login', 'index', 'professor', 'owner',
  'editor', 'treinos', 'treinador', 'anamnese', 'anotacoes',
  'evolucao', 'config',
];

const input = Object.fromEntries(
  pages.map((name) => [
    name,
    resolve(process.cwd(), name === 'index' ? 'index.html' : `${name}.html`),
  ])
);

// ─── Config ───────────────────────────────────────────────────────────────────
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    base: '/',
    build: {
      outDir: 'dist',
      rollupOptions: { input },
      minify: 'esbuild',
    },
    envPrefix: 'VITE_',
    plugins: [
      injectEnvPlugin(env),
      generateIconsPlugin(),
    ],
  };
});
