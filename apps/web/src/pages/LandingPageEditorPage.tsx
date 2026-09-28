import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Building2, Copy, Download, ExternalLink, Monitor, RefreshCw, Rocket, Save, Smartphone, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ContentTab } from '@/components/landing/ContentTab';
import { PreviewFrame } from '@/components/landing/PreviewFrame';
import { DesignTab, PhotosTab, TemplateTab, PublishTab, SeoTab, VersionsTab, type SeoState } from '@/components/landing/SettingsTabs';
import { ProgressSteps } from '@/components/ProgressSteps';
import { Button, Card, ConfirmDialog, ErrorBlock, LoadingBlock, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useJob } from '@/hooks/useJob';
import { useLandingPageActions } from '@/hooks/useLandingPageActions';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { analysisService, companyService, landingPageService } from '@/services';
import type { LandingContent, ThemeSettings } from '@/types';

type Tab = 'modelo' | 'textos' | 'fotos' | 'visual' | 'seo' | 'publicacao' | 'versoes';
const TABS: { key: Tab; label: string }[] = [
  { key: 'modelo', label: 'Modelo' },
  { key: 'textos', label: 'Textos' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'visual', label: 'Cores e estilo' },
  { key: 'seo', label: 'SEO' },
  { key: 'publicacao', label: 'Publicação' },
  { key: 'versoes', label: 'Versões' },
];

export function LandingPageEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: lp, error, loading, reload } = useAsync(() => landingPageService.get(id), [id]);
  const { data: company } = useAsync(async () => (lp ? companyService.get(lp.company_id) : null), [lp?.company_id]);
  const [tab, setTab] = useState<Tab>('textos');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [frameKey, setFrameKey] = useState(0);
  const [content, setContent] = useState<LandingContent | null>(null);
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [seo, setSeo] = useState<SeoState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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
  }, [lp]);

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

  const publish = async () => {
    if (dirty && !(await save())) return;
    setPublishing(true);
    try {
      await landingPageService.publish(lp.id);
      toast.success('Landing Page publicada!', { description: lp.public_url });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPublishing(false);
    }
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
      <Link to="/landing-pages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-ink">
        <ArrowLeft className="size-4" /> Landing Pages
      </Link>

      {/* Cabeçalho */}
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{lp.company?.name ?? lp.title}</h1>
            <StatusToggle status={lp.status} loading={actions.busyId === lp.id} onToggle={() => actions.toggleStatus(lp.id, lp.status)} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            <a href={lp.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
              {lp.public_url.replace(/^https?:\/\//, '')} <ExternalLink className="size-3.5" />
            </a>
            <button onClick={() => actions.copyUrl(lp.public_url)} className="inline-flex items-center gap-1 hover:text-ink"><Copy className="size-3.5" /> Copiar</button>
            <span>v{lp.current_version} · atualizada {formatDate(lp.updated_at, true)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/empresas/${lp.company_id}`}><Button variant="secondary" icon={<Building2 className="size-4" />}>Editar empresa</Button></Link>
          <Button variant="secondary" onClick={() => setRegenOpen(true)} loading={generating} icon={<Sparkles className="size-4" />}>Regenerar</Button>
          <a href={landingPageService.exportUrl(lp.id)}><Button variant="ghost" icon={<Download className="size-4" />} aria-label="Exportar HTML" title="Exportar HTML" /></a>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="size-4" />} aria-label="Excluir" title="Excluir" />
          {lp.status === 'inativa' ? (
            <Button variant="brand" onClick={publish} loading={publishing} icon={<Rocket className="size-4" />}>Publicar</Button>
          ) : (
            <Button variant="secondary" onClick={() => actions.toggleStatus(lp.id, lp.status)} loading={actions.busyId === lp.id}>Desativar</Button>
          )}
        </div>
      </div>

      {generating ? (
        <Card className="mb-5 p-5">
          <ProgressSteps current={Math.max(job?.step ?? 7, 7)} range={[7, 9]} />
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
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
            {dirty ? <p className="mb-2 text-center text-xs text-amber-700">A prévia mostra a última versão salva. Salve para ver as alterações.</p> : null}
            <PreviewFrame key={`${frameKey}-${device}`} src={landingPageService.previewUrl(lp.id)} device={device} height={Math.round(window.innerHeight * 0.72)} />
          </div>
        </Card>

        {/* Painel de edição */}
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition', tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink')}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="xl:max-h-[calc(72vh+10px)] xl:overflow-y-auto xl:pr-1">
            {tab === 'textos' ? <ContentTab content={content} onChange={change(setContent)} company={company} /> : null}
            {tab === 'modelo' ? <Card className="p-5"><TemplateTab theme={theme} onChange={change(setTheme)} hasPhoto={!!company?.images.some((i) => i.usage_allowed && i.type !== 'logo')} /></Card> : null}
            {tab === 'fotos' ? <Card className="p-5"><PhotosTab theme={theme} onChange={change(setTheme)} images={company?.images ?? null} /></Card> : null}
            {tab === 'visual' ? <Card className="p-5"><DesignTab theme={theme} onChange={change(setTheme)} imagesAllowed={lp.company?.images_allowed ?? 0} content={content} /></Card> : null}
            {tab === 'seo' ? <Card className="p-5"><SeoTab seo={seo} onChange={change(setSeo)} slug={lp.slug} /></Card> : null}
            {tab === 'publicacao' ? <Card className="p-5"><PublishTab lp={lp} onUpdated={refresh} /></Card> : null}
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
