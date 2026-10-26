# Evolution API com GIF de verdade (gifPlayback)

A Evolution API 2.3.7 força `gifPlayback: false` em todo vídeo enviado, então não dá para mandar GIF
como o WhatsApp do celular manda (vídeo MP4 marcado como GIF, que toca sozinho em loop, no formato
original). Este ajuste libera o campo `gifPlayback` em `POST /message/sendMedia` (só tem efeito com
`"mediatype": "video"`). Todo o resto da Evolution continua igual.

## O ajuste (3 pontos, ver `gifPlayback.patch`)

1. `src/api/dto/sendMessage.dto.ts`: campo `gifPlayback?: boolean` em `MediaMessage` e `SendMediaDto`.
2. `src/validate/message.schema.ts`: `gifPlayback: { type: 'boolean' }` em `mediaMessageSchema`.
3. `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`, em `prepareMediaMessage`:
   `prepareMedia[mediaType].gifPlayback = false;` vira
   `prepareMedia[mediaType].gifPlayback = mediaMessage.gifPlayback === true;`

## Publicar no Easypanel

1. No GitHub, faça um **fork** de https://github.com/EvolutionAPI/evolution-api e, no fork, crie um branch
   a partir da tag **2.3.7** (a versão que vocês usam hoje).
2. Aplique as 3 mudanças acima (pelo editor do GitHub mesmo) e faça o commit.
3. No Easypanel, no serviço da Evolution: **Source → GitHub**, escolha o fork e o branch, **Build: Dockerfile**
   (o `Dockerfile` da raiz do repositório). Mantenha as mesmas variáveis de ambiente e o mesmo volume/banco.
4. **Deploy**. A instância e a sessão do WhatsApp continuam (ficam no banco/volume da Evolution).
5. No CRM: **Conexão → "A Evolution envia GIF de verdade"** → ligar.

Para voltar atrás: no Easypanel, troque a fonte de volta para a imagem oficial (`evoapicloud/evolution-api:v2.3.7`)
e desligue a opção no CRM (os GIFs voltam a ir como figurinha).
