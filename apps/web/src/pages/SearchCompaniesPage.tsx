import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, ExternalLink, Globe, Loader2, MapPin, Phone, Search, Sparkles, Star } from 'lucide-react';
import { Button, Card, ErrorBlock, Input, PageHeader } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { searchService } from '@/services';
import type { FoundCompany } from '@/types';

type Kind = 'locais' | 'sites';
type Block = { items: FoundCompany[] | null; loading: boolean; error: string | null };
const empty: Block = { items: null, loading: false, error: null };

// A última pesquisa continua na tela ao voltar de outra página
const STORE_KEY = 'lp:company-search';
type Saved = { q: string; locais: FoundCompany[] | null; sites: FoundCompany[] | null };
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
  const [lastQ, setLastQ] = useState(saved?.q ?? '');
  const [locais, setLocais] = useState<Block>({ ...empty, items: saved?.locais ?? null });
  const [sites, setSites] = useState<Block>({ ...empty, items: saved?.sites ?? null });
  const [allowImages, setAllowImages] = useState(true);

  const run = async (term: string, kind: Kind, set: (b: Block) => void, current: { locais: FoundCompany[] | null; sites: FoundCompany[] | null }) => {
    set({ items: null, loading: true, error: null });
    try {
      const r = await searchService.companies(term, kind);
      set({ items: r.items, loading: false, error: null });
      current[kind] = r.items;
      store({ q: term, ...current });
    } catch (err) {
      set({ items: null, loading: false, error: errorMessage(err) });
    }
  };

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setLastQ(term);
    // Locais (Google Maps) demoram mais: os sites aparecem antes
    const current = { locais: null, sites: null };
    void run(term, 'locais', setLocais, current);
    void run(term, 'sites', setSites, current);
  };

  const generate = (c: FoundCompany) => {
    // Local do Maps: a análise usa os dados já trazidos pela pesquisa (sem consultar o Maps de novo)
    if (c.source === 'maps') {
      try {
        sessionStorage.setItem(`lp:place:${c.url}`, JSON.stringify({ name: c.name, phone: c.phone, address: c.address, website: c.website, rating: c.rating, reviews: c.reviews }));
      } catch {
        /* sem armazenamento: a análise consulta o Maps pelo link */
      }
    }
    navigate(`/nova?url=${encodeURIComponent(c.url!)}&fotos=${allowImages ? 1 : 0}`);
  };
  const busy = locais.loading || sites.loading;

  const section = (title: string, hint: string, b: Block, kind: Kind) => (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {b.items ? <span className="text-xs text-zinc-500">{b.items.length} resultado(s)</span> : null}
      </div>
      <p className="mb-3 text-xs text-zinc-500">{hint}</p>
      {b.loading ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
          <Loader2 className="size-5 animate-spin text-brand-600" />
          {kind === 'locais' ? 'Buscando locais no Google Maps… pode levar até 1 minuto.' : 'Buscando sites…'}
        </Card>
      ) : b.error ? (
        <ErrorBlock message={b.error} onRetry={() => void run(lastQ, kind, kind === 'locais' ? setLocais : setSites, { locais: locais.items, sites: sites.items })} />
      ) : b.items && !b.items.length ? (
        <Card className="p-5 text-sm text-zinc-500">Nada encontrado. Tente outras palavras, incluindo a cidade.</Card>
      ) : b.items ? (
        <div className="grid gap-3 md:grid-cols-2">
          {b.items.map((c, i) => <ResultCard key={`${c.url}-${i}`} c={c} onGenerate={() => generate(c)} />)}
        </div>
      ) : null}
    </section>
  );

  return (
    <>
      <PageHeader title="Buscar empresas" description="Pesquise no Google por segmento e cidade (ex.: “manutenção predial em São José do Rio Preto”) e gere a Landing Page de qualquer resultado." />
      <Card className="mb-6 p-4 sm:p-5">
        <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input className="h-11 pl-10" placeholder="Segmento e cidade…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <Button type="submit" size="lg" loading={busy} icon={<Search className="size-4" />}>Pesquisar</Button>
        </form>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
          <span>
            Usar as fotos do site nas páginas geradas
            <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
          </span>
        </label>
      </Card>

      {locais.items || locais.loading || locais.error
        ? section('Locais no Google Maps', 'Empresas do Google Maps com telefone, endereço e nota. "Gerar LP" lê o perfil do Google e, se houver, o site.', locais, 'locais')
        : null}
      {sites.items || sites.loading || sites.error
        ? section('Sites', 'Sites encontrados na busca do Google. O telefone aparece quando está no resumo; a análise ao gerar a LP busca todos os contatos.', sites, 'sites')
        : null}
    </>
  );
}
