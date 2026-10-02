import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, ExternalLink, Globe, Loader2, MapPin, Phone, Search, Sparkles, Star } from 'lucide-react';
import { Button, Card, ErrorBlock, Input, PageHeader } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { searchService } from '@/services';
import type { FoundCompany } from '@/types';


// A última pesquisa continua na tela ao voltar de outra página
const STORE_KEY = 'lp:company-search';
type Saved = { q: string; items: FoundCompany[]; center: { lat: number; lng: number } | null; page: number; hasMore: boolean };
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

/** Localização do navegador (como o Google faz): null se negada, indisponível ou demorar. */
function getNear(): Promise<Near> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    );
  });
}

function ResultCard({ c, onGenerate }: { c: FoundCompany; onGenerate: () => void }) {
  return (
    <Card className="flex flex-col p-4">
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
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        {c.existing ? (
          <Link to={`/empresas/${c.existing.id}`} className="text-xs text-amber-700 hover:underline">
            Já cadastrada{c.existing.reason === 'nome' ? ' (mesmo nome)' : ''}: {c.existing.name}
          </Link>
        ) : <span />}
        <Button size="sm" variant="brand" disabled={!c.url} onClick={onGenerate} icon={<Sparkles className="size-3.5" />}>Gerar LP</Button>
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
  const [loading, setLoading] = useState<'new' | 'more' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowImages, setAllowImages] = useState(true);
  // undefined = ainda não pedida; null = sem localização
  const [near, setNear] = useState<Near | undefined>(undefined);

  const fetchPage = async (term: string, at: Near, p: number, prev: FoundCompany[]) => {
    setLoading(p === 0 ? 'new' : 'more');
    setError(null);
    try {
      const r = await searchService.places(term, at, p);
      // Sem repetir locais já mostrados
      const known = new Set(prev.map((c) => c.url));
      const merged = [...prev, ...r.items.filter((c) => !known.has(c.url))];
      const nextCenter = r.center ? { lat: r.center.latitude, lng: r.center.longitude } : at;
      setItems(merged);
      setCenter(nextCenter);
      setPage(p);
      setHasMore(r.has_more);
      store({ q: term, items: merged, center: nextCenter, page: p, hasMore: r.has_more });
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
    setLoading('new');
    const loc = near === undefined ? await getNear() : near;
    setNear(loc);
    await fetchPage(term, loc, 0, []);
  };

  const more = () => void fetchPage(lastQ, center, page + 1, items ?? []);

  const generate = (c: FoundCompany) => {
    // A análise usa os dados já trazidos pela pesquisa (sem consultar o Maps de novo)
    try {
      sessionStorage.setItem(`lp:place:${c.url}`, JSON.stringify({ name: c.name, phone: c.phone, address: c.address, website: c.website, rating: c.rating, reviews: c.reviews }));
    } catch {
      /* sem armazenamento: a análise consulta o Maps pelo link */
    }
    navigate(`/nova?url=${encodeURIComponent(c.url!)}&fotos=${allowImages ? 1 : 0}`);
  };

  const waiting = (
    <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
      <Loader2 className="size-5 flex-none animate-spin text-brand-600" />
      Buscando locais no Google Maps em vários pontos da região… pode levar até 2 minutos.
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
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
          <span>
            Usar as fotos do site nas páginas geradas
            <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
          </span>
        </label>
        <p className="mt-3 text-xs text-zinc-500">
          {near === null
            ? 'Sem acesso à sua localização: inclua a cidade na pesquisa (ex.: "manutenção predial em Campinas").'
            : 'Sem cidade na pesquisa, os locais são buscados perto de você (o navegador pede permissão de localização).'}
        </p>
      </Card>

      {items ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-semibold">Locais no Google Maps</h2>
          <span className="text-xs text-zinc-500">{items.length} local(is) para “{lastQ}”</span>
        </div>
      ) : null}
      {loading === 'new' ? waiting : null}
      {items && !items.length && !loading ? <Card className="p-5 text-sm text-zinc-500">Nenhum local encontrado. Tente outras palavras ou inclua a cidade.</Card> : null}
      {items?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((c, i) => <ResultCard key={`${c.url}-${i}`} c={c} onGenerate={() => generate(c)} />)}
        </div>
      ) : null}
      {error ? <div className="mt-4"><ErrorBlock message={error} onRetry={() => (items?.length ? more() : void search())} /></div> : null}
      {loading === 'more' ? <div className="mt-4">{waiting}</div> : null}
      {items?.length && hasMore && !loading && !error ? (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={more} icon={<MapPin className="size-4" />}>Buscar mais locais (área maior)</Button>
        </div>
      ) : null}
    </>
  );
}
