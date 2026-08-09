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

      const icons = [
        { size: 192, src: resolve(process.cwd(), 'icon-192.svg') },
        { size: 512, src: resolve(process.cwd(), 'icon-512.svg') },
      ];

      for (const { size, src } of icons) {
        const svg = fs.readFileSync(src, 'utf8');
        const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
        const pngBuffer = resvg.render().asPng();
        const outPath = resolve(publicDir, `icon-${size}.png`);
        fs.writeFileSync(outPath, pngBuffer);
        console.log(`  ✓ icon-${size}.png → public/`);
      }
    },
  };
}

// ─── Páginas do app (multi-page) ──────────────────────────────────────────────
const pages = [
  'login', 'index', 'professor', 'owner',
  'editor', 'treinos', 'treinador', 'anamnese', 'anotacoes',
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
