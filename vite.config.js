import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// ─── Plugin: renderiza SVGs em PNG usando @resvg/resvg-js ─────────────────────
function generateIconsPlugin() {
  return {
    name: 'generate-png-icons',
    async closeBundle() {
      const { Resvg } = await import('@resvg/resvg-js');
      const outDir = resolve(process.cwd(), 'dist');

      const icons = [
        { size: 192, src: resolve(process.cwd(), 'icon-192.svg') },
        { size: 512, src: resolve(process.cwd(), 'icon-512.svg') },
      ];

      for (const { size, src } of icons) {
        const svg = fs.readFileSync(src, 'utf8');
        const resvg = new Resvg(svg, {
          fitTo: { mode: 'width', value: size },
        });
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();
        const outPath = resolve(outDir, `icon-${size}.png`);
        fs.writeFileSync(outPath, pngBuffer);
        console.log(`  ✓ icon-${size}.png gerado (${pngBuffer.length} bytes)`);
      }
    },
  };
}

// ─── Páginas do app (multi-page) ──────────────────────────────────────────────
const pages = [
  'login',
  'index',
  'professor',
  'owner',
  'editor',
  'treinos',
  'treinador',
  'anamnese',
  'anotacoes',
];

const input = Object.fromEntries(
  pages.map((name) => [
    name,
    resolve(process.cwd(), name === 'index' ? 'index.html' : `${name}.html`),
  ])
);

// ─── Config ───────────────────────────────────────────────────────────────────
export default defineConfig({
  // base '/' para funcionar no Vercel sem subpasta
  base: '/',

  build: {
    outDir: 'dist',
    rollupOptions: { input },
    minify: 'esbuild',
  },

  // Expõe variáveis VITE_* para o código via import.meta.env
  envPrefix: 'VITE_',

  plugins: [generateIconsPlugin()],
});
