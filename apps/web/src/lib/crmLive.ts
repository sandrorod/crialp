/**
 * Avisos em tempo real do CRM (Server-Sent Events em /api/crm/events): uma conexão só por aba, compartilhada
 * pela lista de conversas e pela conversa aberta. Cada aviso só diz "mudou"; quem escuta busca de novo os dados.
 * Se a conexão cair, o navegador religa sozinho; enquanto isso as consultas periódicas continuam valendo.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  // Vários avisos seguidos (ex.: mensagem + status de entrega) viram uma busca só
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    for (const l of listeners) l();
  }, 250);
}

export function subscribeCrmLive(listener: Listener) {
  listeners.add(listener);
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/crm/events', { withCredentials: true });
    source.onmessage = emit;
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && source) {
      source.close();
      source = null;
    }
  };
}
