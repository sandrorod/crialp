import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  Loader2,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Monitor,
  Move,
  MoveVertical,
  Palette,
  PenLine,
  RefreshCw,
  Rows3,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ClientAccessTab, OwnAccessTab } from '@/components/landing/ClientAccessTab';
import { ContentTab } from '@/components/landing/ContentTab';
import { IconPickerModal, type IconPageStyle } from '@/components/landing/IconPicker';
import { PreviewFrame } from '@/components/landing/PreviewFrame';
import { applyTextEdit, type PreviewMode, type PreviewSelection } from '@/components/landing/previewTools';
import { DesignTab, PhotosTab, TemplateTab, PublishTab, SeoTab, VersionsTab, type NewPhoto, type SeoState } from '@/components/landing/SettingsTabs';
import { ProgressSteps } from '@/components/ProgressSteps';
import { SellerCell, useSellers, type Seller } from '@/components/SellerCell';
import { StopJobButton } from '@/components/StopJobButton';
import { Button, Card, ConfirmDialog, ErrorBlock, LoadingBlock, StatusToggle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useJob } from '@/hooks/useJob';
import { useLandingPageActions } from '@/hooks/useLandingPageActions';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { analysisService, companyService, landingPageService } from '@/services';
import type { LandingContent, LandingScreenshot, SectionOrderKey, ThemeSettings } from '@/types';

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
  {
    key: 'textos',
    label: 'Textos',
    icon: PenLine,
    hint: 'Textos contornados para editar ali mesmo (Enter ou clicar fora confirma; Esc desfaz). Em qualquer modo, clicar num elemento abre as opções dele.',
  },
  {
    key: 'fotos',
    label: 'Fotos',
    icon: ImageIcon,
    hint: 'Arraste a foto para ajustar o enquadramento e as alças azuis das bordas para cortar (duplo clique tira o corte). Clique na foto para zoom, borda, sombra e as demais opções.',
  },
  {
    key: 'mover',
    label: 'Mover',
    icon: Move,
    hint: 'Arraste qualquer foto ou texto para o ponto da seção onde quer deixá-lo (no celular, com o dedo). Ele não sai da área da seção. Duplo clique volta à posição original.',
  },
  { key: 'secoes', label: 'Seções', icon: Rows3, hint: 'Arraste as seções pelo botão ⠿ (ou use ↑ ↓) para mudar a ordem.' },
  {
    key: 'espacos',
    label: 'Espaços',
    icon: MoveVertical,
    hint: 'Arraste a alça azul "↕ Espaço" na borda de baixo de cada seção: para cima diminui a margem interna, para baixo aumenta. Duplo clique volta ao padrão.',
  },
  {
    key: 'cores',
    label: 'Cores',
    icon: Palette,
    hint: 'Clique em qualquer elemento (título, texto, botão, fundo…) para escolher a cor da fonte, do fundo e o tamanho.',
  },
];

/** Botões só com ícone da linha de ações: mesmo tamanho, fundo, borda e cor em todos. */
const ICON_ACTION =
  'inline-flex size-8 flex-none items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-xs transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50';

/** Aplica a nova ordem das seções visíveis mantendo as demais (sem dados ou fixas) na lista. */
function mergeSectionOrder(order: SectionOrderKey[], keys: string[]): SectionOrderKey[] {
  const moved = keys as SectionOrderKey[];
  return [...moved, ...order.filter((k) => !moved.includes(k))];
}

/** Ícone atual de um campo do conteúdo ("services.items.0.icon", "custom.<id>.blocks.2.icon"). */
function readIconAt(content: LandingContent, path: string): string | null {
  const parts = path.split('.');
  let target: unknown = content;
  let rest = parts;
  if (parts[0] === 'custom') {
    target = content.custom_sections?.find((c) => c.id === parts[1]);
    rest = parts.slice(2);
  }
  for (const k of rest) target = target && typeof target === 'object' ? (target as Record<string, unknown>)[k] : null;
  return typeof target === 'string' ? target : null;
}

/**
 * Partes do tema que mudam a estrutura/cores renderizadas no servidor. Enquadramento, cores de
 * elementos, margens e ordem no celular são aplicados direto na prévia e não entram aqui.
 */
function renderedThemeKey(t: ThemeSettings | null | undefined, c: LandingContent | null | undefined) {
  if (!t) return '';
  const {
    preset,
    primary,
    accent,
    background,
    heroVariant,
    sections,
    images,
    template,
    imageOrder,
    logoPlacement,
    removeEmojis,
    brand,
    hideMap,
    blend,
    photoShape,
    photoCols,
  } = t;
  // Todo o conteúdo (textos, seções desativadas, ordem, seções personalizadas) também é renderizado no servidor
  // (blend = tons das duas cores; photoShape = formato das fotos)
  return JSON.stringify({
    preset,
    primary,
    accent,
    background: background ?? null,
    heroVariant,
    sections,
    images,
    template,
    imageOrder,
    logoPlacement,
    removeEmojis,
    brand,
    hideMap: hideMap === true,
    blend: blend === true,
    photoShape: photoShape ?? null,
    photoCols: photoCols ?? null,
    content: c ?? null,
  });
}

export function LandingPageEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Conta de cliente: edita o conteúdo, mas não publica, exclui, regenera nem mexe no cadastro
  const isClient = user?.role === 'client';
  // Vendedor edita as LPs atribuídas a ele com as mesmas limitações do cliente
  const isSeller = user?.role === 'seller';
  const restricted = isClient || isSeller;
  const clientSiteCount = user?.landing_page_ids?.length ?? 0;
  const canManageAccess = user?.role === 'owner' || user?.role === 'admin';
  const { data: lp, error, loading, reload } = useAsync(() => landingPageService.get(id), [id]);
  const { data: company, reload: reloadCompany } = useAsync(async () => (lp ? companyService.get(lp.company_id) : null), [lp?.company_id]);
  const [tab, setTab] = useState<Tab>('textos');
  // Grupo (e campo exato) do painel da direita a mostrar depois de clicar num elemento da prévia (n força repetir)
  const [focusGroup, setFocusGroup] = useState<{ id: string; n: number; fields: string[] } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Altura da prévia: em telas largas acompanha o painel de edição ao lado (os dois terminam na mesma linha)
  const sideRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewHeight, setPreviewHeight] = useState(() => Math.round(window.innerHeight * 0.72));
  /** Elemento clicado na prévia: mostra à direita a área com os campos daquela parte da página. */
  const showFieldsFor = (s: PreviewSelection) => {
    if (s.image && !s.path) {
      setTab('fotos');
      setFocusGroup(null);
      return;
    }
    const section = s.section ?? '';
    const labelPath = s.path?.startsWith('labels.') && /^(labels\.(nav_|header_cta|skip_link|footer_note|whatsapp))/.test(s.path);
    const id = s.socials ? 'socials' : labelPath || section === 'header' || section === 'footer' ? 'labels' : section;
    if (!id) return;
    // Campo mais específico primeiro: "services.items.1.benefit" → "services.items.1" → "services.items" → "services".
    // Clique num cartão (sem texto próprio): o item do primeiro texto dentro dele
    const base = s.path ?? (s.innerPath ? s.innerPath.split('.').slice(0, -1).join('.') : null);
    const parts = base ? base.split('.') : [];
    const fields = parts.map((_, i) => parts.slice(0, parts.length - i).join('.'));
    setTab('textos');
    setFocusGroup((f) => ({ id, fields, n: (f?.n ?? 0) + 1 }));
  };
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
  const [shotBusy, setShotBusy] = useState(false);
  // Estado próprio: recarregar a LP reiniciaria o rascunho do editor
  const [shotOverride, setShotOverride] = useState<LandingScreenshot | null>(null);
  const { sellers, canAssign } = useSellers();
  const [sellerOverride, setSellerOverride] = useState<Seller | null>(null);
  // Imagem (JPG) das 3 primeiras seções: gerada sozinha ao ativar a LP; aqui gera de novo depois de editar
  const downloadShot = (createdAt: string) => {
    const a = document.createElement('a');
    a.href = `${landingPageService.screenshotUrl(id)}?v=${encodeURIComponent(createdAt)}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  /** Gera a imagem (de novo); `thenDownload`: baixa em seguida (LP ainda sem imagem) */
  const generateShot = async (thenDownload = false) => {
    setShotBusy(true);
    try {
      const { screenshot } = await landingPageService.regenerateScreenshot(id);
      setShotOverride(screenshot);
      if (thenDownload) downloadShot(screenshot.created_at);
      else {
        const sent = screenshot.drive_file_id && !screenshot.drive_error ? ' e enviada ao Google Drive' : '';
        toast.success(dirty ? `Imagem gerada a partir da versão salva da página${sent}.` : `Nova imagem gerada${sent}.`);
      }
      if (screenshot.drive_error) toast.warning(screenshot.drive_error);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setShotBusy(false);
    }
  };
  const [keepTheme, setKeepTheme] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Ícone clicado na prévia: caminho do campo ("services.items.0.icon"…) e estilo da página
  const [iconEdit, setIconEdit] = useState<{ path: string; style?: IconPageStyle } | null>(null);
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
    setShotOverride(null);
  }, [lp]);

  useEffect(() => {
    const side = sideRef.current;
    const area = previewAreaRef.current;
    const box = previewBoxRef.current;
    if (!side || !area || !box) return;
    const wide = window.matchMedia('(min-width: 1280px)');
    const fit = () => {
      if (!wide.matches) return setPreviewHeight(Math.round(window.innerHeight * 0.72));
      // O que a prévia tem além do quadro da página (modos, margens e borda do cartão)
      const chrome = area.offsetHeight - box.offsetHeight + 2;
      const next = Math.max(360, Math.round(side.offsetHeight - chrome));
      setPreviewHeight((h) => (Math.abs(h - next) > 1 ? next : h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(side);
    window.addEventListener('resize', fit);
    wide.addEventListener('change', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
      wide.removeEventListener('change', fit);
    };
  }, [!!lp && !!content]);

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

  useEffect(() => {
    if (!focusGroup || tab !== 'textos') return;
    const panel = panelRef.current;
    const group = panel?.querySelector<HTMLElement>(`[data-group="${CSS.escape(focusGroup.id)}"]`);
    // Campo exato (ou o mais próximo dele); sem campo correspondente, o grupo inteiro
    const field = focusGroup.fields.map((f) => panel?.querySelector<HTMLElement>(`[data-field="${CSS.escape(f)}"]`)).find(Boolean);
    const el = field ?? group;
    if (!panel || !el) return;
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    // Computador largo: o painel rola sozinho até o grupo. Telas menores: o painel fica abaixo da prévia,
    // então a página não pula (o grupo só abre e fica destacado)
    if (panel.scrollHeight > panel.clientHeight + 1) {
      // Campo: no meio do painel; grupo: no topo
      const offset = field ? Math.max(8, (panel.clientHeight - el.offsetHeight) / 2) : 8;
      panel.scrollTo({ top: el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - offset, behavior: 'smooth' });
    }
    el.style.boxShadow = '0 0 0 3px #f59e0b';
    el.style.borderRadius ||= '8px';
    const t = setTimeout(() => (el.style.boxShadow = ''), field ? 2500 : 1600);
    // Outro clique antes de terminar: apaga o destaque deste grupo
    return () => {
      clearTimeout(t);
      el.style.boxShadow = '';
    };
  }, [focusGroup, tab]);

  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (loading && !lp)
    return (
      <Card>
        <LoadingBlock rows={8} />
      </Card>
    );
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

  const addPhotos = async (photos: NewPhoto[], opts: { logo?: boolean } = {}) => {
    await companyService.addImages(lp.company_id, photos);
    await reloadCompany();
    // Sem galeria na página: cria a seção antes de depoimentos/FAQ/contato (logotipo não precisa de galeria)
    if (!content.gallery && !opts.logo) {
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

  const change =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setDirty(true);
    };
  const generating = !!jobId;
  // Mesmo nome do topo da página (cabeçalho da LP): o editado na prévia, senão o nome fantasia, senão a razão
  const headerName = content.overrides?.['company.name']?.trim() || company?.trade_name || company?.name || lp.company?.name || lp.title;
  const shot = shotOverride ?? lp.screenshot;
  const seller = sellerOverride ?? { id: lp.seller_id, name: lp.seller_name };

  return (
    <div>
      {/* Voltar, endereço da página, versão, botões da prévia e ações na mesma linha */}
      <div className="mb-[3px] flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
        {/* Cliente com vários sites: volta à lista para escolher outro */}
        {!isClient || clientSiteCount > 1 ? (
          <>
            <Link to={restricted ? '/meus-sites' : '/landing-pages'} className="inline-flex items-center gap-1.5 hover:text-ink">
              <ArrowLeft className="size-4" /> {isSeller ? 'Minhas Landing Pages' : isClient ? 'Meus sites' : 'Landing Pages'}
            </Link>
            <span className="text-zinc-300" aria-hidden>
              |
            </span>
          </>
        ) : null}
        <a href={lp.public_url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-brand-600 hover:underline">
          {lp.public_url.replace(/^https?:\/\//, '')} <ExternalLink className="size-3.5" />
        </a>
        <button type="button" onClick={() => actions.copyUrl(lp.public_url)} className="inline-flex items-center gap-1 hover:text-ink">
          <Copy className="size-3.5" /> Copiar
        </button>
        <span>
          v{lp.current_version} · atualizada {formatDate(lp.updated_at, true)}
        </span>
        {restricted ? null : (
          <span className="inline-flex items-center gap-1.5">
            · Vendedor
            <SellerCell
              landingPageId={lp.id}
              sellerId={seller.id}
              sellerName={seller.name}
              sellers={sellers}
              canAssign={canAssign}
              onChanged={(s) => setSellerOverride(s)}
            />
          </span>
        )}
        <span className="text-zinc-300" aria-hidden>
          |
        </span>
        {/* Prévia: computador/celular, recarregar e abrir em nova aba */}
        <div className="flex items-center gap-1">
          <div className="flex rounded-lg bg-zinc-100 p-0.5">
            {(['desktop', 'mobile'] as const).map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => setDevice(d)}
                className={cn('rounded-md p-1.5', device === d ? 'bg-white shadow-sm' : 'text-zinc-500')}
                aria-label={d === 'desktop' ? 'Prévia no computador' : 'Prévia no celular'}
                title={d === 'desktop' ? 'Prévia no computador' : 'Prévia no celular'}
              >
                {d === 'desktop' ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFrameKey((k) => k + 1)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
            aria-label="Recarregar prévia"
            title="Recarregar prévia"
          >
            <RefreshCw className="size-4" />
          </button>
          <a
            href={landingPageService.previewUrl(lp.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
            aria-label="Abrir prévia em nova aba"
            title="Abrir prévia em nova aba"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
        {/* Ações da página, alinhadas à direita */}
        {restricted ? null : (
          <div className="ml-auto flex flex-wrap justify-end gap-1.5">
            <Link to={`/empresas/${lp.company_id}`} className={ICON_ACTION} aria-label="Editar empresa" title="Editar empresa">
              <Building2 className="size-4" />
            </Link>
            <button
              type="button"
              onClick={() => setRegenOpen(true)}
              disabled={generating}
              className={ICON_ACTION}
              aria-label="Regenerar"
              title="Regenerar a Landing Page"
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            </button>
            {/* Sempre visível: sem imagem ainda (LP antiga ou falha), gera e já baixa */}
            <button
              type="button"
              disabled={shotBusy}
              onClick={() => (shot?.available ? downloadShot(shot.created_at) : generateShot(true))}
              className={ICON_ACTION}
              aria-label="Baixar imagem JPG"
              title={
                shot?.available
                  ? `Baixar imagem JPG (topo e "Sobre nós"), gerada ${formatDate(shot.created_at, true)}`
                  : 'Gerar e baixar imagem JPG (topo e "Sobre nós")'
              }
            >
              <ImageIcon className="size-4" />
            </button>
            {/* Novo print da página; o envio ao Google Drive é automático */}
            <button
              type="button"
              disabled={shotBusy}
              onClick={() => generateShot()}
              className={ICON_ACTION}
              aria-label="Novo print"
              title={shotBusy ? 'Gerando o print…' : 'Novo print: gerar um novo print da página e enviar ao Google Drive'}
            >
              <RefreshCw className={shotBusy ? 'size-4 animate-spin' : 'size-4'} />
            </button>
            {shot?.drive_file_id ? (
              <a
                href={`https://drive.google.com/file/d/${shot.drive_file_id}/view`}
                target="_blank"
                rel="noreferrer"
                className={ICON_ACTION}
                aria-label="Drive"
                title={shot.drive_error ?? 'Abrir a imagem no Google Drive'}
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            <a href={landingPageService.exportUrl(lp.id)} className={ICON_ACTION} aria-label="Exportar HTML" title="Exportar HTML">
              <Download className="size-4" />
            </a>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className={cn(ICON_ACTION, 'hover:border-red-200 hover:text-red-600')}
              aria-label="Excluir"
              title="Excluir"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
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
        {/* Prévia: só da altura do conteúdo (sem esticar até a altura do painel ao lado); margem de baixo igual às laterais */}
        <Card className="self-start overflow-hidden">
          <div ref={previewAreaRef} className="bg-zinc-100 p-3 sm:p-4">
            {/* Nome à esquerda, modos no centro (telas largas); em telas estreitas um abaixo do outro */}
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              {/* Nome da página (o mesmo do topo da LP) e ativar/desativar, na linha dos modos */}
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="truncate text-lg font-semibold tracking-tight">{headerName}</h1>
                {restricted ? null : (
                  <StatusToggle status={lp.status} loading={actions.busyId === lp.id} onToggle={() => actions.toggleStatus(lp.id, lp.status)} />
                )}
              </div>
              {/* No celular os modos quebram em mais de uma linha (sem rolagem lateral) */}
              <div className="flex max-w-full flex-wrap justify-center gap-0.5 rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-black/5">
                {MODES.map((m) => (
                  <button
                    type="button"
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    title={m.hint}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium',
                      mode === m.key ? 'bg-ink text-white' : 'text-zinc-600 hover:text-ink',
                    )}
                  >
                    <m.icon className="size-3.5" /> {m.label}
                  </button>
                ))}
              </div>
              {/* À direita: aviso de alterações não salvas (e a ordem do celular no modo Seções) */}
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 lg:justify-self-end">
                {dirty ? <span className="text-xs font-medium text-amber-700">Há alterações não salvas.</span> : null}
                {mode === 'secoes' && device === 'mobile' && theme.mobileOrder?.length ? (
                  <button
                    type="button"
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
            </div>
            <div ref={previewBoxRef} className="relative">
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
                height={previewHeight}
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
                onSelect={showFieldsFor}
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
                onIcon={(path, style) => setIconEdit({ path, style })}
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
                sectionColors={theme.sections}
                onSectionBg={(key, bg) => {
                  setTheme((t) => {
                    if (!t) return t;
                    const cur = { ...(t.sections?.[key] ?? {}) };
                    if (bg) cur.bg = bg;
                    else delete cur.bg;
                    const sections = { ...t.sections };
                    if (cur.bg || cur.text || cur.accent) sections[key] = cur;
                    else delete sections[key];
                    return { ...t, sections };
                  });
                  setDirty(true);
                }}
                imageSize={theme.imageSize}
                onImageSize={(changes) => {
                  setTheme((t) => {
                    if (!t) return t;
                    const all = t.imageSize ?? {};
                    const map = { ...(all[device] ?? {}) };
                    // Chave "<seção>|<url>": cada seção guarda o tamanho da foto separado
                    for (const [key, box] of Object.entries(changes)) {
                      if (box) map[key] = box;
                      else delete map[key];
                    }
                    return { ...t, imageSize: { ...all, [device]: map } };
                  });
                  setDirty(true);
                }}
                imageStyle={theme.imageStyle}
                onImageStyle={(url, look) => {
                  setTheme((t) => {
                    if (!t) return t;
                    const all = { ...(t.imageStyle ?? {}) };
                    if (look) all[url] = look;
                    else delete all[url];
                    return { ...t, imageStyle: all };
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
        <div ref={sideRef} className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
            {/* Cliente: vê "Publicação" só para escolher o endereço da página */}
            {TABS.filter((t) => !STAFF_TABS.includes(t.key) || t.key === 'publicacao' || (t.key === 'cliente' ? canManageAccess || isClient : !restricted)).map(
              (t) => (
                <button
                  type="button"
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition',
                    tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink',
                  )}
                >
                  {t.label}
                </button>
              ),
            )}
          </div>
          <div ref={panelRef} className="xl:h-[max(420px,calc(100vh-300px))] xl:overflow-y-auto xl:pr-1">
            {tab === 'textos' ? (
              <ContentTab
                content={content}
                onChange={change(setContent)}
                company={company}
                theme={theme}
                onThemeChange={change(setTheme)}
                lpId={lp.id}
                onReviewsUpdated={() => {
                  void reloadCompany();
                  refresh();
                }}
              />
            ) : null}
            {tab === 'modelo' ? (
              <Card className="p-5">
                <TemplateTab theme={theme} onChange={change(setTheme)} hasPhoto={!!company?.images.some((i) => i.usage_allowed && i.type !== 'logo')} />
              </Card>
            ) : null}
            {tab === 'fotos' ? (
              <Card className="p-5">
                <PhotosTab
                  theme={theme}
                  onChange={change(setTheme)}
                  images={company?.images ?? null}
                  onAddPhotos={addPhotos}
                  onRemovePhotos={removePhotos}
                  sectionOrder={content.section_order}
                  customSections={content.custom_sections}
                />
              </Card>
            ) : null}
            {tab === 'visual' ? (
              <Card className="p-5">
                <DesignTab theme={theme} onChange={change(setTheme)} content={content} />
              </Card>
            ) : null}
            {tab === 'seo' ? (
              <Card className="p-5">
                <SeoTab seo={seo} onChange={change(setSeo)} slug={lp.slug} />
              </Card>
            ) : null}
            {tab === 'publicacao' ? (
              <Card className="p-5">
                <PublishTab lp={lp} onUpdated={refresh} slugOnly={restricted} />
              </Card>
            ) : null}
            {tab === 'cliente' && canManageAccess ? (
              <Card className="p-5">
                <ClientAccessTab lpId={lp.id} />
              </Card>
            ) : null}
            {tab === 'cliente' && isClient ? (
              <Card className="p-5">
                <OwnAccessTab />
              </Card>
            ) : null}
            {tab === 'versoes' ? <VersionsTab lp={lp} onRestored={refresh} /> : null}
          </div>
          {['modelo', 'textos', 'fotos', 'visual', 'seo'].includes(tab) ? (
            <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3 backdrop-blur">
              <span className="text-xs text-zinc-500">{dirty ? 'Alterações não salvas' : 'Sem alterações'}</span>
              <div className="ml-auto flex gap-2">
                {dirty ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setContent(lp.content);
                      setTheme(lp.theme);
                      setSeo({ seo_title: lp.seo_title, seo_description: lp.seo_description, seo_keywords: lp.seo_keywords, og_image: lp.og_image });
                      setDirty(false);
                    }}
                  >
                    Descartar
                  </Button>
                ) : null}
                <Button size="sm" onClick={save} loading={saving} disabled={!dirty} icon={<Save className="size-4" />}>
                  Salvar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <IconPickerModal
        open={!!iconEdit}
        value={iconEdit ? readIconAt(content, iconEdit.path) : null}
        pageStyle={iconEdit?.style}
        onPick={(name) => {
          if (!iconEdit) return;
          const next = applyTextEdit(content, iconEdit.path, name);
          if (!next) {
            toast.error('Não foi possível trocar este ícone.');
            return;
          }
          setContent(next);
          setDirty(true);
        }}
        onClose={() => setIconEdit(null)}
      />
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
