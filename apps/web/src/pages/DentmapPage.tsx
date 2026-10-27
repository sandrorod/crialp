import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, Building2, CheckCircle2, ExternalLink, Link2, Loader2, PanelsTopLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, PageHeader } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { saveBatch } from '@/lib/lpBatch';
import { cn } from '@/lib/utils';
import { dentmapService } from '@/services';
import type { DentmapItem } from '@/types';

/** Só entra no lote quem ainda não foi cadastrado (os demais têm "Abrir LP" / "Abrir empresa"). */
const canBatch = (c: DentmapItem) => !c.existing;
const label = (c: DentmapItem) => c.name || decodeURIComponent(c.url.split('/').pop() ?? c.url);

/**
 * DentMap: cole o link de uma página do DentMap (ex.: dentistas de uma cidade). O sistema lista os perfis de
 * dentistas que aparecem nela e gera a LP de cada um com os dados do perfil (mesma análise de link e mesmo lote
 * de "Buscar empresas").
 */
export function DentmapPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [items, setItems] = useState<DentmapItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowImages, setAllowImages] = useState(true);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      const r = await dentmapService.links(url.trim());
      setItems(r.items);
      setSelected(new Set(r.items.filter(canBatch).map((c) => c.url)));
      if (!r.items.length) toast.info('Nenhum perfil de dentista encontrado nesta página.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (c: DentmapItem, v: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (v) next.add(c.url);
      else next.delete(c.url);
      return next;
    });
  const chosen = (items ?? []).filter((c) => canBatch(c) && selected.has(c.url));
  const selectable = (items ?? []).filter(canBatch);
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.url));

  const generate = (c: DentmapItem) => navigate(`/nova?url=${encodeURIComponent(c.url)}&fotos=${allowImages ? 1 : 0}`);

  /** Gera os selecionados um de cada vez: a tela "Nova Landing Page" passa para o próximo ao terminar cada um. */
  const generateBatch = () => {
    if (!chosen.length) return;
    saveBatch({ items: chosen.map((c) => ({ url: c.url, name: label(c) })), index: 0, fotos: allowImages, ok: 0 });
    navigate('/nova?lote=1');
  };

  return (
    <div>
      <PageHeader
        title="DentMap"
        description="Cole o link de uma página do DentMap. Os dentistas que aparecem nela são listados e cada um vira uma Landing Page."
      />
      <Card className="mb-6 p-4 sm:p-5">
        <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="h-11 pl-10"
              placeholder="https://dentmap.com.br/dentistas/sao-paulo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" loading={loading}>
            Buscar dentistas
          </Button>
        </form>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
          <span>
            Usar as fotos do perfil nas páginas geradas
            <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Dá para remover fotos na revisão.</span>
          </span>
        </label>
      </Card>

      {loading ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-zinc-600">
          <Loader2 className="size-5 flex-none animate-spin text-brand-600" />
          Lendo a página do DentMap…
        </Card>
      ) : items?.length ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-zinc-600">
              {items.length} dentista(s) encontrado(s) · {chosen.length} selecionado(s)
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
                        Ver no DentMap
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
