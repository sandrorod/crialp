# Segurança do CriaLP

## Auditoria de 22/10/2026 (checklist completo)

A auditoria de 18/10 (seções A–G abaixo) nunca tinha ido para produção: foi mesclada na versão atual
e revisada junto com tudo o que entrou depois dela (CRM/WhatsApp, avaliações do Google, lote de LPs,
editor). Testes: 119 (107 anteriores + 12 novos em `apps/api/test/security.test.ts`).

### Checklist

| Item | Situação | Como está |
|---|---|---|
| Chave de API protegida | OK | Chaves de IA/RapidAPI/Evolution/Drive só no servidor, criptografadas (AES-256-GCM) no banco; nenhuma no JavaScript do painel (bundle de produção verificado) |
| `.env` nunca exposto | OK | `.env*` no `.gitignore`; só `.env.example` versionado; `/.env` e `/.git/config` em produção dão 404 |
| Nenhuma senha no código | OK | Varredura do código e de todo o histórico do Git: só valores de exemplo e o banco descartável de teste |
| Login de verdade | OK | bcrypt custo 12, cookie `httpOnly`/`SameSite=Lax`/`Secure`, HS256 fixo, sessão cai ao trocar a senha |
| Permissões no servidor | OK | `requireRole` por rota (dono/admin/vendedor/cliente); testes de papéis |
| Não confiar no ID da tela | Corrigido (V19) | Toda rota confere se o registro é da organização; o webhook do WhatsApp não conferia |
| Cada usuário só vê seus dados | OK | Filtro por `organization_id` + escopo do vendedor; testes A×B nas páginas, empresas e CRM |
| Banco protegido | Corrigido (V01, V22) | RLS em todas as tabelas do sistema (3 estavam abertas à chave `anon` em produção) |
| Firebase / Supabase / Storage | OK | Firebase não é usado; o lp não usa Supabase Storage nem a chave `anon`. Buckets públicos existentes (BASQUETE, comunicados, tracking-audio) são de outros sistemas do mesmo projeto |
| Área administrativa protegida | Corrigido (V18) | Sessão + papéis no servidor; o painel na Vercel passou a ter CSP e cabeçalhos de segurança |
| Debug desligado em produção | OK | Sem `debugger`/logs de segredos; `NODE_ENV=production` na Vercel; `x-powered-by` desligado |
| Erros sem detalhes sensíveis | OK | Erro interno → "Erro interno. Tente novamente."; detalhes só no log do servidor |
| Validar tudo no servidor | OK | `zod` em corpo, parâmetros e consultas; IDs como UUID |
| Limpar o que o usuário envia | OK | React escapa texto; texto formatado só gera tags fixas e links `https:`/`mailto:`/`tel:`; `<style>` com escape central |
| Upload protegido | Corrigido (V20) | Imagens validadas pelos bytes, 2 MB, servidas com `nosniff`/sandbox; anexos do CRM podiam executar script |
| Injeção de SQL | OK | Só consultas parametrizadas; o que entra no texto do SQL são nomes fixos de colunas |
| Limite de tentativas | Corrigido (V21) | Login por IP e por conta, IA, coleta, upload — agora compartilhado entre instâncias |
| Repositório sem segredos | OK | Ver "Nenhuma senha no código" |
| Headers e CORS | Corrigido (V18) | Sem CORS liberado (só o próprio site); CSP com hash nas páginas, na API e no painel |
| Teste como usuário externo | Feito | Produção: rotas protegidas → 401 sem dados; teste automático com token forjado e `alg: none` |
| Auditoria completa com IA | Feito | Este relatório |

### Vulnerabilidades novas

| Id | Gravidade | Status | Onde | Causa → impacto | Correção | Teste |
|---|---|---|---|---|---|---|
| V19 | Média | Corrigido | `routes/crmWebhook.ts`, `services/crm/whatsapp.ts` | Apagar/atualizar status/reação por id do WhatsApp sem filtrar a organização → com o token de uma organização, mexer em mensagens de outra | Filtro pela organização dona da conversa | `security.test.ts` › Webhook |
| V20 | Média | Corrigido | `routes/crm.ts` (`/crm/media/:id`) | O tipo do anexo vem de quem manda a mensagem: HTML/SVG abria no domínio do painel → script rodando com a sessão de quem abriu | Só foto/áudio/vídeo comuns abrem na página; o resto baixa como anexo, com `CSP: sandbox` | `security.test.ts` › Anexos |
| V21 | Média | Corrigido | `lib/rateLimitStore.ts` (novo) | Limites em memória: na Vercel cada instância contava separado | Contador no Postgres (`lp_rate_limits`, migration 041) | `security.test.ts` › duas instâncias somam |
| V22 | Média | Corrigido | `services/crm/whatsapp.ts`, `routes/crm.ts` | URL da Evolution API digitada no painel era chamada sem checagem → SSRF (rede interna/metadata) | Em produção: só endereço público, conferido ao salvar e a cada chamada, sem redirecionamento | Revisão de código |
| V23 | Baixa | Corrigido (requer ação) | `JWT_SECRET` na Vercel | Segredo de produção com menos de 32 caracteres. A regra da V05 derrubaria o sistema no deploy | Segredo curto vira aviso; troca sem perda com `JWT_SECRET_PREVIOUS` (sessões, chaves criptografadas e webhook antigos continuam valendo; tudo é regravado com o novo na inicialização) | `security.test.ts` › Troca do JWT_SECRET |
| V24 | Baixa | Corrigido | `package-lock.json` | Vite 8.3.2 (só no desenvolvimento) | 8.3.5 via `npm audit fix` | `npm audit`: 0 |

### Riscos que continuam

| Risco | Motivo | Ação sugerida |
|---|---|---|
| `JWT_SECRET` curto em produção | A troca muda a configuração da Vercel | Gerar um novo (48 bytes aleatórios), mover o atual para `JWT_SECRET_PREVIOUS` e fazer o deploy; depois de alguns dias, apagar `JWT_SECRET_PREVIOUS` |
| `atendimento_lp` sem organização | Tabela global lida por integração externa; hoje há 1 organização | Ter coluna de organização se o sistema passar a ter várias |
| Outros sistemas no mesmo Supabase | Tabelas e buckets públicos de outros projetos não fazem parte desta auditoria | Revisar RLS e buckets desses sistemas |
| Posse de domínio personalizado | Igual à seção G | Registro TXT |

---


Auditoria de 18/10/2026 (branch `security/auditoria`). Correções pontuais: arquitetura, telas,
contratos da API e papéis de usuário não mudaram.

## A. Resumo executivo

| Gravidade | Encontradas | Corrigidas | Pendentes |
|---|---|---|---|
| Crítica | 1 | 1 | 0 |
| Alta | 4 | 4 | 0 |
| Média | 5 | 5 | 0 |
| Baixa | 8 | 7 | 1 (CSP do painel na Vercel) |

O código já tinha boas bases: consultas SQL parametrizadas, filtro por `organization_id` em todas as
rotas, cookie `httpOnly`, checagem da assinatura binária dos uploads, CSP com hash nas páginas públicas
e escape do React. Os problemas reais estavam nas bordas:

- **Banco do Supabase (V01):** três tabelas podiam ser alteradas por quem tivesse a chave `anon` do projeto.
- **SSRF (V02, V03):** endereços internos escritos como IPv6 passavam pela checagem, e a leitura de imagens seguia redirecionamentos sem conferir o destino.
- **Segredos padrão (V04, V05):** senha `lp` no Docker e segredo JWT derivado da senha do banco.
- **Sessões (V07, V08):** o state do login do Google valia como sessão, e trocar a senha não encerrava as sessões abertas.

Riscos ainda abertos (seção G): o rate limit fica em memória (não é compartilhado entre instâncias
da Vercel), o painel na Vercel ainda não tem CSP, e a posse de domínio personalizado não exige registro TXT.

## B. Vulnerabilidades

| Id | Gravidade | Status | Onde | Causa → impacto | Correção | Teste |
|---|---|---|---|---|---|---|
| V01 | Crítica | Corrigido (migration a aplicar) | Supabase: `lp_client_pages`, `lp_client_levels`, `schema_migrations` | Sem RLS e com INSERT/UPDATE/DELETE para `anon` na Data API (schema `public` exposto) → com a chave anon: dar a um cliente acesso a qualquer página, mudar preços, ou apagar `schema_migrations` e derrubar o sistema na inicialização seguinte | `database/migrations/029_lp_rls.sql` ativa RLS (como as demais tabelas). O app conecta como `postgres` (dono, `BYPASSRLS`): não é afetado | `api.test.ts` › Banco de dados |
| V02 | Alta | Corrigido | `lib/url.ts` | IPv6 mapeado (`[::ffff:127.0.0.1]` vira `::ffff:7f00:1`), NAT64, 6to4 e IPv4-compatível passavam pela checagem → acesso à rede interna/metadata via redirecionamento de site ou URL de imagem | `net.BlockList` com todas as faixas reservadas + conversão do IPv4 mapeado | `unit.test.ts` › SSRF (confirmado contra o código antigo) |
| V03 | Alta | Corrigido | `services/scraper/imageProbe.ts` | `fetch` seguia redirecionamentos automaticamente, sem checar o destino → imagem pública redireciona para `169.254.169.254` | `fetchPublic`: redirecionamento manual, host conferido a cada salto, no máximo 4 saltos | `unit.test.ts` › SSRF: redirecionamentos |
| V04 | Alta (VPS) | Corrigido | `docker-compose.yml` | `POSTGRES_PASSWORD` padrão `lp` | Variável obrigatória (`${VAR:?}`); porta do banco segue sem publicação | `docker compose config` sem a variável falha com mensagem clara |
| V05 | Alta (VPS sem `JWT_SECRET`) | Corrigido | `config/env.ts` | Sem `JWT_SECRET`, o segredo das sessões (e da criptografia das chaves salvas) vinha da `DATABASE_URL` | Em produção: obrigatório, com no mínimo 32 caracteres, e não pode ser o exemplo nem conter a senha do banco. API e função da Vercel param com mensagem clara | `unit.test.ts` › Configuração de produção; smoke test do `dist` e da função da Vercel |
| V06 | Média | Corrigido | `lib/safeFetch.ts`, coleta | DNS rebinding: o host era validado num `lookup` e o `fetch` resolvia de novo | Agente `undici` cujo `lookup` recusa IP interno no momento da conexão | `unit.test.ts` › DNS rebinding |
| V07 | Média | Corrigido | `routes/googleDrive.ts`, `middleware/auth.ts` | O `state` do OAuth (mesmo segredo, `sub` = usuário, vai na URL) era aceito como cookie de sessão por 10 min | Sessão exige `typ: session` (tokens antigos sem `typ` seguem válidos até expirar); tokens com `p` são recusados; algoritmo fixo HS256 | `unit.test.ts` › Sessão; `api.test.ts` › tokens |
| V08 | Média | Corrigido | `middleware/auth.ts`, `routes/auth.ts` | Trocar a senha (ou o admin redefinir) não encerrava sessões abertas (até 12 h) | Token leva `pv` (HMAC do hash da senha); senha mudou → sessão recusada. Quem troca a própria senha recebe um token novo. Sem migration | `api.test.ts` › troca/redefinição de senha |
| V09 | Média | Corrigido | `services/screenshot/ScreenshotService.ts` | O Chromium da imagem da página carregava qualquer URL de foto (inclusive `http://169.254.169.254`) | Interceptação: só endereços públicos, `data:` e o próprio sistema | `unit.test.ts` › navegador da imagem |
| V10 | Média | Corrigido | `routes/companies.ts` | `fetch-images` e `sources/refresh` (coleta + IA) sem limite | Mesmo limite da análise (60/h) | Revisão de código |
| V11 | Baixa | Corrigido | `routes/auth.ts` | Força bruta limitada só por IP | + limite por conta (20 falhas/15 min, só conta as falhas) | `api.test.ts` › limite de login |
| V12 | Baixa | Corrigido | `db/bootstrap.ts` | `ADMIN_PASSWORD` de exemplo criava a conta principal em produção | Valores de exemplo recusados em produção | Revisão de código |
| V13 | Baixa | Corrigido | `middleware/auth.ts` | CSRF: sem `Origin` não havia checagem; o esquema não era conferido | Usa o `Referer` quando não há `Origin`; em produção só HTTPS (localhost liberado). O `SameSite=Lax` já mitigava | `unit.test.ts` › CSRF; `api.test.ts` › CSRF |
| V14 | Baixa | Corrigido | `app.ts`, `routes/misc.ts` | Arquivos em `/uploads` sem `nosniff`/sandbox; envios sem limite (crescem `lp_uploads` no banco) | `nosniff` + `CSP: default-src 'none'; sandbox`; `dotfiles: deny`; 300 envios/h | `api.test.ts` › Uploads |
| V15 | Baixa | Corrigido (prevenção) | `landing/render.tsx` | Blocos `<style>` sem escape central (os validadores atuais já removem `<`; não reproduzido) | `styleText()` troca `<` por `\3c ` em todo `<style>` | `unit.test.ts` e `api.test.ts` › conteúdo malicioso |
| V16 | Baixa | Corrigido | `docker-compose.dev.yml` | Postgres de desenvolvimento (senha `lp`) publicado em todas as interfaces | Só `127.0.0.1` | — |
| V17 | Baixa | Corrigido | `package-lock.json` | `source-map-js` 1.2.1 (DoS; só no build) | 1.2.2 via `npm audit fix` (sem `--force`) | `npm audit`: 0 vulnerabilidades |
| V18 | Baixa | Pendente | `scripts/vercel-build.mjs` | Painel estático na Vercel sem cabeçalhos de segurança | `nosniff`, `X-Frame-Options`, `Referrer-Policy` adicionados. CSP não aplicada: precisa validar a prévia do editor (efeitos de texto e imagens `http:`) | — |

**Limite de upload:** 2 MB (o README citava 5 MB). Foi reduzido a pedido no commit `251016e`, junto com a compactação no navegador; esta auditoria manteve os 2 MB.

**Verificado e sem falha:** isolamento entre organizações em todas as rotas (inclusive jobs,
prévia, exportação, versões e acesso de cliente); SQL parametrizado; escape de texto e atributos
(React 19 + `safeHref`); certificado do Caddy só para domínio verificado de página ativa; domínio
de outra página não pode ser tomado (índice único); Host de domínio personalizado não alcança a API
nem o painel; validação binária dos uploads; nenhum segredo real no histórico do Git (11 padrões em
todos os commits); senhas com bcrypt custo 12 e mensagem de login idêntica para conta inexistente.

## C. Arquivos modificados

| Arquivo | Motivo |
|---|---|
| `apps/api/src/lib/url.ts` | V02: faixas bloqueadas completas, IPv6 mapeado |
| `apps/api/src/lib/safeFetch.ts` (novo) | V03/V06: `fetchPublic` e agente que só conecta em IP público |
| `apps/api/src/services/scraper/ScraperService.ts`, `imageProbe.ts` | V03/V06: passam a usar o agente seguro |
| `apps/api/src/services/screenshot/ScreenshotService.ts` | V09 |
| `apps/api/src/config/env.ts` | V05 |
| `apps/api/src/middleware/auth.ts` | V07, V08, V13 |
| `apps/api/src/routes/auth.ts` | V08 (novo token ao trocar a senha), V11 |
| `apps/api/src/routes/googleDrive.ts` | V07: `typ` e algoritmo fixo no state |
| `apps/api/src/db/bootstrap.ts` | V12 |
| `apps/api/src/app.ts`, `routes/misc.ts` | V14 |
| `apps/api/src/routes/companies.ts` | V10 |
| `apps/api/src/landing/render.tsx` | V15 |
| `database/migrations/029_lp_rls.sql` (novo) | V01 |
| `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example` | V04, V16, documentação das variáveis |
| `scripts/vercel-build.mjs` | V18 (parcial) |
| `apps/api/package.json`, `package.json`, `package-lock.json` | `undici` explícito (já instalado como dependência do cheerio, mesma versão 7.x), script `test`, V17 |
| `apps/api/test/*` (novo) | Testes |

## D. Testes

```bash
# Postgres descartável (sem volume) só para os testes; o banco precisa terminar em _test
docker run -d --rm --name lp-sec-test -e POSTGRES_USER=lp -e POSTGRES_PASSWORD=lptest \
  -e POSTGRES_DB=lp_test -p 127.0.0.1:54399:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
npm test                      # 107 testes (TEST_DATABASE_URL troca o banco)
docker stop lp-sec-test
```

| Comando | Resultado |
|---|---|
| `npm test` (unit + integração com banco real) | 107 executados, 107 aprovados |
| `npm run typecheck` (api + web) | sem erros |
| `npm run build` e `node scripts/vercel-build.mjs` | concluídos |
| `dist/index.js` em `NODE_ENV=production` sem / com `JWT_SECRET` | para com mensagem clara / sobe, login com cookie `Secure` |
| Função da Vercel empacotada sem / com `JWT_SECRET` | 503 "Configuração pendente" / `/api/health` e `/lp/:slug` 200 |
| Coleta real de site público (example.com) e imagem com redirecionamento | funcionando |
| 29 migrations num Postgres 16 vazio | aplicadas |
| `npm audit` | 0 vulnerabilidades |

O projeto não tinha testes antes; não há suíte anterior para comparar.

## E. Compatibilidade

Testado: login/logout/sessão/troca de senha, papéis (dono, admin, vendedor, cliente), isolamento
A×B, edição, versões e restauração, publicar/despublicar, exportação, prévia, slug e domínio,
uploads no modo banco, página pública com CSP, jobs (consulta e cancelamento), build Docker/Vercel.

**Não testado** (pendente de validação manual):
- Fluxos no navegador (telas, editor, prévia) — nenhuma tela foi alterada.
- Provedores de IA com chave real (análise e geração completas). A camada de IA não foi alterada.
- Uploads em `local` (disco) e Vercel Blob. O código de gravação não mudou; só os cabeçalhos ao servir.
- Imagem da página (Chromium) após a interceptação.
- Stack Docker completa com Caddy e TLS on-demand; só `docker compose config` foi validado.
- Google Drive (OAuth): o state mudou de formato. Um login do Google iniciado antes do deploy e concluído depois continua funcionando.

## F. Implantação

**Vercel (produção atual)** — `JWT_SECRET` já existe em Production.
1. Antes do deploy, confirme que o `JWT_SECRET` tem 32+ caracteres e **não contém a senha do banco**. Se contiver, a função passa a responder "Configuração pendente". Trocá-lo exige recadastrar as chaves de IA salvas e reconectar o Google Drive.
2. Merge da branch e deploy. A migration 029 roda sozinha na primeira requisição.
3. **Urgente, se o deploy demorar:** rode o conteúdo de `029_lp_rls.sql` no SQL Editor do Supabase. É idempotente, e a migration continua sendo registrada no deploy.
4. Depois do deploy: `GET /api/health` (versão = commit), login, abrir uma página, prévia no editor, enviar uma imagem. Sessões abertas antes do deploy continuam válidas até expirar (até 12 h).

**VPS (docker compose)**
1. No `.env`: `POSTGRES_PASSWORD` e `JWT_SECRET` agora são obrigatórios.
2. Instalação que já rodava **sem** `JWT_SECRET`: para não perder as chaves de IA criptografadas nem o Drive, defina o valor que era usado antes:
   `node -e "console.log(require('crypto').createHash('sha256').update('lp-jwt:'+process.argv[1]).digest('hex'))" 'postgres://lp:SENHA@db:5432/lp'`
   (use a `DATABASE_URL` exata do container). Depois, se quiser um segredo novo, troque-o e recadastre as chaves.
3. Instalação que usava a senha padrão `lp`: defina `POSTGRES_PASSWORD=lp` para subir sem interrupção e troque a senha assim:
   ```bash
   docker compose exec db psql -U lp -d lp -c "alter user lp with password 'NOVA_SENHA_FORTE'"
   # .env: POSTGRES_PASSWORD=NOVA_SENHA_FORTE  (e o JWT_SECRET do passo 2, se ele vier da URL antiga)
   docker compose up -d app        # recria a API com a nova DATABASE_URL; o volume pgdata é mantido
   ```
   O Postgres só aplica `POSTGRES_PASSWORD` ao criar o volume. Mudar a variável sozinha não troca a senha.
4. Em produção, o painel precisa ser acessado por HTTPS (o Caddy já redireciona). Escritas vindas de `http://` são recusadas, exceto em localhost.

## G. Riscos residuais

| Risco | Motivo | Ação sugerida |
|---|---|---|
| Rate limit em memória | Na Vercel, cada instância conta separado, então os limites valem por instância | Usar um store compartilhado (ex.: tabela no Postgres com `express-rate-limit`), sem serviço novo |
| CSP do painel na Vercel (V18) | A prévia do editor (iframe `srcdoc`) herda a CSP; sem validação no navegador, pode desligar os efeitos de texto e imagens `http:` | Aplicar `ADMIN_CSP` + hash do script de animação e validar o editor |
| Posse de domínio personalizado | A verificação confere só o DNS apontando para o servidor; em multi-organização, uma org pode reivindicar um domínio de cliente de outra antes dela | Registro TXT de verificação (mudança de produto) |
| Chromium e DNS rebinding | O Chromium resolve o DNS sozinho depois da checagem | Baixo impacto: a resposta só vira pixels na imagem |
| HSTS com `includeSubDomains` nas respostas da API | Vale para os subdomínios do domínio do sistema na VPS | Revisar se houver subdomínios sem HTTPS |
| Chave `anon` do Supabase | Outras tabelas do banco compartilhado não foram auditadas (são de outro sistema) | Revisar RLS do outro sistema |
| Tabelas novas do lp | O padrão do Supabase libera `anon` | Toda migration nova: `enable row level security` |
