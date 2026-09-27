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
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import __p from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __p.dirname(__filename);",
  },
  logLevel: 'warning',
});
fs.cpSync(path.join(repoRoot, 'database', 'migrations'), path.join(fnDir, 'migrations'), { recursive: true });
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
