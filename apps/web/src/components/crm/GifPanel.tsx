import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crmService, type CrmGif, type CrmSavedGif } from '@/services/crm';

const RECENT_KEY = 'crm:gifs-recentes';
const RECENT_MAX = 24;

function loadRecent(): CrmGif[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(g: CrmGif) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([g, ...loadRecent().filter((x) => x.id !== g.id)].slice(0, RECENT_MAX)));
  } catch {
    /* sem armazenamento: só não lembra os recentes */
  }
}

/**
 * Galeria de GIFs como a do teclado do celular: "Recentes" (deste navegador), "Em alta" e busca.
 * Clicar envia na hora. Os GIFs vêm do GIPHY pelo servidor (a chave fica lá).
 */
export function GifPanel({ onPick, onPickSaved, sending }: { onPick: (gif: CrmGif) => void; onPickSaved: (saved: CrmSavedGif) => void; sending: boolean }) {
  const [tab, setTab] = useState<'alta' | 'recentes' | 'salvos'>(() => (loadRecent().length ? 'recentes' : 'alta'));
  // GIFs salvos do próprio usuário (de mensagens recebidas ou enviadas: menu da mensagem → "Salvar GIF")
  const [saved, setSaved] = useState<CrmSavedGif[] | null>(null);
  useEffect(() => {
    if (tab !== 'salvos' || saved) return;
    crmService
      .savedGifs()
      .then(setSaved)
      .catch((err) => setError(errorMessage(err)));
  }, [tab, saved]);
  const removeSaved = async (g: CrmSavedGif) => {
    try {
      await crmService.removeSavedGif(g.id);
      setSaved((list) => list?.filter((x) => x.id !== g.id) ?? list);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<CrmGif[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recent = loadRecent();
  const box = useRef<HTMLDivElement>(null);
  // Abre já com o cursor na busca, como no celular
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => search.current?.focus(), []);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Busca (ou em alta) do zero quando o termo muda
  useEffect(() => {
    if ((tab === 'recentes' || tab === 'salvos') && !term) return;
    let alive = true;
    setLoading(true);
    setError(null);
    crmService
      .gifs(term)
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setNext(r.next_offset);
        box.current?.scrollTo({ top: 0 });
      })
      .catch((err) => alive && setError(errorMessage(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [term, tab]);

  const more = async () => {
    if (next === null || loading) return;
    setLoading(true);
    try {
      const r = await crmService.gifs(term, next);
      setItems((cur) => [...cur, ...r.items.filter((g) => !cur.some((c) => c.id === g.id))]);
      setNext(r.next_offset);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const showing = tab === 'recentes' && !term ? recent : items;
  const pick = (g: CrmGif) => {
    if (sending) return;
    saveRecent(g);
    onPick(g);
  };

  return (
    <div className="flex h-[400px] w-[340px] max-w-[calc(100vw-24px)] flex-col bg-white">
      <div className="space-y-2 border-b border-zinc-100 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            ref={search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar GIF"
            aria-label="Pesquisar GIF"
            className="h-9 w-full rounded-lg border border-zinc-200 pl-8 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        {!term ? (
          <div className="flex gap-1" role="tablist">
            {(
              [
                ['recentes', 'Recentes'],
                ['salvos', 'Salvos'],
                ['alta', 'Em alta'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  tab === k ? 'bg-emerald-100 text-emerald-800' : 'text-zinc-500 hover:bg-zinc-100 hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        ref={box}
        className="min-h-0 flex-1 overflow-y-auto p-1.5"
        onScroll={(e) => {
          const el = e.currentTarget;
          if ((tab !== 'recentes' && tab !== 'salvos') || term) if (el.scrollTop + el.clientHeight > el.scrollHeight - 120) void more();
        }}
      >
        {error ? (
          <p className="p-4 text-center text-sm text-red-600">{error}</p>
        ) : tab === 'salvos' && !term ? (
          !saved ? (
            <div className="grid place-items-center p-6">
              <Spinner />
            </div>
          ) : !saved.length ? (
            <p className="p-6 text-center text-sm text-zinc-500">Nenhum GIF salvo. Na conversa, abra o menu de um GIF (⌄) e escolha “Salvar GIF”.</p>
          ) : (
            <div className="columns-2 gap-1.5">
              {saved.map((g) => (
                <div key={g.id} className="group relative mb-1.5">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => onPickSaved(g)}
                    title="Enviar GIF salvo"
                    className="block w-full overflow-hidden rounded-md bg-zinc-100 transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50"
                  >
                    {g.mime === 'video/mp4' ? (
                      <video src={crmService.savedGifUrl(g.id)} autoPlay loop muted playsInline className="block w-full" />
                    ) : (
                      <img src={crmService.savedGifUrl(g.id)} alt="GIF salvo" loading="lazy" className="block w-full" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSaved(g)}
                    title="Tirar dos salvos"
                    aria-label="Tirar dos salvos"
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : !showing.length && !loading ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            {tab === 'recentes' && !term ? 'Os GIFs que você enviar aparecem aqui.' : 'Nenhum GIF encontrado.'}
          </p>
        ) : (
          // Duas colunas (como no celular), cada GIF na proporção dele
          <div className="columns-2 gap-1.5">
            {showing.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={sending}
                onClick={() => pick(g)}
                title={g.title ? `Enviar: ${g.title}` : 'Enviar GIF'}
                className="mb-1.5 block w-full overflow-hidden rounded-md bg-zinc-100 transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-50"
                style={{ aspectRatio: `${g.width} / ${g.height}` }}
              >
                <img src={g.preview} alt={g.title || 'GIF'} loading="lazy" className="size-full object-cover" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        )}
        {/* Carregando da busca/"Em alta" (não da lista de salvos, que tem o próprio indicador) */}
        {loading && !(tab === 'salvos' && !term) ? (
          <div className="grid place-items-center p-3">
            <Spinner />
          </div>
        ) : null}
      </div>
      {/* Atribuição pedida pelo GIPHY */}
      <div className="border-t border-zinc-100 px-2.5 py-1 text-right text-[10px] font-semibold tracking-wide text-zinc-400">POWERED BY GIPHY</div>
    </div>
  );
}
