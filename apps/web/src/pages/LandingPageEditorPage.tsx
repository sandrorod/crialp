import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Building2, Loader2, Copy, Download, ExternalLink, Image as ImageIcon, Monitor, MoveVertical, Palette, PenLine, RefreshCw, Rows3, Save, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ClientAccessTab, OwnAccessTab } from '@/components/landing/ClientAccessTab';
import { ContentTab } from '@/components/landing/ContentTab';
import { PreviewFrame } from '@/components/landing/PreviewFrame';
import { applyTextEdit, type PreviewMode } from '@/components/landing/previewTools';
import { DesignTab, PhotosTab, TemplateTab, PublishTab, SeoTab, VersionsTab, type NewPhoto, type SeoState } from '@/components/landing/SettingsTabs';
import { ProgressSteps } from '@/components/ProgressSteps';
import { StopJobButton } from '@/components/StopJobButton';
import { Button, Card, ConfirmDialog, ErrorBlock, LoadingBlock, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useJob } from '@/hooks/useJob';
import { useLandingPageActions } from '@/hooks/useLandingPageActions';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { analysisService, companyService, landingPageService } from '@/services';
import type { LandingContent, SectionOrderKey, ThemeSettings } from '@/types';

type Tab = 'modelo' | 'textos' | 'fotos' | 'visual' | 'seo' | 'publicacao' | 'cliente' | 'versoes';
const TABS: { key: Tab; label: string }[] = [
  { key: 'modelo', label: 'Modelo' },
  { key: 'textos', label: 'Textos' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'visual', label: 'Cores e estilo' },
  { key: 'seo', label: 'SEO' },
  { key: 'publicacao', label: 'Publicação' },
  { key: 'cliente', label: 'Acesso do cliente' },
  { key: 'versoes', label: 'Versões' },
];
// Abas que só a equipe vê (o cliente não publica nem cria logins)
const STAFF_TABS: Tab[] = ['publicacao', 'cliente'];

const MODES: { key: PreviewMode; label: string; icon: typeof Monitor; hint: string }[] = [
  { key: 'textos', label: 'Textos', icon: PenLine, hint: 'Clique em qualquer texto contornado para editar ali mesmo (A− / A+ mudam o tamanho). Enter ou clicar fora confirma; Esc desfaz.' },
  { key: 'fotos', label: 'Fotos', icon: ImageIcon, hint: 'Arraste qualquer foto (topo, "Sobre" e galeria) para ajustar o enquadramento; use − / + para o zoom.' },
  { key: 'secoes', label: 'Seções', icon: Rows3, hint: 'Arraste as seções pelo botão ⠿ (ou use ↑ ↓) para mudar a ordem.' },
  { key: 'espacos', label: 'Espaços', icon: MoveVertical, hint: 'Arraste a alça azul "↕ Espaço" na borda de baixo de cada seção: para cima diminui a margem interna, para baixo aumenta. Duplo clique volta ao padrão.' },
  { key: 'cores', label: 'Cores', icon: Palette, hint: 'Clique em qualquer elemento (título, texto, botão, fundo…) para escolher a cor da fonte, do fundo e o tamanho.' },
];

/** Aplica a nova ordem das seções visíveis mantendo as demais (sem dados ou fixas) na lista. */
function mergeSectionOrder(order: SectionOrderKey[], keys: string[]): SectionOrderKey[] {
  const moved = keys as SectionOrderKey[];
  return [...moved, ...order.filter((k) => !moved.includes(k))];
}

/**
 * Partes do tema que mudam a estrutura/cores renderizadas no servidor. Enquadramento, cores de
 * elementos, margens e ordem no celular são aplicados direto na prévia e não entram aqui.
 */
function renderedThemeKey(t: ThemeSettings | null | undefined, c: LandingContent | null | undefined) {
  if (!t) return '';
  const { preset, primary, accent, heroVariant, sections, images, template, imageOrder, logoPlacement } = t;
  // Todo o conteúdo (textos, seções desativadas, ordem, seções personalizadas) também é renderizado no servidor
  return JSON.stringify({ preset, primary, accent, heroVariant, sections, images, template, imageOrder, logoPlacement, content: c ?? null });
}

export function LandingPageEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Conta de cliente: edita o conteúdo, mas não publica, exclui, regenera nem mexe no cadastro
  const isClient = user?.role === 'client';
  const canManageAccess = user?.role === 'owner' || user?.role === 'admin';
  const { data: lp, error, loading, reload } = useAsync(() => landingPageService.get(id), [id]);
  const { data: company, reload: reloadCompany } = useAsync(async () => (lp ? companyService.get(lp.company_id) : null), [lp?.company_id]);
  const [tab, setTab] = useState<Tab>('textos');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [mode, setMode] = useState<PreviewMode>('textos');
  const [frameKey, setFrameKey] = useState(0);
  const [content, setContent] = useState<LandingContent | null>(null);
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [seo, setSeo] = useState<SeoState | null>(null);
  const [dirty, setDirty] = useState(false);
  // Prévia do rascunho: modelo, cores, topo e fotos aparecem na hora, antes de salvar
  const [draftHtml, setDraftHtml] = useState<string | null>(null);
  // Prévia sendo refeita no servidor (troca de modelo, cores, seções…): mostra o carregamento
  const [previewLoading, setPreviewLoading] = useState(false);
  // Edição feita dentro da prévia (texto, arrastar seção): ela já aparece lá, sem refazer a prévia
  const frameKeyShown = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [keepTheme, setKeepTheme] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const { job } = useJob<{ landingPageId: string }>(jobId);

  const refresh = () => {
    void reload();
    setFrameKey((k) => k + 1);
  };
  const actions = useLandingPageActions(refresh);

  useEffect(() => {
    if (!lp) return;
    setContent(lp.content);
    setTheme(lp.theme);
    setSeo({ seo_title: lp.seo_title, seo_description: lp.seo_description, seo_keywords: lp.seo_keywords, og_image: lp.og_image });
    setDirty(false);
    setDraftHtml(null);
  }, [lp]);

  const draftKey = renderedThemeKey(theme, content);
  const savedKey = renderedThemeKey(lp?.theme, lp?.content);
  useEffect(() => {
    if (!lp || !content || !theme) return;
    if (frameKeyShown.current === draftKey && !previewLoading) return;
    // Sem mudança de tema desde o último salvamento, a página salva já é a prévia certa
    if (draftKey === savedKey && draftHtml === null) {
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      landingPageService
        .previewDraft(lp.id, { content, theme })
        .then((r) => !cancelled && setDraftHtml(r.html))
        .catch((err) => !cancelled && toast.error(`Prévia: ${errorMessage(err)}`))
        .finally(() => !cancelled && setPreviewLoading(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, savedKey]);

  useEffect(() => {
    if (job?.status === 'done') {
      toast.success('Nova versão gerada.');
      setJobId(null);
      refresh();
    } else if (job?.status === 'error') {
      toast.error(job.error ?? 'Não foi possível gerar a Landing Page. Tente novamente.');
      setJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (loading && !lp) return <Card><LoadingBlock rows={8} /></Card>;
  if (!lp || !content || !theme || !seo) return null;

  const save = async () => {
    setSaving(true);
    try {
      await landingPageService.saveContent(lp.id, { content, theme, seo });
      toast.success('Alterações salvas (nova versão criada).');
      refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async (photos: NewPhoto[]) => {
    await companyService.addImages(lp.company_id, photos);
    await reloadCompany();
    // Sem galeria na página: cria a seção antes de depoimentos/FAQ/contato
    if (!content.gallery) {
      setContent((c) => {
        if (!c || c.gallery) return c;
        const order: SectionOrderKey[] = c.section_order.filter((k) => k !== 'gallery');
        const before = ['testimonials', 'faq', 'contact', 'final_cta'].map((k) => order.indexOf(k as SectionOrderKey)).filter((i) => i >= 0);
        order.splice(before.length ? Math.min(...before) : order.length, 0, 'gallery');
        return { ...c, gallery: { title: 'Conheça nosso espaço', subtitle: null }, section_order: order };
      });
      setDirty(true);
    }
  };

  const removePhotos = async (urls: string[]) => {
    await companyService.removeImages(lp.company_id, urls);
    await reloadCompany();
  };

  const regenerate = async () => {
    setRegenOpen(false);
    try {
      const r = await analysisService.generate(lp.company_id, { landingPageId: lp.id, keepTheme });
      setJobId(r.jobId);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const change = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };
  const generating = !!jobId;

  return (
    <div>
      {isClient ? null : (
        <Link to="/landing-pages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-ink">
          <ArrowLeft className="size-4" /> Landing Pages
        </Link>
      )}

      {/* Cabeçalho */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{lp.company?.name ?? lp.title}</h1>
            {isClient ? null : <StatusToggle status={lp.status} loading={actions.busyId === lp.id} onToggle={() => actions.toggleStatus(lp.id, lp.status)} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            <a href={lp.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
              {lp.public_url.replace(/^https?:\/\//, '')} <ExternalLink className="size-3.5" />
            </a>
            <button onClick={() => actions.copyUrl(lp.public_url)} className="inline-flex items-center gap-1 hover:text-ink"><Copy className="size-3.5" /> Copiar</button>
            <span>v{lp.current_version} · atualizada {formatDate(lp.updated_at, true)}</span>
          </div>
        </div>
        {isClient ? null : <div className="flex flex-wrap gap-2">
          <Link to={`/empresas/${lp.company_id}`}><Button variant="secondary" icon={<Building2 className="size-4" />}>Editar empresa</Button></Link>
          <Button variant="secondary" onClick={() => setRegenOpen(true)} loading={generating} icon={<Sparkles className="size-4" />}>Regenerar</Button>
          <a href={landingPageService.exportUrl(lp.id)}><Button variant="ghost" icon={<Download className="size-4" />} aria-label="Exportar HTML" title="Exportar HTML" /></a>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="size-4" />} aria-label="Excluir" title="Excluir" />
        </div>}
      </div>

      {generating ? (
        <Card className="mb-5 p-5">
          <ProgressSteps current={Math.max(job?.step ?? 7, 7)} range={[7, 9]} />
          <div className="mt-4 flex justify-end">
            <StopJobButton jobId={jobId} />
          </div>
        </Card>
      ) : null}

      {/* grid-cols-1 (minmax 0): no celular a coluna não cresce além da tela com as barras de botões */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* Prévia */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
            <span className="text-sm font-medium">Visualizar Landing Page</span>
            <div className="flex items-center gap-1">
              <div className="flex rounded-lg bg-zinc-100 p-0.5">
                {(['desktop', 'mobile'] as const).map((d) => (
                  <button key={d} onClick={() => setDevice(d)} className={cn('rounded-md p-1.5', device === d ? 'bg-white shadow-sm' : 'text-zinc-500')} aria-label={d}>
                    {d === 'desktop' ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setFrameKey((k) => k + 1)} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Recarregar prévia"><RefreshCw className="size-4" /></button>
              <a href={landingPageService.previewUrl(lp.id)} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Abrir prévia em nova aba"><ExternalLink className="size-4" /></a>
            </div>
          </div>
          <div className="bg-zinc-100 p-3 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
              {/* No celular os modos rolam para o lado numa linha só */}
              <div className="flex max-w-full overflow-x-auto overscroll-x-contain rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-black/5">
                {MODES.map((m) => (
                  <button key={m.key} onClick={() => setMode(m.key)} className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium', mode === m.key ? 'bg-ink text-white' : 'text-zinc-600 hover:text-ink')}>
                    <m.icon className="size-3.5" /> {m.label}
                  </button>
                ))}
              </div>
              {mode === 'secoes' && device === 'mobile' && theme.mobileOrder?.length ? (
                <button
                  onClick={() => {
                    setTheme((t) => (t ? { ...t, mobileOrder: [] } : t));
                    setDirty(true);
                    setFrameKey((k) => k + 1);
                  }}
                  className="text-xs text-zinc-500 underline hover:text-ink"
                >
                  Usar a mesma ordem do computador
                </button>
              ) : null}
            </div>
            <p className="mb-2 text-center text-xs text-zinc-500">
              {MODES.find((m) => m.key === mode)?.hint}
              {mode !== 'fotos' ? ` ${mode === 'textos' ? 'O tamanho vale' : 'Vale'} só para o layout de ${device === 'mobile' ? 'celular' : 'computador'}.` : ''}
            </p>
            {dirty ? <p className="mb-2 text-center text-xs text-amber-700">Há alterações não salvas. Clique em Salvar para publicá-las nesta versão.</p> : null}
            <div className="relative">
            {previewLoading ? (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-white/60 backdrop-blur-[2px]" role="status" aria-live="polite">
                <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-lg ring-1 ring-black/5">
                  <Loader2 className="size-9 animate-spin text-brand-600" />
                  <span className="text-sm font-medium text-zinc-700">Carregando…</span>
                </div>
              </div>
            ) : null}
            <PreviewFrame
              key={`${frameKey}-${device}`}
              src={landingPageService.previewUrl(lp.id)}
              html={draftHtml}
              device={device}
              height={Math.round(window.innerHeight * 0.72)}
              focus={theme.focus}
              onFocus={(url, f) => {
                setTheme((t) => (t ? { ...t, focus: { ...t.focus, [url]: f } } : t));
                setDirty(true);
              }}
              mode={mode}
              sectionOrder={device === 'mobile' && theme.mobileOrder?.length ? theme.mobileOrder : content.section_order}
              onReorder={(keys) => {
                // Celular tem ordem própria; no computador muda a ordem normal das seções
                if (device === 'mobile') setTheme((t) => (t ? { ...t, mobileOrder: keys } : t));
                else {
                  const next = { ...content, section_order: mergeSectionOrder(content.section_order, keys) };
                  frameKeyShown.current = renderedThemeKey(theme, next);
                  setContent(next);
                }
                setDirty(true);
              }}
              onText={(path, value) => {
                const next = applyTextEdit(content, path, value);
                if (!next) {
                  toast.error('Este texto não pode ficar vazio.');
                  return false;
                }
                frameKeyShown.current = renderedThemeKey(theme, next);
                setContent(next);
                setDirty(true);
                return true;
              }}
              elementColors={theme.elementColors}
              sectionSpacing={theme.sectionSpacing}
              onSpacing={(key, pct) => {
                setTheme((t) => {
                  if (!t) return t;
                  const sp = t.sectionSpacing ?? {};
                  const map = { ...(sp.sections?.[device] ?? {}) };
                  if (pct === null) delete map[key];
                  else map[key] = pct;
                  return { ...t, sectionSpacing: { ...sp, sections: { ...sp.sections, [device]: map } } };
                });
                setDirty(true);
              }}
              onElementColors={(colors) => {
                setTheme((t) => (t ? { ...t, elementColors: colors } : t));
                setDirty(true);
              }}
            />
            </div>
          </div>
        </Card>

        {/* Painel de edição */}
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 overflow-x-auto overscroll-x-contain rounded-lg bg-zinc-100 p-1">
            {TABS.filter((t) => !STAFF_TABS.includes(t.key) || (t.key === 'cliente' ? canManageAccess || isClient : !isClient)).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn('shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition', tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink')}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="xl:max-h-[calc(72vh+10px)] xl:overflow-y-auto xl:pr-1">
            {tab === 'textos' ? <ContentTab content={content} onChange={change(setContent)} company={company} /> : null}
            {tab === 'modelo' ? <Card className="p-5"><TemplateTab theme={theme} onChange={change(setTheme)} hasPhoto={!!company?.images.some((i) => i.usage_allowed && i.type !== 'logo')} /></Card> : null}
            {tab === 'fotos' ? <Card className="p-5"><PhotosTab theme={theme} onChange={change(setTheme)} images={company?.images ?? null} onAddPhotos={addPhotos} onRemovePhotos={removePhotos} sectionOrder={content.section_order} /></Card> : null}
            {tab === 'visual' ? <Card className="p-5"><DesignTab theme={theme} onChange={change(setTheme)} content={content} /></Card> : null}
            {tab === 'seo' ? <Card className="p-5"><SeoTab seo={seo} onChange={change(setSeo)} slug={lp.slug} /></Card> : null}
            {tab === 'publicacao' ? <Card className="p-5"><PublishTab lp={lp} onUpdated={refresh} /></Card> : null}
            {tab === 'cliente' && canManageAccess ? <Card className="p-5"><ClientAccessTab lpId={lp.id} /></Card> : null}
            {tab === 'cliente' && isClient ? <Card className="p-5"><OwnAccessTab /></Card> : null}
            {tab === 'versoes' ? <VersionsTab lp={lp} onRestored={refresh} /> : null}
          </div>
          {['modelo', 'textos', 'fotos', 'visual', 'seo'].includes(tab) ? (
            <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur">
              <span className="text-xs text-zinc-500">{dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
              <div className="flex gap-2">
                {dirty ? <Button variant="ghost" size="sm" onClick={() => { setContent(lp.content); setTheme(lp.theme); setSeo({ seo_title: lp.seo_title, seo_description: lp.seo_description, seo_keywords: lp.seo_keywords, og_image: lp.og_image }); setDirty(false); }}>Descartar</Button> : null}
                <Button size="sm" onClick={save} loading={saving} disabled={!dirty} icon={<Save className="size-4" />}>Salvar</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={regenOpen}
        title="Regenerar Landing Page?"
        description={
          <div className="space-y-3">
            <p>A IA criará uma nova versão a partir dos dados atuais da empresa. A versão atual fica no histórico e pode ser restaurada.</p>
            <label className="flex items-center gap-2 text-ink">
              <input type="checkbox" checked={keepTheme} onChange={(e) => setKeepTheme(e.target.checked)} className="accent-zinc-900" />
              Manter cores e estilo atuais
            </label>
            {dirty ? <p className="text-amber-700">Alterações não salvas serão descartadas.</p> : null}
          </div>
        }
        confirmLabel="Regenerar"
        onConfirm={regenerate}
        onClose={() => setRegenOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Excluir Landing Page?"
        description="A página e todo o histórico de versões serão excluídos. Os dados da empresa são mantidos."
        confirmLabel="Excluir"
        danger
        loading={actions.busyId === lp.id}
        onConfirm={async () => {
          await actions.remove(lp.id);
          navigate('/landing-pages');
        }}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
