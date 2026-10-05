import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ExternalLink, Globe, History, Loader2, MapPin, PanelsTopLeft, Phone, Search, Sparkles, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ErrorBlock, Input, PageHeader } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { searchService } from '@/services';
import type { FoundCompany, SavedSearchItem, SiteFilter } from '@/types';


// A última pesquisa continua na tela ao voltar de outra página
const STORE_KEY = 'lp:company-search';
type Saved = { q: string; items: FoundCompany[]; center: { lat: number; lng: number } | null; page: number; hasMore: boolean; searchId?: string | null; filter?: SiteFilter };
function loadSaved(): Saved | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function store(next: Saved) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* sem armazenamento: só não lembra a pesquisa */
  }
}

type Near = { lat: number; lng: number } | null;

const FILTERS: { value: SiteFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'com_site', label: 'Com site' },
  { value: 'sem_site', label: 'Sem site' },
];

/** Instagram, Facebook, WhatsApp e agregadores de links não contam como site próprio (igual ao servidor). */
const NOT_A_SITE = /(^|\.)(instagram\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|linkr\.bio|beacons\.ai|bio\.link)$/i;
function hasOwnSite(c: FoundCompany) {
  if (!c.website) return false;
  try {
    return !NOT_A_SITE.test(new URL(c.website).hostname);
  } catch {
    return false;
  }
}
const matchesFilter = (c: FoundCompany, f: SiteFilter) => (f === 'todos' ? true : f === 'com_site' ? hasOwnSite(c) : !hasOwnSite(c));

const MATCH_REASON = { link: 'mesmo link', site: 'mesmo site e nome/telefone', nome_telefone: 'mesmo nome e telefone', nome_cep: 'mesmo nome e CEP' } as const;

function ResultCard({ c, onGenerate }: { c: FoundCompany; onGenerate: () => void }) {
  const lp = c.existing?.landing_page;
  return (
    <Card className={cn('relative flex flex-col p-4', lp ? 'border-2 border-emerald-500 bg-emerald-50/40' : c.existing ? 'border-2 border-amber-400' : '')}>
      {/* Selo bem visível: já foi coletada / já tem LP, para não gerar de novo */}
      {c.existing ? (
        <span className={cn('absolute -top-2.5 right-3 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm', lp ? 'bg-emerald-600' : 'bg-amber-500')}>
          {lp ? <CheckCircle2 className="size-3.5" /> : <Building2 className="size-3.5" />}
          {lp ? 'LP já gerada' : 'Já coletada'}
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <div className="grid size-9 flex-none place-items-center rounded-lg bg-zinc-100 text-zinc-500">
          {c.source === 'maps' ? <MapPin className="size-4" /> : <Building2 className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{c.name}</h3>
          {c.rating != null ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
              <Star className="size-3 fill-amber-400 text-amber-400" /> {c.rating.toFixed(1)}{c.reviews != null ? ` (${c.reviews} avaliações)` : ''}
            </p>
          ) : null}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center gap-2 text-zinc-700">
          <Phone className="size-3.5 flex-none text-zinc-400" />
          {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{c.phone}</a> : <span className="text-zinc-400">Telefone não informado</span>}
        </li>
        <li className="flex min-w-0 items-center gap-2">
          <Globe className="size-3.5 flex-none text-zinc-400" />
          {c.website ? (
            <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 text-brand-600 hover:underline">
              <span className="truncate">{c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span> <ExternalLink className="size-3 flex-none" />
            </a>
          ) : <span className="text-zinc-400">Sem site</span>}
        </li>
        {c.address ? (
          <li className="flex items-start gap-2 text-zinc-600"><MapPin className="mt-0.5 size-3.5 flex-none text-zinc-400" /> {c.address}</li>
        ) : null}
      </ul>
      {c.description ? <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{c.description}</p> : null}
      {c.existing ? (
        <div className={cn('mt-3 rounded-lg px-2.5 py-1.5 text-xs', lp ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-900')}>
          <p className="flex items-center gap-1.5 font-semibold">
            {lp ? <CheckCircle2 className="size-3.5 flex-none" /> : <Building2 className="size-3.5 flex-none" />}
            {lp ? `LP já gerada (${lp.status === 'ativa' ? 'publicada' : 'inativa'})` : 'Dados já coletados, ainda sem LP'}
          </p>
          <p className="mt-0.5 opacity-80">Cadastrada como “{c.existing.name}” · {MATCH_REASON[c.existing.reason]}</p>
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4">
        {c.google_url ? (
          <a href={c.google_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary" icon={<ExternalLink className="size-3.5" />}>Ver no Google</Button>
          </a>
        ) : null}
        {/* Evita gerar de novo: com LP, abre a LP; empresa cadastrada sem LP, abre a empresa (lá tem "Gerar") */}
        {c.existing?.landing_page ? (
          <Link to={`/landing-pages/${c.existing.landing_page.id}`}>
            <Button size="sm" variant="brand" icon={<PanelsTopLeft className="size-3.5" />}>Abrir LP</Button>
          </Link>
        ) : c.existing ? (
          <Link to={`/empresas/${c.existing.id}`}>
            <Button size="sm" variant="brand" icon={<Building2 className="size-3.5" />}>Abrir empresa</Button>
          </Link>
        ) : (
          <Button size="sm" variant="brand" disabled={!c.url} onClick={onGenerate} icon={<Sparkles className="size-3.5" />}>Gerar LP</Button>
        )}
      </div>
    </Card>
  );
}

export function SearchCompaniesPage() {
  const navigate = useNavigate();
  const saved = loadSaved();
  const [q, setQ] = useState(saved?.q ?? '');
  const [items, setItems] = useState<FoundCompany[] | null>(saved?.items ?? null);
  const [center, setCenter] = useState<Near>(saved?.center ?? null);
  const [page, setPage] = useState(saved?.page ?? 0);
  const [hasMore, setHasMore] = useState(saved?.hasMore ?? false);
  const [lastQ, setLastQ] = useState(saved?.q ?? '');
  const [filter, setFilter] = useState<SiteFilter>(saved?.filter ?? 'todos');
  const [loading, setLoading] = useState<'new' | 'more' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [allowImages, setAllowImages] = useState(true);
  // Pesquisa salva no histórico que está na tela
  const [searchId, setSearchId] = useState<string | null>(saved?.searchId ?? null);
  const history = useAsync(() => searchService.history(), []);
  const [opening, setOpening] = useState<string | null>(null);
  // No celular o histórico começa recolhido (no computador fica sempre aberto)
  const [historyOpen, setHistoryOpen] = useState(false);
  // Computador: histórico sempre aberto na lateral; celular/tablet: recolhido até tocar no título
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const showHistory = isDesktop || historyOpen;

  /** Abre uma pesquisa do histórico: resultados salvos, com a marcação atual de cadastrada / LP gerada. */
  const openSaved = async (id: string, quiet = false) => {
    setOpening(id);
    setError(null);
    try {
      const r = await searchService.saved(id);
      const c = r.center ? { lat: r.center.latitude, lng: r.center.longitude } : null;
      setQ(r.query);
      setLastQ(r.query);
      setItems(r.results);
      setCenter(c);
      setPage(r.page);
      setHasMore(r.has_more);
      setWarning(null);
      setSearchId(r.id);
      store({ q: r.query, items: r.results, center: c, page: r.page, hasMore: r.has_more, searchId: r.id, filter });
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  // Ao voltar para a tela (ex.: depois de gerar uma LP), recarrega a pesquisa para atualizar "LP já gerada"
  useEffect(() => {
    if (saved?.searchId) void openSaved(saved.searchId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeSaved = async (h: SavedSearchItem) => {
    if (!window.confirm(`Apagar a pesquisa "${h.query}" do histórico?`)) return;
    try {
      await searchService.removeSaved(h.id);
      if (h.id === searchId) setSearchId(null);
      void history.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const fetchPage = async (term: string, at: Near, p: number, prev: FoundCompany[], sid: string | null) => {
    setLoading(p === 0 ? 'new' : 'more');
    setError(null);
    try {
      const r = await searchService.places(term, at, p, sid, filter);
      // Sem repetir locais já mostrados
      const known = new Set(prev.map((c) => c.url));
      const merged = [...prev, ...r.items.filter((c) => !known.has(c.url))];
      const nextCenter = r.center ? { lat: r.center.latitude, lng: r.center.longitude } : at;
      setItems(merged);
      setCenter(nextCenter);
      setPage(p);
      setHasMore(r.has_more);
      setWarning(r.warning);
      setSearchId(r.search_id);
      store({ q: term, items: merged, center: nextCenter, page: p, hasMore: r.has_more, searchId: r.search_id, filter });
      void history.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setLastQ(term);
    setItems(null);
    // Busca no Brasil todo (sem a localização de quem pesquisa); com cidade na pesquisa, naquela cidade
    await fetchPage(term, null, 0, [], null);
  };

  const more = () => void fetchPage(lastQ, center, page + 1, items ?? [], searchId);
  // Filtro aplicado na tela também: trocar Todos / Com site / Sem site não refaz a pesquisa
  const shown = (items ?? []).filter((c) => matchesFilter(c, filter));

  const generate = (c: FoundCompany) => {
    // A análise usa os dados já trazidos pela pesquisa (sem consultar o Maps de novo)
    try {
      sessionStorage.setItem(`lp:place:${c.url}`, JSON.stringify({ name: c.name, phone: c.phone, address: c.address, website: c.website, rating: c.rating, reviews: c.reviews, photos: c.photos ?? null, place_id: c.place_id ?? null, google_url: c.google_url }));
    } catch {
      /* sem armazenamento: a análise consulta o Maps pelo link */
    }
    navigate(`/nova?url=${encodeURIComponent(c.url!)}&fotos=${allowImages ? 1 : 0}`);
  };

  const waiting = (
    <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
      <Loader2 className="size-5 flex-none animate-spin text-brand-600" />
      Buscando empresas no Google… pode levar até 2 minutos.
    </Card>
  );

  return (
    <>
      <PageHeader title="Buscar empresas" description="Pesquise locais no Google Maps por segmento (ex.: “manutenção predial”) e gere a Landing Page de qualquer resultado." />
      <Card className="mb-6 p-4 sm:p-5">
        <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input className="h-11 pl-10" placeholder="Segmento (e cidade, se quiser)…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <Button type="submit" size="lg" loading={loading === 'new'} disabled={!!loading} icon={<Search className="size-4" />}>Pesquisar</Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-600">Empresas:</span>
          <div role="radiogroup" className="inline-flex rounded-lg border border-zinc-200 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => {
                  setFilter(f.value);
                  if (items) store({ q: lastQ, items, center, page, hasMore, searchId, filter: f.value });
                }}
                className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition', filter === f.value ? 'bg-ink text-white' : 'text-zinc-600 hover:bg-zinc-100')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
          <span>
            Usar as fotos do site nas páginas geradas
            <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
          </span>
        </label>
        <p className="mt-3 text-xs text-zinc-500">
          Cada pesquisa traz cerca de 50 empresas (locais do Google Maps e sites da busca do Google); "Buscar mais" traz as próximas. Sem cidade, a pesquisa cobre o Brasil todo, começando pelas maiores cidades. Para uma cidade específica, inclua-a (ex.: "manutenção predial em Campinas").
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
      {items ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold">Empresas encontradas</h2>
          <span className="text-xs text-zinc-500">
            {filter === 'todos' ? `${items.length} empresa(s)` : `${shown.length} de ${items.length} empresa(s) ${filter === 'com_site' ? 'com site' : 'sem site'}`} para “{lastQ}”
          </span>
        </div>
      ) : null}
      {loading === 'new' ? waiting : null}
      {items && !shown.length && !loading ? (
        <Card className="p-5 text-sm text-zinc-500">
          {items.length ? `Nenhuma empresa ${filter === 'com_site' ? 'com' : 'sem'} site entre as encontradas até agora. Use "Buscar mais" ou troque o filtro.` : 'Nenhuma empresa encontrada. Tente outras palavras ou inclua a cidade.'}
        </Card>
      ) : null}
      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((c, i) => <ResultCard key={`${c.url}-${i}`} c={c} onGenerate={() => generate(c)} />)}
        </div>
      ) : null}
      {warning && !loading ? (
        <p className="mt-4 flex gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 [overflow-wrap:anywhere]">
          <AlertTriangle className="size-4 flex-none" /> {warning}
        </p>
      ) : null}
      {error ? <div className="mt-4"><ErrorBlock message={error} onRetry={() => (items?.length ? more() : void search())} /></div> : null}
      {loading === 'more' ? <div className="mt-4">{waiting}</div> : null}
      {items && hasMore && !loading && !error ? (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={more} icon={<Search className="size-4" />}>Buscar mais</Button>
        </div>
      ) : null}
      </div>

      {/* Histórico de pesquisas: clicar mostra os resultados salvos, sem nova consulta */}
      <aside className="lg:order-none order-first">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">
            <button type="button" onClick={() => !isDesktop && setHistoryOpen((o) => !o)} aria-expanded={showHistory} className={cn('flex w-full items-center gap-2 text-left', isDesktop && 'pointer-events-none')}>
              <History className="size-4" /> Pesquisas anteriores
              {history.data?.items.length ? <span className="text-xs font-normal text-zinc-500">({history.data.items.length})</span> : null}
              {isDesktop ? null : <ChevronDown className={cn('ml-auto size-4 text-zinc-500 transition-transform', historyOpen && 'rotate-180')} />}
            </button>
          </h2>
          {showHistory ? <div className="mt-3">
          {history.loading && !history.data ? (
            <p className="text-xs text-zinc-500">Carregando…</p>
          ) : history.error && !history.data ? (
            <p className="text-xs text-red-600">
              Não foi possível carregar o histórico: {history.error}{' '}
              <button type="button" className="font-medium underline" onClick={() => void history.reload()}>Tentar de novo</button>
            </p>
          ) : !history.data?.items.length ? (
            <p className="text-xs text-zinc-500">As pesquisas feitas ficam salvas aqui.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
              {history.data.items.map((h) => (
                <li key={h.id} className={cn('group flex items-center gap-1 rounded-lg', h.id === searchId ? 'bg-zinc-100' : 'hover:bg-zinc-50')}>
                  <button type="button" onClick={() => { setHistoryOpen(false); void openSaved(h.id); }} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {opening === h.id ? <Loader2 className="size-3.5 flex-none animate-spin" /> : null}
                      {h.query}
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      {h.count} local(is) · {formatDate(h.updated_at, true)}{h.author ? ` · ${h.author}` : ''}
                    </span>
                  </button>
                  <button type="button" onClick={() => void removeSaved(h)} className="mr-1 rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 lg:opacity-0 lg:group-hover:opacity-100" aria-label="Apagar pesquisa" title="Apagar do histórico">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div> : null}
        </Card>
      </aside>
      </div>
    </>
  );
}
