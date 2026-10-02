import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, ExternalLink, Globe, MapPin, Phone, Search, Sparkles, Star } from 'lucide-react';
import { Button, Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { searchService } from '@/services';
import type { FoundCompany } from '@/types';

// A última pesquisa continua na tela ao voltar de outra página
const STORE_KEY = 'lp:company-search';
type Saved = { q: string; items: FoundCompany[]; source: 'maps' | 'web' };
function loadSaved(): Saved | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function SearchCompaniesPage() {
  const navigate = useNavigate();
  const saved = loadSaved();
  const [q, setQ] = useState(saved?.q ?? '');
  const [result, setResult] = useState<Saved | null>(saved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowImages, setAllowImages] = useState(true);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const r = await searchService.companies(q.trim());
      const next = { q: q.trim(), ...r };
      setResult(next);
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* sem armazenamento: só não lembra a pesquisa */
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const generate = (c: FoundCompany) => navigate(`/nova?url=${encodeURIComponent(c.url!)}&fotos=${allowImages ? 1 : 0}`);

  return (
    <>
      <PageHeader title="Buscar empresas" description="Pesquise no Google por segmento e cidade (ex.: “manutenção predial São José do Rio Preto”) e gere a Landing Page de qualquer resultado." />
      <Card className="mb-5 p-4 sm:p-5">
        <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input className="h-11 pl-10" placeholder="Segmento e cidade…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <Button type="submit" size="lg" loading={loading} icon={<Search className="size-4" />}>Pesquisar</Button>
        </form>
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
          <span>
            Usar as fotos do site nas páginas geradas
            <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
          </span>
        </label>
      </Card>

      {error ? <ErrorBlock message={error} onRetry={() => void search()} /> : null}
      {loading ? <Card className="p-5"><LoadingBlock rows={6} /></Card> : null}
      {!loading && result && !result.items.length ? (
        <EmptyState icon={<Search className="size-5" />} title="Nenhuma empresa encontrada" description="Tente outras palavras, incluindo a cidade." />
      ) : null}
      {!loading && result?.items.length ? (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            {result.items.length} resultado(s) para “{result.q}”.
            {result.source === 'web' ? ' Resultados da busca do Google: o telefone aparece quando está no resumo do resultado; a análise completa (ao gerar a LP) busca todos os contatos no site.' : ''}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {result.items.map((c, i) => (
              <Card key={`${c.url}-${i}`} className="flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-9 flex-none place-items-center rounded-lg bg-zinc-100 text-zinc-500"><Building2 className="size-4" /></div>
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
                    {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{c.phone}</a> : <span className="text-zinc-400">Telefone não informado no resultado</span>}
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
                  <Button size="sm" variant="brand" disabled={!c.url} onClick={() => generate(c)} icon={<Sparkles className="size-3.5" />}>Gerar LP</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
