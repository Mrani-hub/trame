// Construit l'application web dans www/ (bundle esbuild + fichiers statiques).
import { build } from 'esbuild';
import { readFileSync, rmSync, mkdirSync, cpSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
cpSync('public', 'www', { recursive: true });
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir: 'www/js',
  minify: true,
  sourcemap: false,
  target: ['es2020', 'chrome80', 'safari15'],
  define: { 'globalThis.__APP_VERSION__': JSON.stringify(pkg.version) },
  logLevel: 'info',
});
