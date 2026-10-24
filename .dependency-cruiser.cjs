/**
 * Contratos de arquitetura (npm run arch). Cada regra descreve uma direção proibida entre camadas;
 * o CI falha se alguma for quebrada.
 *
 * API: routes → (middleware, services, repositories, landing) → lib → db → config
 * Painel: pages → components → (hooks, services, lib, types)
 */
const API = '^apps/api/src/';
const WEB = '^apps/web/src/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sem-ciclos',
      severity: 'error',
      comment: 'Dependência circular entre módulos (imports só de tipo não contam: somem na compilação).',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    { name: 'api-nao-importa-painel', severity: 'error', comment: 'A API não usa código do painel.', from: { path: API }, to: { path: WEB } },
    { name: 'painel-nao-importa-api', severity: 'error', comment: 'O painel conversa com a API só por HTTP (/api).', from: { path: WEB }, to: { path: '^apps/api/' } },
    {
      name: 'rotas-so-no-app',
      severity: 'error',
      comment: 'Só o app.ts monta as rotas; nenhuma camada interna depende delas.',
      from: { path: API, pathNot: `${API}(app\\.ts|routes/)` },
      to: { path: `${API}routes/` },
    },
    {
      name: 'camadas-internas-sem-middleware',
      severity: 'error',
      comment: 'Serviços, repositórios, renderização da LP, lib e db não dependem de middleware HTTP.',
      from: { path: `${API}(services|repositories|landing|lib|db|config)/` },
      to: { path: `${API}middleware/` },
    },
    {
      name: 'db-so-depende-de-config',
      severity: 'error',
      comment: 'A camada de banco é a base: só lê configuração.',
      from: { path: `${API}db/` },
      to: { path: API, pathNot: `${API}(db|config)/` },
    },
    {
      name: 'config-independente',
      severity: 'error',
      comment: 'Configuração não depende das outras camadas.',
      from: { path: `${API}config/` },
      to: { path: API, pathNot: `${API}config/` },
    },
    {
      name: 'painel-base-sem-telas',
      severity: 'error',
      comment: 'lib, services, hooks e types do painel não importam telas nem componentes.',
      from: { path: `${WEB}(lib|services|hooks|types)/` },
      to: { path: `${WEB}(pages|components)/` },
    },
    {
      name: 'componentes-sem-telas',
      severity: 'error',
      comment: 'Componentes não importam páginas.',
      from: { path: `${WEB}components/` },
      to: { path: `${WEB}pages/` },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default', 'types'], extensions: ['.ts', '.tsx', '.js', '.mjs'] },
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
  },
};
