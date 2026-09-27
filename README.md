# LP — Geração automática de Landing Pages

Plataforma que cria Landing Pages profissionais a partir do site de uma empresa:

1. O administrador informa a URL.
2. O sistema lê o site (página inicial + até 5 páginas internas relevantes).
3. A IA interpreta o conteúdo e monta um cadastro estruturado.
4. Um verificador descarta qualquer dado factual que não esteja na fonte.
5. O administrador revisa e corrige os dados.
6. A IA escreve os textos e escolhe a direção visual conforme o segmento.
7. O administrador visualiza, ajusta e publica em `/lp/:slug`, ou num domínio próprio.

## Arquitetura

```
lp/
├── apps/
│   ├── api/                 Backend Node + Express + TypeScript
│   │   └── src/
│   │       ├── config/        variáveis de ambiente
│   │       ├── db/            conexão PostgreSQL, migrations, admin inicial
│   │       ├── lib/           slug, telefone/WhatsApp, validação, proteção SSRF
│   │       ├── middleware/    autenticação (cookie httpOnly), CSRF, erros
│   │       ├── repositories/  acesso a dados (SQL parametrizado)
│   │       ├── routes/        endpoints REST + páginas públicas
│   │       ├── services/
│   │       │   ├── ai/        AIService + provedores (Anthropic), schemas
│   │       │   ├── scraper/   coleta do site
│   │       │   ├── pipeline/  análise, geração e verificação anti-invenção
│   │       │   ├── jobs/      processamento assíncrono com progresso
│   │       │   └── storage/   armazenamento de arquivos (local; pronto para S3)
│   │       └── landing/       renderização da LP (React SSR → HTML estático)
│   │           └── sections/  HeroSection, AboutSection, ServicesSection, ...
│   └── web/                 Painel administrativo React + Vite + Tailwind
│       └── src/ components/ pages/ services/ hooks/ lib/ types/
├── database/migrations/     SQL versionado
├── deploy/Caddyfile         proxy HTTPS + TLS sob demanda para domínios próprios
├── Dockerfile
└── docker-compose.yml       produção (Postgres + app + Caddy)
```

**Separação de responsabilidades**

| Parte | Rota | Descrição |
|---|---|---|
| Painel | `/admin` | SPA React autenticada |
| API | `/api/*` | JSON, autenticada (exceto login e verificação de domínio) |
| LPs públicas | `/lp/:slug` | HTML renderizado no servidor, CSS inline e só um script de animação com menos de 1 KB |
| Domínio próprio | `https://empresa.com.br/` | O host é identificado e a LP vinculada é servida |

**As LPs são renderizadas a partir dos dados estruturados**: dados da empresa, mais o conteúdo e o tema da LP. Editar o telefone da empresa atualiza a página na hora. Um snapshot HTML também fica em `landing_pages.html_content`, para exportação ou hospedagem estática.

**Sem dependência de fornecedor**: qualquer PostgreSQL 13+ funciona (local, Docker, VPS, Supabase, RDS). O provedor de IA fica atrás da interface `AIProvider`. O armazenamento de arquivos fica atrás de `StorageService`.

## Rodando localmente

Requisitos: Node 20+ e um PostgreSQL.

```bash
cp .env.example .env          # preencha JWT_SECRET, ADMIN_*, ANTHROPIC_API_KEY
docker compose -f docker-compose.dev.yml up -d   # banco local (ou use Supabase)
npm install
npm run dev                   # API :3333 + painel :5173
```

Acesse **http://localhost:5173/admin**. As migrations rodam sozinhas ao iniciar a API. O administrador é criado a partir de `ADMIN_EMAIL` e `ADMIN_PASSWORD` na primeira execução.

> Com o Vite em execução, `/api`, `/lp` e `/uploads` são encaminhados para a API. Por isso as URLs públicas em dev ficam como `http://localhost:5173/lp/slug`.

### Usando Supabase como banco

Em *Project Settings → Database → Connection string*, copie a URI do **Session pooler** e configure:

```
DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

A migration ativa RLS sem políticas em todas as tabelas. Assim a API pública do Supabase (anon) não enxerga nada, e o acesso acontece só pelo backend.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | Conexão PostgreSQL |
| `APP_URL` | URL pública do sistema, usada para montar as URLs das LPs |
| `APP_HOSTS` | Hosts do próprio sistema. Qualquer outro host é tratado como domínio personalizado |
| `JWT_SECRET` | Segredo da sessão (≥ 32 caracteres em produção) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Administrador inicial |
| `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` | IA, **somente no servidor** |
| `STORAGE_DRIVER`, `UPLOAD_DIR` | Armazenamento de imagens enviadas |

## API principal

| Método | Rota | Função |
|---|---|---|
| POST | `/api/auth/login` · `/logout` · `/password` | Sessão (cookie httpOnly) |
| POST | `/api/analyze-url` `{ url }` | Inicia coleta + interpretação e retorna `jobId` |
| GET | `/api/jobs/:id` | Progresso (etapas 1–9) e resultado estruturado |
| POST | `/api/generate-landing-page` `{ companyId, landingPageId?, keepTheme? }` | Gera ou regenera (nova versão) |
| GET/POST/PUT/DELETE | `/api/companies[/:id]` | CRUD de empresas (com filtros `search`, `segment`, `city`, `status`) |
| GET/DELETE | `/api/landing-pages[/:id]` | Listagem, detalhe e exclusão |
| PUT | `/api/landing-pages/:id/content` | Edição de textos, tema e SEO (cria versão) |
| PATCH | `/api/landing-pages/:id/status` | `ativa` / `inativa` |
| POST | `/api/landing-pages/:id/publish` | Publica |
| PATCH | `/api/landing-pages/:id/settings` | Slug e domínio personalizado |
| POST | `/api/landing-pages/:id/domain/verify` | Verifica o DNS do domínio |
| POST | `/api/landing-pages/:id/versions/:v/restore` | Restaura versão |
| GET | `/api/landing-pages/:id/preview` · `/export` | Prévia (mesmo inativa) e download do HTML |
| POST | `/api/uploads` | Upload de imagem (JPG/PNG/WEBP/GIF, 5 MB) |

A análise e a geração levam de 30 s a 2 min por causa da IA. Por isso rodam como *jobs*: a interface acompanha o progresso e nunca fica travada.

## Regra "não inventar"

Ela é aplicada em três camadas:

1. **Prompt**: a IA é instruída a deixar vazio o que não encontrar.
2. **Verificação na fonte** (`services/pipeline/verify.ts`): telefone, WhatsApp, e-mail, CEP, cidade, bairro, endereço, razão social, redes sociais e depoimentos precisam aparecer no conteúdo coletado. O que não aparecer é descartado e listado na tela de revisão.
3. **Renderização**: uma seção só existe se houver dado real. Depoimentos vêm sempre do cadastro, nunca do texto gerado. A galeria só aparece com imagens liberadas. Produtos só aparecem se houver produtos cadastrados.

**Imagens só aparecem na LP com permissão de uso.** Na tela da URL há a opção "Usar as fotos do site na Landing Page", em que o administrador declara ter autorização. Sem ela, as fotos entram bloqueadas e podem ser liberadas na revisão ("Liberar todas") ou uma a uma. Imagens enviadas pelo administrador já entram liberadas.

**Coleta de fotos**: o scraper lê `<img>`, `srcset`, `<picture>`, imagens de fundo e atributos de lazy loading (`data-src`, `data-lazy-srcset`, `nitro-lazy-src` etc.). Mede cada imagem baixando só o cabeçalho do arquivo, descarta ícones e miniaturas, elimina a mesma foto em tamanhos diferentes e a IA seleciona e descreve as fotos úteis. A maior foto da empresa vira o destaque do topo. Em empresas já cadastradas, **Editar empresa → Buscar fotos do site** repete a coleta. Quando a empresa ganha 3 ou mais fotos liberadas, a seção de galeria é adicionada à LP automaticamente.

## Design adaptativo

Existem 10 direções visuais (`apps/api/src/landing/theme.ts`): saúde, advocacia, academia, gastronomia, imobiliário, estética, oficina, tecnologia, educação e serviços. Cada uma define tipografia (Google Fonts), paleta, raios, caixa dos títulos e o layout de serviços (cards ou lista numerada). A IA escolhe o preset, as cores e a variação do topo (dividido, centralizado ou imagem cheia). O sistema garante contraste WCAG ajustando as cores automaticamente. O administrador pode trocar tudo em **Cores e estilo**.

## Segurança

- Sessão por cookie `httpOnly` + `SameSite=Lax`. Nenhum token fica acessível ao JavaScript.
- Proteção CSRF: escritas exigem JSON e origem do próprio sistema.
- Senhas com bcrypt (custo 12). Login com limite de tentativas.
- SQL sempre parametrizado. Entrada validada com Zod.
- URLs salvas passam por whitelist (`http(s)`, `mailto`, `tel`). `javascript:` é bloqueado.
- **SSRF**: o scraper bloqueia localhost, redes privadas e metadata de nuvem, inclusive após redirecionamentos.
- LPs públicas com CSP restritiva (`script-src` por hash).
- Uploads validados pela assinatura binária do arquivo.
- Chave da IA só no backend.
- Multi-tenant: todas as consultas filtram por `organization_id`.

## Deploy no Vercel

O repositório já vem pronto para o Vercel:
- `vercel.json` publica o painel (gerado em `dist/admin` na raiz) como estático em `/admin`.
- A função `api/index.js` atende a API, as LPs (`/lp/:slug`), os domínios personalizados e `/`.

**Configuração do projeto no Vercel** (Settings → General / Build):

| Campo | Valor |
|---|---|
| Root Directory | **vazio** (raiz do repositório — *não* `apps/api`) |
| Framework Preset | **Other** |
| Build / Output / Install | deixar em branco (vêm do `vercel.json`) |

**Variáveis de ambiente** (Settings → Environment Variables):

| Variável | Exemplo / observação |
|---|---|
| `DATABASE_URL` | Postgres externo. Supabase: string do **Transaction pooler** (porta 6543) |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | 64+ caracteres aleatórios |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | administrador criado no primeiro acesso |
| `AI_PROVIDER` + chave | `gemini` + `GEMINI_API_KEY` (ou `anthropic` + `ANTHROPIC_API_KEY`) |
| `AI_MODEL` | opcional (ex.: `gemini-flash-latest`) |
| `APP_URL` | opcional. Padrão: domínio de produção do Vercel. Defina se usar domínio próprio para o painel |

**Uploads de imagem**: o disco do Vercel é somente leitura. Em *Storage → Create → Blob*, conecte um Blob Store ao projeto. O token `BLOB_READ_WRITE_TOKEN` é criado automaticamente e o sistema passa a usá-lo.

**Como funciona no Vercel**:
- **Processamento:** análise e geração rodam em segundo plano com `waitUntil`, limitadas a 300 s por função.
- **Migrations:** executam na primeira requisição de cada instância, protegidas por trava no banco.
- **URLs de preview:** as `*.vercel.app` abrem o painel normalmente.

## Deploy em VPS (Docker)

```bash
# .env com APP_URL=https://painel.seudominio.com.br, APP_HOSTS=painel.seudominio.com.br,
# JWT_SECRET, ADMIN_*, ANTHROPIC_API_KEY
export APP_DOMAIN=painel.seudominio.com.br POSTGRES_PASSWORD=uma-senha-forte
docker compose up -d --build
```

O Caddy emite HTTPS automaticamente para `APP_DOMAIN`.

### Domínios personalizados

1. No editor da LP, em **Publicação**, informe `www.empresa.com.br`.
2. No DNS da empresa, crie `CNAME www.empresa.com.br → painel.seudominio.com.br`. Para domínio raiz, use um registro `A` com o IP da VPS.
3. Clique em **Verificar DNS**.
4. No primeiro acesso, o Caddy consulta `/api/domains/check` e emite o certificado sob demanda. Só domínios verificados e com LP ativa recebem certificado.

## Status da primeira versão

**Implementado e testado**:

- Login e sessão
- Dashboard
- Cadastro por URL com progresso em 9 etapas
- Coleta do site
- Verificação anti-invenção
- Revisão e correção dos dados
- Geração da LP
- Prévia desktop/celular
- Publicação e URL pública
- Ativar e desativar
- Edição de empresa, textos, cores e SEO
- Versões com restauração
- Regeneração
- Exclusão
- Slug único
- Domínio personalizado (verificação de DNS + TLS sob demanda)
- Exportação HTML
- Upload de imagens

**Pendências e próximos passos**:

- **Sites 100% JavaScript ou protegidos contra robôs** (Cloudflare, SPAs sem SSR): o scraper não executa JS e retorna "informações insuficientes". Como alternativa, a interface oferece **Preencher manualmente**. Próximo passo: um fetcher com navegador headless (Playwright), plugável em `ScraperService`.
- **Imagem Open Graph gerada automaticamente**: hoje usa a imagem liberada ou o logotipo, com a opção de informar uma URL.
- **Otimização de imagens / CDN**: imagens externas são referenciadas pela URL de origem. Próximo passo: baixar as imagens aprovadas para o storage (S3/R2) e redimensioná-las.
- **Gestão de usuários e organizações**: o banco já suporta (`organizations`, `users.role`, `organization_id` em tudo). Falta a tela de convite de usuários.
- **`ssl_status`** não passa sozinho para "active". O certificado é emitido pelo Caddy, mas o sistema não recebe esse evento.
- **Fila de jobs em processo**: é suficiente para uma instância. Para escalar horizontalmente, troque `JobService` por BullMQ ou pg-boss. O rate limit também é em memória.
