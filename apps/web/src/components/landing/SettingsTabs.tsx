import { useRef, useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, Globe, GripVertical, ImageOff, Link2, RotateCcw, ShieldAlert, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Field, Input, ListEditor, Select, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn, copyToClipboard, formatDate } from '@/lib/utils';
import { landingPageService, miscService } from '@/services';
import type { CompanyImage, HeroVariant, ImagePlacement, LandingContent, TemplateKey, LandingPageDetail, SectionColors, SectionOrderKey, ThemeSettings } from '@/types';

// ─── Visual ─────────────────────────────────────────────────────────
const HERO_VARIANTS: { value: HeroVariant; label: string; hint: string }[] = [
  { value: 'split', label: 'Dividido', hint: 'Texto + foto emoldurada (ou cartão de contato)' },
  { value: 'centered', label: 'Centralizado', hint: 'Mensagem direta, sem foto' },
];

const SECTION_NAMES: Record<string, string> = {
  hero: 'Topo (hero)',
  about: 'Sobre a empresa',
  services: 'Serviços',
  differentials: 'Diferenciais',
  products: 'Produtos',
  gallery: 'Galeria',
  testimonials: 'Depoimentos',
  faq: 'Perguntas frequentes',
  contact: 'Contato',
  final_cta: 'CTA final',
  footer: 'Rodapé',
};

function ColorSlot({ label, value, fallback, onChange, palette }: { label: string; value?: string | null; fallback: string; onChange: (v: string | null) => void; palette: string[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{label}</span>
        {value ? <button type="button" className="text-zinc-400 hover:text-ink" onClick={() => onChange(null)}>padrão</button> : <span className="text-zinc-400">padrão</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <label className={cn('relative size-8 flex-none cursor-pointer overflow-hidden rounded-md ring-1', value ? 'ring-zinc-300' : 'ring-dashed ring-zinc-300')} style={{ background: value ?? fallback }} title="Escolher cor">
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
          {!value ? <span className="absolute inset-0 grid place-items-center text-[9px] font-semibold text-white mix-blend-difference">auto</span> : null}
        </label>
        <div className="flex flex-wrap gap-1">
          {palette.map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} className={cn('size-4 rounded ring-1 ring-black/10', value === c && 'ring-2 ring-ink')} style={{ background: c }} title={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Cores individuais de cada seção (sobrepõem as cores do projeto). */
function SectionColorsEditor({ theme, onChange, content, palette, defaults }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void; content: LandingContent; palette: string[]; defaults: { bg: string; text: string; accent: string } }) {
  const sections = theme.sections ?? {};
  const customs = content.custom_sections ?? [];
  const keys: string[] = ['hero', ...content.section_order.filter((k: SectionOrderKey) => k !== 'final_cta'), 'final_cta', 'footer'];
  const name = (k: string) => (k.startsWith('custom:') ? `★ ${customs.find((c) => c.id === k.slice(7))?.title || 'Seção personalizada'}` : SECTION_NAMES[k] ?? k);
  const update = (key: string, patch: Partial<SectionColors>) => {
    const next = { ...(sections[key] ?? {}), ...patch };
    const all = { ...sections, [key]: next };
    if (!next.bg && !next.text && !next.accent) delete all[key];
    onChange({ ...theme, sections: all });
  };
  const customized = Object.keys(sections).length;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Cores por seção</h4>
        {customized ? <button type="button" className="text-xs text-zinc-500 hover:text-ink" onClick={() => onChange({ ...theme, sections: {} })}>Limpar todas ({customized})</button> : null}
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Defina fundo, texto e destaque de cada seção. Deixe em "auto" para seguir as cores do projeto; o texto é ajustado automaticamente para manter a leitura.
      </p>
      <ul className="space-y-2">
        {keys.map((k) => {
          const c = sections[k] ?? {};
          const on = !!(c.bg || c.text || c.accent);
          return (
            <li key={k} className={cn('rounded-lg border p-3 transition', on ? 'border-zinc-300 bg-zinc-50/60' : 'border-zinc-200')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate text-[13px] font-medium">
                  <span className="size-3 flex-none rounded-sm ring-1 ring-black/10" style={{ background: c.bg ?? defaults.bg }} />
                  {name(k)}
                </span>
                {on ? <button type="button" className="text-[11px] text-zinc-400 hover:text-ink" onClick={() => update(k, { bg: null, text: null, accent: null })}>restaurar</button> : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ColorSlot label="Fundo" value={c.bg} fallback={defaults.bg} palette={palette} onChange={(v) => update(k, { bg: v })} />
                <ColorSlot label="Texto" value={c.text} fallback={defaults.text} palette={palette} onChange={(v) => update(k, { text: v })} />
                <ColorSlot label="Destaque" value={c.accent} fallback={defaults.accent} palette={palette} onChange={(v) => update(k, { accent: v })} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cores escolhidas clicando nos elementos da prévia (modo "Cores"), por layout. */
function ElementColorsSummary({ theme, onChange }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void }) {
  const colors = theme.elementColors ?? { desktop: {}, mobile: {} };
  const rows = [
    { key: 'desktop' as const, label: 'Computador', count: Object.keys(colors.desktop).length },
    { key: 'mobile' as const, label: 'Celular', count: Object.keys(colors.mobile).length },
  ];
  return (
    <div className="border-t border-zinc-100 pt-6">
      <h4 className="mb-1 text-sm font-semibold">Cores e tamanhos de elementos</h4>
      <p className="mb-3 text-xs text-zinc-500">Na prévia, no modo "Textos" clique num texto e use A− / A+ para o tamanho; no modo "Cores" clique em qualquer elemento para mudar cor e tamanho. Celular e computador são independentes.</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-[13px]">
            <span>{r.label}: {r.count ? `${r.count} ${r.count === 1 ? 'elemento personalizado' : 'elementos personalizados'}` : 'nenhum elemento personalizado'}</span>
            {r.count ? (
              <button type="button" className="text-xs text-zinc-500 hover:text-red-600" onClick={() => onChange({ ...theme, elementColors: { ...colors, [r.key]: {} } })}>
                Limpar
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DesignTab({ theme, onChange, content }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void; content: LandingContent }) {
  const { data: presets } = useAsync(() => landingPageService.presets(), []);
  const current = presets?.find((p) => p.key === theme.preset);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Direção visual</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {presets?.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ ...theme, preset: p.key, primary: null, accent: null })}
              className={cn('flex items-center gap-3 rounded-lg border p-3 text-left transition', theme.preset === p.key ? 'border-ink ring-1 ring-ink' : 'border-zinc-200 hover:border-zinc-300')}
            >
              <span className="flex flex-none overflow-hidden rounded-md ring-1 ring-black/5">
                <span className="h-8 w-4" style={{ background: p.bg }} />
                <span className="h-8 w-4" style={{ background: p.primary }} />
                <span className="h-8 w-4" style={{ background: p.accent }} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{p.label.split(' — ')[0]}</span>
                <span className="block truncate text-[11px] text-zinc-500">{p.label.split(' — ')[1] ?? ''} · {p.heading}</span>
              </span>
            </button>
          )) ?? <div className="skeleton h-24 rounded-lg sm:col-span-2" />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(['primary', 'accent'] as const).map((key) => {
          const value = theme[key] ?? (key === 'primary' ? current?.primary : current?.accent) ?? '#000000';
          return (
            <Field key={key} label={key === 'primary' ? 'Cor principal' : 'Cor de destaque'} hint={theme[key] ? 'Personalizada' : 'Padrão do estilo'}>
              <div className="flex gap-2">
                <input type="color" value={value} onChange={(e) => onChange({ ...theme, [key]: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1" />
                <Input value={value} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange({ ...theme, [key]: e.target.value })} className="font-mono uppercase" />
                {theme[key] ? <Button type="button" variant="ghost" onClick={() => onChange({ ...theme, [key]: null })} icon={<RotateCcw className="size-4" />} aria-label="Restaurar" /> : null}
              </div>
            </Field>
          );
        })}
      </div>
      <p className="-mt-3 text-xs text-zinc-500">O contraste é ajustado automaticamente para manter textos e botões legíveis.</p>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Topo da página</h4>
        <div className="grid grid-cols-2 gap-2">
          {HERO_VARIANTS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => onChange({ ...theme, heroVariant: v.value })}
              className={cn('rounded-lg border p-3 text-left transition', theme.heroVariant === v.value ? 'border-ink ring-1 ring-ink' : 'border-zinc-200 hover:border-zinc-300')}
            >
              <span className="block text-[13px] font-medium">{v.label}</span>
              <span className="block text-[11px] text-zinc-500">{v.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <SectionSpacingEditor theme={theme} onChange={onChange} />

      <ElementColorsSummary theme={theme} onChange={onChange} />

      <div className="border-t border-zinc-100 pt-6">
        <SectionColorsEditor
          theme={theme}
          onChange={onChange}
          content={content}
          defaults={{ bg: current?.bg ?? '#ffffff', text: '#111111', accent: theme.primary ?? current?.primary ?? '#1d4ed8' }}
          palette={[...new Set([
            current?.bg ?? '#ffffff',
            '#ffffff',
            '#f5f5f4',
            '#111111',
            theme.primary ?? current?.primary ?? '#1d4ed8',
            theme.accent ?? current?.accent ?? '#0f172a',
          ].map((c) => c.toLowerCase()))]}
        />
      </div>
    </div>
  );
}

function SectionSpacingEditor({ theme, onChange }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void }) {
  const spacing = theme.sectionSpacing ?? {};
  const set = (key: 'desktop' | 'mobile', pct: number) => {
    const next = { ...spacing };
    if (pct >= 100) delete next[key];
    else next[key] = pct;
    onChange({ ...theme, sectionSpacing: next });
  };
  const rows = [
    { key: 'desktop' as const, label: 'Computador' },
    { key: 'mobile' as const, label: 'Celular' },
  ];
  return (
    <div className="border-t border-zinc-100 pt-6">
      <h4 className="mb-1 text-sm font-semibold">Margem interna das seções</h4>
      <p className="mb-3 text-xs text-zinc-500">Espaço acima e abaixo do conteúdo de cada seção. Menor = página mais compacta. Celular e computador são independentes.</p>
      <div className="space-y-3">
        {rows.map((r) => {
          const pct = spacing[r.key] ?? 100;
          return (
            <div key={r.key}>
              <div className="mb-1 flex items-center justify-between text-[13px]">
                <span>{r.label}</span>
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  {pct}%{pct < 100 ? <button type="button" className="hover:text-ink" onClick={() => set(r.key, 100)}>padrão</button> : ' (padrão)'}
                </span>
              </div>
              <input type="range" min={20} max={100} step={5} value={pct} onChange={(e) => set(r.key, Number(e.target.value))} className="w-full accent-zinc-900" aria-label={`Margem interna das seções no ${r.label.toLowerCase()}`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modelo ─────────────────────────────────────────────────────────
/** Miniatura esquemática de cada modelo (estrutura, não cores). */
function TemplateThumb({ template }: { template: TemplateKey }) {
  const bar = (w: string, extra = '') => <span className={cn('block h-1.5 rounded-full bg-zinc-300', extra)} style={{ width: w }} />;
  const hero = {
    classico: (
      <div className="flex gap-2 p-2">
        <div className="flex-1 space-y-1 pt-1">{bar('90%', 'bg-zinc-500')}{bar('70%')}{bar('40%', 'mt-2 h-2 bg-zinc-800')}</div>
        <div className="h-10 w-9 rounded bg-zinc-300" />
      </div>
    ),
    moderno: (
      <div className="flex gap-2 p-2">
        <div className="size-10 rounded-xl bg-zinc-300" />
        <div className="flex-1 space-y-1 pt-2">{bar('85%', 'bg-zinc-500')}{bar('55%')}</div>
      </div>
    ),
    minimalista: (
      <div className="space-y-1 p-2">
        {bar('75%', 'bg-zinc-500')}{bar('45%')}
        <div className="mt-1 h-5 w-full bg-zinc-300" />
      </div>
    ),
    elegante: (
      <div className="flex flex-col items-center gap-1 p-2">
        {bar('70%', 'bg-zinc-500')}{bar('45%')}
        <div className="mt-0.5 h-5 w-4/5 rounded border border-zinc-300 p-0.5"><div className="h-full rounded-sm bg-zinc-300" /></div>
      </div>
    ),
    impacto: (
      <div className="flex gap-2 bg-zinc-800 p-2.5">
        <div className="flex-1 space-y-1 pt-1">{bar('95%', 'h-2.5 bg-white')}{bar('60%', 'bg-zinc-500')}</div>
        <div className="h-10 w-8 bg-zinc-400 shadow-[4px_4px_0_#a1a1aa]" />
      </div>
    ),
  }[template];
  const body = {
    classico: <div className="grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="h-5 rounded border border-zinc-300 bg-white" />)}</div>,
    moderno: <><div className="mx-auto mb-1">{bar('40px', 'mx-auto bg-zinc-500')}</div><div className="grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="grid h-5 place-items-center rounded-lg bg-white shadow"><span className="size-1.5 rounded-full bg-zinc-400" /></div>)}</div></>,
    minimalista: <div className="space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="flex gap-1 border-b border-zinc-200 pb-1">{bar('8px', 'bg-zinc-400')}{bar('55%')}</div>)}</div>,
    elegante: <><div className="mb-1">{bar('40px', 'mx-auto bg-zinc-500')}</div><div className="space-y-1">{[0, 1].map((i) => <div key={i} className="flex gap-1 border-b border-zinc-200 pb-1">{bar('8px', 'bg-zinc-400')}{bar('60%')}</div>)}</div></>,
    impacto: <div className="grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="relative h-5 rounded border-t-2 border-zinc-800 bg-white shadow-sm"><span className="absolute right-0.5 top-0.5 text-[6px] font-bold leading-none text-zinc-300">0{i + 1}</span></div>)}</div>,
  }[template];
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50" aria-hidden>
      {hero}
      <div className={cn('p-2', template === 'minimalista' ? 'bg-white' : 'bg-zinc-100')}>{body}</div>
    </div>
  );
}

export function TemplateTab({ theme, onChange, hasPhoto }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void; hasPhoto: boolean }) {
  const { data: templates } = useAsync(() => landingPageService.templates(), []);
  const current = theme.template ?? 'classico';
  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        O modelo define a estrutura da página e se adapta ao conteúdo: sem foto liberada, o topo usa uma versão sem imagem, e a disposição dos serviços muda conforme a quantidade. As cores e fontes continuam em "Cores e estilo".
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {templates?.map((t) => (
          <button
            key={t.key}
            type="button"
            // Ao trocar de modelo, o topo segue a recomendação do modelo para o conteúdo atual
            onClick={() => onChange({ ...theme, template: t.key, heroVariant: hasPhoto ? t.hero.withPhoto : t.hero.withoutPhoto })}
            className={cn('rounded-lg border p-2.5 text-left transition', current === t.key ? 'border-ink ring-1 ring-ink' : 'border-zinc-200 hover:border-zinc-300')}
            aria-pressed={current === t.key}
          >
            <TemplateThumb template={t.key} />
            <span className="mt-2 flex items-center gap-1.5 text-[13px] font-medium">
              {t.label}
              {current === t.key ? <Check className="size-3.5" /> : null}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{t.description}</span>
          </button>
        )) ?? <div className="skeleton h-48 rounded-lg sm:col-span-2" />}
      </div>
    </div>
  );
}

// ─── Fotos ──────────────────────────────────────────────────────────
const PLACEMENT_LABELS: Record<ImagePlacement, string> = {
  hero: 'Topo da página',
  about: 'Seção "Sobre"',
  gallery: 'Galeria',
  hidden: 'Não usar',
};

/** Mesma regra da renderização: fotos em "Automático" preenchem topo, "sobre" e galeria nessa ordem. */
function resolvePlacements(urls: string[], chosen: Record<string, ImagePlacement>) {
  const visible = urls.filter((u) => chosen[u] !== 'hidden');
  const hero = visible.find((u) => chosen[u] === 'hero') ?? visible.find((u) => !chosen[u]);
  const about = visible.find((u) => u !== hero && chosen[u] === 'about') ?? visible.find((u) => u !== hero && !chosen[u]);
  const out: Record<string, ImagePlacement> = {};
  for (const u of urls) {
    if (chosen[u] === 'hidden') out[u] = 'hidden';
    else if (u === hero) out[u] = 'hero';
    else if (u === about) out[u] = 'about';
    else if (chosen[u] === 'gallery' || !chosen[u]) out[u] = 'gallery';
    else out[u] = 'hidden'; // segunda foto marcada para topo/"sobre": não aparece
  }
  return out;
}

export type NewPhoto = { url: string; source: 'upload' | 'manual' };

/** Envio de arquivos ou URL: as fotos vão para o cadastro da empresa, já liberadas, e entram no início da galeria. */
function AddPhotos({ onAdd }: { onAdd: (photos: NewPhoto[]) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const run = async (task: () => Promise<NewPhoto[]>) => {
    setBusy(true);
    try {
      const photos = await task();
      if (photos.length) {
        await onAdd(photos);
        toast.success(photos.length === 1 ? 'Foto adicionada à galeria.' : `${photos.length} fotos adicionadas à galeria.`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const upload = (files: File[]) =>
    run(async () => {
      const out: NewPhoto[] = [];
      for (const f of files) out.push({ url: (await miscService.upload(f)).url, source: 'upload' });
      return out;
    });
  const addUrl = () =>
    run(async () => {
      const u = url.trim();
      if (!/^https?:\/\//i.test(u)) throw new Error('Informe uma URL começando com http:// ou https://');
      setUrl('');
      return [{ url: u, source: 'manual' }];
    });
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-3">
      <h4 className="mb-1 text-sm font-semibold">Adicionar fotos à galeria</h4>
      <p className="mb-2 text-xs text-zinc-500">As fotos entram no cadastro da empresa, já liberadas para uso, e aparecem no início da galeria.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" loading={busy} icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Enviar fotos</Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) void upload(files);
          }}
        />
        <div className="flex w-full min-w-0 gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addUrl())} placeholder="https://… (URL da foto)" className="h-9 min-w-0 text-[13px]" />
          <Button type="button" variant="secondary" size="sm" disabled={busy || !url.trim()} icon={<Link2 className="size-4" />} onClick={() => void addUrl()}>Adicionar</Button>
        </div>
      </div>
    </div>
  );
}

export function PhotosTab({ theme, onChange, images, onAddPhotos }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void; images: CompanyImage[] | null; onAddPhotos: (photos: NewPhoto[]) => Promise<void> }) {
  // Ordem provisória enquanto uma foto está sendo arrastada
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  if (!images) return <div className="skeleton h-40 rounded-lg" />;
  const photos = images.filter((i) => i.type !== 'logo');
  const blocked = photos.filter((i) => !i.usage_allowed);
  // Mesma ordem da renderização: a escolhida no editor e, depois, a da empresa
  const saved = theme.imageOrder ?? [];
  const rank = (order: string[], url: string, index: number) => (order.includes(url) ? order.indexOf(url) : order.length + index);
  const order = dragOrder ?? saved;
  const allowed = photos
    .filter((i) => i.usage_allowed)
    .map((img, index) => ({ img, index }))
    .sort((a, b) => rank(order, a.img.url, a.index) - rank(order, b.img.url, b.index))
    .map(({ img }) => img);

  const dragOver = (overUrl: string) => {
    if (!dragging || dragging === overUrl) return;
    const urls = allowed.map((i) => i.url).filter((u) => u !== dragging);
    urls.splice(urls.indexOf(overUrl) + (allowed.findIndex((i) => i.url === dragging) < allowed.findIndex((i) => i.url === overUrl) ? 1 : 0), 0, dragging);
    setDragOrder(urls);
  };
  const dragEnd = () => {
    if (dragOrder) onChange({ ...theme, imageOrder: dragOrder });
    setDragOrder(null);
    setDragging(null);
  };
  const chosen = theme.images ?? {};
  const resolved = resolvePlacements(allowed.map((i) => i.url), chosen);
  const galleryCount = Object.values(resolved).filter((p) => p === 'gallery').length;

  const setPlacement = (url: string, value: ImagePlacement | '') => {
    const next = { ...chosen };
    // Topo e "sobre" mostram uma foto só: a anterior volta para o automático
    if (value === 'hero' || value === 'about') for (const u of Object.keys(next)) if (next[u] === value) delete next[u];
    if (value) next[url] = value;
    else delete next[url];
    onChange({ ...theme, images: next });
  };

  const addPhotos = async (photos: NewPhoto[]) => {
    await onAddPhotos(photos);
    const urls = photos.map((p) => p.url);
    const nextImages = { ...chosen };
    for (const u of urls) nextImages[u] = 'gallery';
    // Novas fotos primeiro na ordem: marcadas como galeria, não tomam o lugar do topo nem de "sobre"
    onChange({ ...theme, images: nextImages, imageOrder: [...urls, ...allowed.map((i) => i.url).filter((u) => !urls.includes(u))] });
  };

  if (!allowed.length) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-500">
          Nenhuma foto liberada para uso. Adicione fotos abaixo ou libere as fotos coletadas em "Editar empresa".
        </p>
        <AddPhotos onAdd={addPhotos} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Escolha onde cada foto aparece e arraste pela alça para mudar a ordem. Em "Automático", as fotos preenchem o topo, a seção "Sobre" e a galeria, seguindo a ordem da lista.
      </p>
      {theme.heroVariant === 'centered' ? (
        <p className="text-xs text-amber-700">O topo está no estilo "Centralizado", que não exibe foto. Para mostrar a foto do topo, escolha "Dividido" ou "Imagem cheia" em "Cores e estilo".</p>
      ) : null}
      {galleryCount === 1 ? <p className="text-xs text-amber-700">A galeria só aparece com pelo menos 2 fotos.</p> : null}
      {galleryCount > 9 ? <p className="text-xs text-amber-700">A galeria mostra até 9 fotos: as {galleryCount - 9} últimas da lista ficam de fora.</p> : null}

      <AddPhotos onAdd={addPhotos} />

      <ul className="space-y-2">
        {allowed.map((img) => (
          <li
            key={img.url}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', img.url);
              // Mudar o elemento durante o dragstart cancela o arrasto no Chrome: aplica o destaque em seguida
              setTimeout(() => setDragging(img.url), 0);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              dragOver(img.url);
            }}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={dragEnd}
            className={cn('flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 transition', dragging === img.url && 'opacity-50 ring-2 ring-brand-500')}
          >
            <span className="cursor-grab text-zinc-400 hover:text-ink active:cursor-grabbing" title="Arraste para reordenar" aria-hidden>
              <GripVertical className="size-4" />
            </span>
            <PhotoThumb url={img.url} alt={img.alt_text ?? ''} dimmed={resolved[img.url] === 'hidden'} />
            <div className="min-w-0 flex-1">
              <Select className="h-9 text-[13px]" value={chosen[img.url] ?? ''} onChange={(e) => setPlacement(img.url, e.target.value as ImagePlacement | '')}>
                <option value="">Automático{chosen[img.url] ? '' : ` (${PLACEMENT_LABELS[resolved[img.url]]})`}</option>
                {(Object.keys(PLACEMENT_LABELS) as ImagePlacement[]).map((p) => (
                  <option key={p} value={p}>{PLACEMENT_LABELS[p]}</option>
                ))}
              </Select>
              {img.alt_text ? <p className="mt-1 truncate text-[11px] text-zinc-500">{img.alt_text}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      {blocked.length ? (
        <p className="text-xs text-zinc-500">
          {blocked.length} {blocked.length === 1 ? 'foto está' : 'fotos estão'} sem permissão de uso e não {blocked.length === 1 ? 'aparece' : 'aparecem'} na página. Libere em "Editar empresa".
        </p>
      ) : null}
    </div>
  );
}

function PhotoThumb({ url, alt, dimmed }: { url: string; alt: string; dimmed: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn('size-16 flex-none overflow-hidden rounded-md bg-zinc-100', dimmed && 'opacity-40')}>
      {broken ? (
        <div className="grid h-full place-items-center text-zinc-400"><ImageOff className="size-5" /></div>
      ) : (
        <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

// ─── SEO ────────────────────────────────────────────────────────────
export interface SeoState {
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  og_image: string | null;
}

export function SeoTab({ seo, onChange, slug }: { seo: SeoState; onChange: (s: SeoState) => void; slug: string }) {
  const t = seo.seo_title ?? '';
  const d = seo.seo_description ?? '';
  return (
    <div className="space-y-4">
      <Field label="Title" hint={<span className={t.length > 60 ? 'text-amber-600' : ''}>{t.length}/60 caracteres recomendados</span>}>
        <Input value={t} onChange={(e) => onChange({ ...seo, seo_title: e.target.value || null })} />
      </Field>
      <Field label="Meta description" hint={<span className={d.length > 160 || (d.length > 0 && d.length < 110) ? 'text-amber-600' : ''}>{d.length}/160 caracteres (ideal entre 120 e 160)</span>}>
        <Textarea value={d} onChange={(e) => onChange({ ...seo, seo_description: e.target.value || null })} />
      </Field>
      <ListEditor label="Palavras-chave" values={seo.seo_keywords} onChange={(v) => onChange({ ...seo, seo_keywords: v })} />
      <Field label="Imagem Open Graph (opcional)" hint="Se vazio, usa a primeira imagem liberada ou o logotipo.">
        <Input value={seo.og_image ?? ''} onChange={(e) => onChange({ ...seo, og_image: e.target.value || null })} placeholder="https://…" />
      </Field>
      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="text-[11px] uppercase tracking-wider text-zinc-400">Prévia no Google</div>
        <div className="mt-2 truncate text-xs text-emerald-800">…/lp/{slug}</div>
        <div className="truncate text-[17px] text-[#1a0dab]">{t || 'Título da página'}</div>
        <div className="line-clamp-2 text-[13px] text-zinc-600">{d || 'Descrição da página.'}</div>
      </div>
    </div>
  );
}

// ─── Publicação: URL e domínio ──────────────────────────────────────
const DOMAIN_STATUS: Record<string, { label: string; icon: typeof Check; cls: string }> = {
  none: { label: 'Não configurado', icon: Globe, cls: 'text-zinc-500' },
  pending: { label: 'Aguardando DNS', icon: Clock, cls: 'text-amber-600' },
  verified: { label: 'DNS verificado', icon: CheckCircle2, cls: 'text-emerald-600' },
  active: { label: 'Ativo', icon: CheckCircle2, cls: 'text-emerald-600' },
  error: { label: 'DNS não aponta para o servidor', icon: XCircle, cls: 'text-red-600' },
};

export function PublishTab({ lp, onUpdated }: { lp: LandingPageDetail; onUpdated: () => void }) {
  const [slug, setSlug] = useState(lp.slug);
  const [domain, setDomain] = useState(lp.custom_domain ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [verification, setVerification] = useState<{ ok: boolean; expected: { cname: string; a: string[] }; found: { cname: string[]; a: string[] } } | null>(null);
  const base = lp.path_url.replace(/\/lp\/[^/]+$/, '');
  const st = DOMAIN_STATUS[lp.domain_status] ?? DOMAIN_STATUS.none;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      onUpdated();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-1 text-sm font-semibold">Endereço da página</h4>
        <p className="mb-3 text-xs text-zinc-500">Único, sem acentos e sem caracteres especiais.</p>
        <div className="flex gap-2">
          <div className="flex h-10 flex-1 items-center overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100">
            <span className="hidden whitespace-nowrap border-r border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 sm:block">/lp/</span>
            <input className="h-full min-w-0 flex-1 px-3 text-sm outline-none" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
          </div>
          <Button variant="secondary" disabled={slug === lp.slug} loading={busy === 'slug'} onClick={() => run('slug', () => landingPageService.updateSettings(lp.id, { slug }), 'Endereço atualizado.')}>
            Salvar
          </Button>
        </div>
        <button type="button" onClick={async () => (await copyToClipboard(lp.path_url)) && toast.success('URL copiada.')} className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-ink">
          <Copy className="size-3.5" /> {lp.path_url}
        </button>
      </div>

      <div className="border-t border-zinc-100 pt-6">
        <h4 className="mb-1 text-sm font-semibold">Domínio personalizado</h4>
        <p className="mb-3 text-xs text-zinc-500">Ex.: www.empresa.com.br passa a exibir esta Landing Page diretamente.</p>
        <div className="flex gap-2">
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.empresa.com.br" />
          <Button
            variant="secondary"
            disabled={(domain || null) === lp.custom_domain}
            loading={busy === 'domain'}
            onClick={() => run('domain', () => landingPageService.updateSettings(lp.id, { custom_domain: domain.trim() || null }), domain.trim() ? 'Domínio salvo.' : 'Domínio removido.')}
          >
            Salvar
          </Button>
        </div>
        {lp.custom_domain ? (
          <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className={cn('flex items-center gap-1.5 font-medium', st.cls)}><st.icon className="size-4" /> {st.label}</span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'verify'}
                onClick={async () => {
                  setBusy('verify');
                  try {
                    const r = await landingPageService.verifyDomain(lp.id);
                    setVerification(r.verification);
                    toast[r.verification.ok ? 'success' : 'error'](r.verification.ok ? 'DNS verificado.' : 'O DNS ainda não aponta para o servidor.');
                    onUpdated();
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Verificar DNS
              </Button>
            </div>
            <div className="mt-3 space-y-1 text-xs text-zinc-600">
              <p>No provedor do domínio, crie um registro:</p>
              <p className="rounded bg-zinc-50 px-2 py-1.5 font-mono">CNAME {lp.custom_domain} → {new URL(base).hostname}</p>
              <p>Para domínio raiz (sem www), use um registro A com o IP do servidor.</p>
              <p className="flex items-center gap-1.5 pt-1"><ShieldAlert className="size-3.5" /> HTTPS: emitido automaticamente pelo proxy (ver README → Domínios personalizados). SSL: {lp.ssl_status}.</p>
            </div>
            {verification && !verification.ok ? (
              <p className="mt-3 text-xs text-red-600">
                Encontrado: {verification.found.cname.join(', ') || verification.found.a.join(', ') || 'nenhum registro'}. Esperado: CNAME {verification.expected.cname}
                {verification.expected.a.length ? ` ou A ${verification.expected.a.join(', ')}` : ''}.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Versões ────────────────────────────────────────────────────────
export function VersionsTab({ lp, onRestored }: { lp: LandingPageDetail; onRestored: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {lp.versions.map((v) => (
        <li key={v.version} className="flex items-center gap-3 px-4 py-3">
          <span className={cn('grid size-8 flex-none place-items-center rounded-md text-xs font-semibold', v.version === lp.current_version ? 'bg-ink text-white' : 'bg-zinc-100 text-zinc-600')}>
            v{v.version}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{v.note ?? 'Versão'}</div>
            <div className="text-xs text-zinc-500">{formatDate(v.created_at, true)}{v.author ? ` · ${v.author}` : ''}</div>
          </div>
          {v.version === lp.current_version ? (
            <span className="text-xs text-zinc-500">Atual</span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === v.version}
              onClick={async () => {
                setBusy(v.version);
                try {
                  await landingPageService.restore(lp.id, v.version);
                  toast.success(`Versão ${v.version} restaurada.`);
                  onRestored();
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setBusy(null);
                }
              }}
            >
              Restaurar
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
