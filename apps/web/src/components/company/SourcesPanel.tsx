import { useMemo, useState } from 'react';
import { Check, Copy, FileText, Globe, ImagePlus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn, copyToClipboard, formatDate, shortUrl } from '@/lib/utils';
import { companyService } from '@/services';
import type { CompanyDraft, CompanySources } from '@/types';

type Tab = 'textos' | 'contatos' | 'imagens' | 'estruturados';
const MAIN_SOCIALS = ['instagram', 'facebook', 'youtube', 'linkedin', 'tiktok'] as const;

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) => (p.toLowerCase() === term.toLowerCase() ? <mark key={i} className="rounded bg-amber-200 px-0.5">{p}</mark> : p))}
    </>
  );
}

function UseButton({ label, onClick, done }: { label: string; onClick: () => void; done?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition',
        done ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50 hover:text-ink',
      )}
    >
      {done ? <Check className="size-3" /> : null}
      {label}
    </button>
  );
}

/**
 * Tudo o que foi coletado do site: texto integral de cada página, contatos,
 * redes, imagens e dados estruturados — com atalhos para levar ao cadastro.
 */
export function SourcesPanel({ companyId, draft, onApply }: { companyId: string; draft: CompanyDraft; onApply: (patch: Partial<CompanyDraft>) => void }) {
  const { data, setData, loading, error, reload } = useAsync(() => companyService.sources(companyId), [companyId]);
  const [tab, setTab] = useState<Tab>('textos');
  const [page, setPage] = useState(0);
  const [term, setTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await companyService.refreshSources(companyId));
      toast.success('Site lido novamente. Conteúdo atualizado.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const pages = data?.pages ?? [];
  const d: CompanySources['data'] = data?.data ?? {};
  const hasContent = pages.length > 0;

  // Busca em todas as páginas
  const matches = useMemo(() => {
    if (!term.trim()) return null;
    const t = term.trim().toLowerCase();
    return pages.map((p, i) => ({ i, count: p.content.toLowerCase().split(t).length - 1 })).filter((m) => m.count > 0);
  }, [pages, term]);

  const current = pages[Math.min(page, Math.max(pages.length - 1, 0))];
  const lines = current?.content.split('\n') ?? [];
  const visibleLines = term.trim() ? lines.filter((l) => l.toLowerCase().includes(term.trim().toLowerCase())) : lines;

  const imagesInDraft = new Set(draft.images.map((i) => i.url));
  const socialField = (network: string) => (MAIN_SOCIALS as readonly string[]).includes(network) ? (network as (typeof MAIN_SOCIALS)[number]) : null;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'textos', label: 'Textos das páginas', count: pages.length },
    { key: 'contatos', label: 'Contatos e redes', count: (d.phones?.length ?? 0) + (d.whatsapps?.length ?? 0) + (d.emails?.length ?? 0) + (d.socials?.length ?? 0) + (d.zip_codes?.length ?? 0) },
    { key: 'imagens', label: 'Imagens', count: d.images?.length ?? 0 },
    { key: 'estruturados', label: 'Dados estruturados', count: d.json_ld?.length ?? 0 },
  ];

  return (
    <Card className="mb-4">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Globe className="size-4 text-zinc-500" /> Conteúdo completo do site</h3>
          <p className="mt-0.5 text-sm text-zinc-500">
            {hasContent ? `Tudo o que foi lido em ${d.final_url ? shortUrl(d.final_url) : 'site'} · ${formatDate(d.fetched_at ?? pages[0]?.fetched_at, true)}` : 'Texto integral, contatos, redes e imagens encontrados no site de referência.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={refreshing} icon={<RefreshCw className="size-4" />} onClick={refresh}>
          {hasContent ? 'Ler o site novamente' : 'Ler o site agora'}
        </Button>
      </div>

      {loading && !data ? (
        <div className="p-5"><div className="skeleton h-24 rounded-lg" /></div>
      ) : error ? (
        <div className="p-5 text-sm text-red-600">{error} <button className="underline" onClick={reload}>Tentar novamente</button></div>
      ) : !hasContent ? (
        <div className="p-5 text-sm text-zinc-500">
          Esta empresa ainda não tem o conteúdo do site guardado. Clique em <strong>Ler o site agora</strong> para buscar tudo o que está em {shortUrl(draft.reference_url || draft.website) || 'site de referência'}.
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition', tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink')}>
                {t.label} <span className="text-zinc-400">{t.count}</span>
              </button>
            ))}
          </div>

          {tab === 'textos' ? (
            <div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input className="pl-9" placeholder="Buscar em todas as páginas (ex.: unidade, horário, preço, telefone)…" value={term} onChange={(e) => setTerm(e.target.value)} />
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {pages.map((p, i) => {
                  const m = matches?.find((x) => x.i === i);
                  return (
                    <button
                      key={p.url}
                      onClick={() => setPage(i)}
                      className={cn('max-w-[260px] truncate rounded-full px-3 py-1 text-xs ring-1 transition', i === page ? 'bg-ink text-white ring-ink' : 'bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50', matches && !m && 'opacity-40')}
                      title={p.url}
                    >
                      {/(^|\.)google\.[a-z.]+$/i.test(new URL(p.url).hostname) ? 'Perfil no Google' : new URL(p.url).pathname === '/' ? 'Página inicial' : decodeURIComponent(new URL(p.url).pathname).replace(/^\/|\/$/g, '')}
                      {m ? ` · ${m.count}` : ''}
                    </button>
                  );
                })}
              </div>
              {current ? (
                <div className="rounded-lg border border-zinc-200">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{current.title || shortUrl(current.url)}</div>
                      <a href={current.url} target="_blank" rel="noreferrer" title={current.url} className="block truncate text-xs text-brand-600 hover:underline">{shortUrl(current.url, 70)}</a>
                    </div>
                    <Button variant="ghost" size="sm" icon={<Copy className="size-3.5" />} onClick={async () => (await copyToClipboard(current.content)) && toast.success('Texto da página copiado.')}>
                      Copiar tudo
                    </Button>
                  </div>
                  {current.description ? <p className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs text-zinc-600"><strong>Descrição (meta):</strong> {current.description}</p> : null}
                  <div className="max-h-[420px] overflow-y-auto px-4 py-3 text-[13px] leading-relaxed text-zinc-700">
                    {visibleLines.length ? (
                      visibleLines.map((l, i) => (
                        <p key={i} className={cn('py-0.5', l.startsWith('## ') && 'mt-3 font-semibold text-ink')}>
                          <Highlight text={l.replace(/^## /, '')} term={term.trim()} />
                        </p>
                      ))
                    ) : (
                      <p className="text-zinc-400">Nenhum trecho desta página contém "{term}".</p>
                    )}
                  </div>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-zinc-500">
                Selecione e copie qualquer trecho para o cadastro ou para uma <strong>seção personalizada</strong> da Landing Page (Landing Page → Textos → Seções personalizadas).
              </p>
            </div>
          ) : null}

          {tab === 'contatos' ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <FoundList title="Telefones" items={d.phones ?? []} render={(v) => (
                <>
                  <UseButton label="Telefone" done={draft.phone === v} onClick={() => onApply({ phone: v })} />
                  <UseButton label="Celular" done={draft.mobile === v} onClick={() => onApply({ mobile: v })} />
                  <UseButton label="WhatsApp" done={draft.whatsapp === v} onClick={() => onApply({ whatsapp: v })} />
                </>
              )} />
              <FoundList title="WhatsApp (links do site)" items={d.whatsapps ?? []} render={(v) => <UseButton label="Usar como WhatsApp" done={draft.whatsapp === v} onClick={() => onApply({ whatsapp: v })} />} />
              <FoundList title="E-mails" items={d.emails ?? []} render={(v) => <UseButton label="Usar como e-mail" done={draft.email === v} onClick={() => onApply({ email: v })} />} />
              <FoundList title="CEPs" items={d.zip_codes ?? []} render={(v) => <UseButton label="Usar como CEP" done={draft.zip_code === v} onClick={() => onApply({ zip_code: v })} />} />
              <FoundList
                title="Redes sociais"
                className="sm:col-span-2"
                items={(d.socials ?? []).map((s) => `${s.network}|${s.url}`)}
                label={(v) => v.split('|')[1]}
                render={(v) => {
                  const [network, url] = v.split('|');
                  const field = socialField(network);
                  const done = field ? draft[field] === url : draft.other_socials.some((s) => s.url === url);
                  return (
                    <UseButton
                      label={field ? `Usar como ${network}` : 'Adicionar em outras redes'}
                      done={done}
                      onClick={() => (field ? onApply({ [field]: url }) : onApply({ other_socials: [...draft.other_socials, { network, url }] }))}
                    />
                  );
                }}
              />
            </div>
          ) : null}

          {tab === 'imagens' ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-zinc-500">{d.images?.length ?? 0} imagens encontradas no site (ícones e miniaturas já descartados).</p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ImagePlus className="size-4" />}
                  onClick={() => {
                    const add = (d.images ?? []).filter((i) => !imagesInDraft.has(i.url)).map((i) => ({ url: i.url, type: 'gallery' as const, alt_text: i.alt || null, source: 'scraped' as const, usage_allowed: true }));
                    if (!add.length) return toast.info('Todas as imagens já estão no cadastro.');
                    onApply({ images: [...draft.images, ...add] });
                    toast.success(`${add.length} imagem(ns) adicionada(s) ao cadastro. Clique em "Salvar empresa".`);
                  }}
                >
                  Adicionar todas ao cadastro
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {(d.images ?? []).map((img) => {
                  const added = imagesInDraft.has(img.url);
                  return (
                    <div key={img.url} className="overflow-hidden rounded-lg border border-zinc-200">
                      <div className="aspect-square bg-zinc-100">
                        <img src={img.url} alt={img.alt} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex items-center justify-between gap-1 p-1.5">
                        <span className="text-[10px] text-zinc-500">{img.width}×{img.height}</span>
                        <UseButton
                          label={added ? 'No cadastro' : 'Adicionar'}
                          done={added}
                          onClick={() => !added && onApply({ images: [...draft.images, { url: img.url, type: 'gallery', alt_text: img.alt || null, source: 'scraped', usage_allowed: true }] })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === 'estruturados' ? (
            <div>
              <p className="mb-2 text-sm text-zinc-500">Dados técnicos (JSON-LD/schema.org) publicados pelo site: nome, endereço, logotipo, avaliações de terceiros etc.</p>
              {d.json_ld?.length ? (
                <pre className="max-h-[420px] overflow-auto rounded-lg bg-zinc-950 p-4 text-[11px] leading-relaxed text-zinc-100">{JSON.stringify(d.json_ld, null, 2)}</pre>
              ) : (
                <p className="text-sm text-zinc-400">O site não publica dados estruturados.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function FoundList({ title, items, render, label, className }: { title: string; items: string[]; render: (v: string) => React.ReactNode; label?: (v: string) => string; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500"><FileText className="size-3.5" /> {title}</div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((v) => (
            <li key={v} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2">
              <span className="mr-auto min-w-0 truncate text-sm">{label ? label(v) : v}</span>
              {render(v)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400">Nenhum encontrado no site.</p>
      )}
    </div>
  );
}
