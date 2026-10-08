// Build para o Vercel no formato Build Output API (.vercel/output).
// Funciona com o Root Directory vazio, em apps/web ou em apps/api: a saída é
// sempre gravada em <diretório atual>/.vercel/output, onde o Vercel a procura.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(process.cwd(), '.vercel', 'output');
const fnDir = path.join(out, 'functions', '_app.func');

console.log(`[vercel-build] raiz do repositório: ${repoRoot}`);
console.log(`[vercel-build] saída: ${out}`);

execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(fnDir, { recursive: true });

// Painel estático em /admin
fs.cpSync(path.join(repoRoot, 'dist', 'admin'), path.join(out, 'static', 'admin'), { recursive: true });

// Função única: API, Landing Pages, domínios personalizados e "/"
await build({
  entryPoints: [path.join(repoRoot, 'scripts', 'vercel-entry.js')],
  outfile: path.join(fnDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['pg-native'],
  // __dirname/__filename como globais (não const): pacotes ESM embutidos, como o yargs do puppeteer, declaram os seus
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import __p from 'node:path'; const require = __cr(import.meta.url); globalThis.__filename = __fu(import.meta.url); globalThis.__dirname = __p.dirname(globalThis.__filename);",
  },
  logLevel: 'warning',
});
fs.cpSync(path.join(repoRoot, 'database', 'migrations'), path.join(fnDir, 'migrations'), { recursive: true });
// Binários do Chromium (imagem das LPs): o pacote procura a pasta bin ao lado do próprio código, que some no bundle
fs.cpSync(path.join(repoRoot, 'node_modules', '@sparticuz', 'chromium', 'bin'), path.join(fnDir, 'chromium'), { recursive: true });
fs.writeFileSync(
  path.join(fnDir, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 300 }, null, 2),
);

fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: 'filesystem' },
        { src: '^/admin(?:/.*)?$', dest: '/admin/index.html' },
        { src: '^/(.*)$', dest: '/_app?__lp_path=$1' },
      ],
    },
    null,
    2,
  ),
);

console.log('[vercel-build] concluído');
