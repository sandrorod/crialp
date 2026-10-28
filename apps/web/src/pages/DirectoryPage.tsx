import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, Building2, CheckCircle2, ExternalLink, Link2, ListPlus, Loader2, PanelsTopLeft, Play, Repeat, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, PageHeader, Select } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { saveBatch } from '@/lib/lpBatch';
import { cn } from '@/lib/utils';
import { directoryService, type DirectorySource } from '@/services';
import type { DirectoryItem } from '@/types';

/** Só entra no lote quem ainda não foi cadastrado (os demais têm "Abrir LP" / "Abrir empresa"). */
const canBatch = (c: DirectoryItem) => !c.existing;
const label = (c: DirectoryItem) => c.name || decodeURIComponent(c.url.split('/').pop() ?? c.url);

/** Fila de links do DentMap (páginas das listas), guardada neste navegador. */
const QUEUE_KEY = 'lp:dentmap-links';
function loadQueue(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveQueue(links: string[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(links));
  } catch {
    /* sem armazenamento: a fila vale só nesta tela */
  }
}
/** "sao-paulo — página 3" */
function linkLabel(link: string) {
  try {
    const u = new URL(link);
    const n = u.searchParams.get('pagina') ?? '1';
    return `${decodeURIComponent(u.pathname.replace(/\/$/, '').split('/').pop() ?? u.pathname)} — página ${n}`;
  } catch {
    return link;
  }
}

/** Textos de cada diretório de profissionais. */
const SOURCES: Record<
  DirectorySource,
  { title: string; description: string; placeholder: string; site: string; search: string; found: string; empty: string }
> = {
  dentmap: {
    title: 'DentMap',
    description: 'Cole o link de uma página do DentMap. Os dentistas que aparecem nela são listados e cada um vira uma Landing Page.',
    placeholder: 'https://dentmap.com.br/dentistas/sao-paulo',
    site: 'DentMap',
    search: 'Buscar dentistas',
    found: 'dentista(s) encontrado(s)',
    empty: 'Nenhum perfil de dentista encontrado nesta página.',
  },
  doctoralia: {
    title: 'Doctoralia',
    description: 'Cole o link de uma página do Doctoralia. Os profissionais e clínicas que aparecem nela são listados e cada um vira uma Landing Page.',
    placeholder: 'https://www.doctoralia.com.br/dentista/sao-paulo',
    site: 'Doctoralia',
    search: 'Buscar perfis',
    found: 'perfil(is) encontrado(s)',
    empty: 'Nenhum perfil de profissional ou clínica encontrado nesta página.',
  },
};

/**
 * DentMap / Doctoralia: cole o link de uma página do diretório (ex.: dentistas de uma cidade). O sistema lista os
 * perfis que aparecem nela e gera a LP de cada um com os dados do perfil (mesma análise de link e mesmo lote
 * de "Buscar empresas").
 */
export function DirectoryPage({ source }: { source: DirectorySource }) {
  const src = SOURCES[source];
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [items, setItems] = useState<DirectoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowImages, setAllowImages] = useState(true);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) void loadItems(url.trim());
  };

  const loadItems = async (link: string) => {
    setLoading(true);
    try {
      const r = await directoryService.links(source, link);
      setItems(r.items);
      setSelected(new Set(r.items.filter(canBatch).map((c) => c.url)));
      if (!r.items.length) toast.info(src.empty);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (c: DirectoryItem, v: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (v) next.add(c.url);
      else next.delete(c.url);
      return next;
    });
  const chosen = (items ?? []).filter((c) => canBatch(c) && selected.has(c.url));
  const selectable = (items ?? []).filter(canBatch);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.url));

  const generate = (c: DirectoryItem) => navigate(`/nova?url=${encodeURIComponent(c.url)}&fotos=${allowImages ? 1 : 0}`);

  /** Gera os selecionados um de cada vez: a tela "Nova Landing Page" passa para o próximo ao terminar cada um. */
  const generateBatch = () => {
    if (!chosen.length) return;
    saveBatch({ items: chosen.map((c) => ({ url: c.url, name: label(c) })), index: 0, fotos: allowImages, ok: 0 });
    navigate('/nova?lote=1');
  };

  return (
    <div>
      <PageHeader title={src.title} description={src.description} />
      <Card className="mb-6 p-4 sm:p-5">
        {source === 'dentmap' ? (
          <DentmapQueue placeholder={src.placeholder} allowImages={allowImages} setAllowImages={setAllowImages} onView={(link) => void loadItems(link)} />
        ) : (
          <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input className="h-11 pl-10" placeholder={src.placeholder} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoFocus />
            </div>
            <Button type="submit" size="lg" loading={loading}>
              {src.search}
            </Button>
          </form>
        )}
        {source !== 'dentmap' ? (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
            <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
            <span>
              Usar as fotos do perfil nas páginas geradas
              <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
            </span>
          </label>
        ) : null}
      </Card>

      {loading ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
          <Loader2 className="size-5 flex-none animate-spin text-brand-600" />
          Lendo a página do {src.site}…
        </Card>
      ) : items?.length ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-zinc-600">
              {items.length} {src.found} · {chosen.length} selecionado(s)
            </span>
            {selectable.length ? (
              <button
                type="button"
                onClick={() => setSelected(allSelected ? new Set() : new Set(selectable.map((c) => c.url)))}
                className="text-xs text-zinc-500 underline hover:text-zinc-800"
              >
                {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
              </button>
            ) : null}
            <Button size="sm" variant="brand" className="ml-auto" disabled={!chosen.length} onClick={generateBatch} icon={<Sparkles className="size-3.5" />}>
              Gerar {chosen.length} LP
            </Button>
          </div>
          <Card className="divide-y divide-zinc-100">
            {items.map((c) => {
              const lp = c.existing?.landing_page;
              return (
                <div key={c.url} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {canBatch(c) ? (
                    <input
                      type="checkbox"
                      className="size-4 flex-none accent-zinc-900"
                      checked={selected.has(c.url)}
                      onChange={(e) => toggle(c, e.target.checked)}
                      aria-label={`Selecionar ${label(c)}`}
                    />
                  ) : (
                    <span className="size-4 flex-none" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{label(c)}</p>
                    <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-zinc-500 hover:underline">
                      {c.url}
                    </a>
                    {c.existing ? (
                      <p className={cn('mt-1 flex items-center gap-1.5 text-xs font-medium', lp ? 'text-emerald-700' : 'text-amber-700')}>
                        {lp ? <CheckCircle2 className="size-3.5" /> : <Building2 className="size-3.5" />}
                        {lp ? `LP já gerada (${lp.status === 'ativa' ? 'publicada' : 'inativa'})` : 'Já cadastrada, ainda sem LP'}
                      </p>
                    ) : c.analysis_error ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700">
                        <AlertTriangle className="size-3.5" /> {c.analysis_error.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />}>
                        Ver no {src.site}
                      </Button>
                    </a>
                    {lp ? (
                      <Link to={`/landing-pages/${lp.id}`}>
                        <Button size="sm" variant="brand" icon={<PanelsTopLeft className="size-3.5" />}>
                          Abrir LP
                        </Button>
                      </Link>
                    ) : c.existing ? (
                      <Link to={`/empresas/${c.existing.id}`}>
                        <Button size="sm" variant="brand" icon={<Building2 className="size-3.5" />}>
                          Abrir empresa
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" variant="brand" onClick={() => generate(c)} icon={<Sparkles className="size-3.5" />}>
                        Gerar LP
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      ) : null}
    </div>
  );
}

/**
 * DentMap: fila de links. "Adicionar" descobre todas as páginas da lista (?pagina=2…) e põe cada uma no seletor.
 * "Iniciar" gera as LPs do link escolhido (só de quem ainda não tem LP) e, no fim do lote, tira o link da fila;
 * "Automático" faz o mesmo e segue para o próximo link da fila.
 */
function DentmapQueue({
  placeholder,
  allowImages,
  setAllowImages,
  onView,
}: {
  placeholder: string;
  allowImages: boolean;
  setAllowImages: (v: boolean) => void;
  onView: (link: string) => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [links, setLinksState] = useState<string[]>(loadQueue);
  const [current, setCurrent] = useState(() => loadQueue()[0] ?? '');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState<'one' | 'auto' | null>(null);
  const setLinks = (next: string[]) => {
    saveQueue(next);
    setLinksState(next);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      const { pages } = await directoryService.pages('dentmap', url.trim());
      const fresh = pages.filter((p) => !links.includes(p));
      setLinks([...links, ...fresh]);
      if (fresh.length) setCurrent(fresh[0]);
      setUrl('');
      toast.success(
        fresh.length
          ? `${fresh.length} página(s) adicionada(s) à lista${fresh.length < pages.length ? ` (${pages.length - fresh.length} já estavam nela)` : ''}.`
          : 'Todas as páginas deste link já estavam na lista.',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  /** Gera as LPs do link (só quem ainda não tem LP); sem nenhuma a gerar, tira o link e (automático) segue. */
  const start = async (link: string, auto: boolean, queue = links, fotos = allowImages) => {
    if (!link) return;
    setStarting(auto ? 'auto' : 'one');
    try {
      const { items } = await directoryService.links('dentmap', link);
      const pending = items.filter((c) => !c.existing?.landing_page);
      if (!pending.length) {
        const i = queue.indexOf(link);
        const rest = queue.filter((l) => l !== link);
        setLinks(rest);
        toast.info(`${linkLabel(link)}: todos já têm LP. Link removido da lista.`);
        const next = rest[i];
        setCurrent(next ?? rest[0] ?? '');
        if (auto && next) return start(next, true, rest, fotos);
        return;
      }
      saveBatch({
        items: pending.map((c) => ({ url: c.url, name: label(c), ...(c.existing ? { companyId: c.existing.id } : {}) })),
        index: 0,
        fotos,
        ok: 0,
        back: `/dentmap?concluido=${encodeURIComponent(link)}&fotos=${fotos ? 1 : 0}${auto ? '&auto=1' : ''}`,
      });
      navigate('/nova?lote=1');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(null);
    }
  };

  // Volta do lote terminado: tira o link da fila e, no automático, começa o próximo
  const handled = useRef(false);
  useEffect(() => {
    const done = params.get('concluido');
    if (!done || handled.current) return;
    handled.current = true;
    const auto = params.get('auto') === '1';
    const fotos = params.get('fotos') !== '0';
    setAllowImages(fotos);
    setParams({}, { replace: true });
    const queue = loadQueue();
    const i = queue.indexOf(done);
    const rest = queue.filter((l) => l !== done);
    setLinks(rest);
    const next = i >= 0 ? rest[i] : undefined;
    setCurrent(next ?? rest[0] ?? '');
    if (auto && next) {
      toast.info(`Automático: começando ${linkLabel(next)}.`);
      void start(next, true, rest, fotos);
    } else if (auto) toast.success('Automático: todos os links da lista foram concluídos.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input className="h-11 pl-10" placeholder={placeholder} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoFocus />
        </div>
        <Button type="submit" size="lg" loading={adding} icon={<ListPlus className="size-4" />}>
          Adicionar à lista
        </Button>
      </form>
      {adding ? <p className="mt-2 text-xs text-zinc-500">Procurando todas as páginas da lista… pode levar alguns segundos.</p> : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Select value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Link da lista" className="h-11 flex-1" disabled={!links.length}>
          {!links.length ? <option value="">Lista vazia: adicione um link acima</option> : null}
          {links.map((l) => (
            <option key={l} value={l}>
              {linkLabel(l)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button
            size="lg"
            variant="brand"
            disabled={!current || !!starting}
            loading={starting === 'one'}
            onClick={() => void start(current, false)}
            icon={<Play className="size-4" />}
          >
            Iniciar
          </Button>
          <Button
            size="lg"
            variant="secondary"
            disabled={!current || !!starting}
            loading={starting === 'auto'}
            onClick={() => void start(current, true)}
            icon={<Repeat className="size-4" />}
            title="Gera este link e, ao terminar, segue para o próximo da lista"
          >
            Automático
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>{links.length} link(s) na lista · só entram dentistas que ainda não têm LP</span>
        {current ? (
          <button type="button" onClick={() => onView(current)} className="underline hover:text-zinc-800">
            Ver dentistas deste link
          </button>
        ) : null}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
        <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
        <span>
          Usar as fotos do perfil nas páginas geradas
          <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
        </span>
      </label>
    </>
  );
}
