import { EventEmitter } from 'node:events';

/**
 * Aviso em tempo real para as telas do CRM abertas: "mudou alguma coisa no WhatsApp desta organização".
 * A tela, ao receber, busca de novo a lista e a conversa aberta pelas rotas normais (que já aplicam quem pode ver o quê),
 * então o aviso não leva dado nenhum. Fica na memória do processo: o app roda em um só container (Easypanel).
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function notifyCrm(orgId: string) {
  bus.emit(orgId);
}

export function onCrmChange(orgId: string, listener: () => void) {
  bus.on(orgId, listener);
  return () => {
    bus.off(orgId, listener);
  };
}
