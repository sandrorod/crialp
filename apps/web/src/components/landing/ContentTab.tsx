import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import { Button, Field, Input, ListEditor, Select, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/utils';
import { companyService, landingPageService } from '@/services';
import { BlocksEditor, NewSectionButton, newId } from './SectionBlocks';
import type { Company, CustomSection, LandingContent, SectionKey, SectionOrderKey } from '@/types';

const SECTION_LABELS: Record<SectionKey, string> = {
  about: 'Sobre a empresa',
  services: 'Serviços',
  differentials: 'Diferenciais',
  products: 'Produtos',
  gallery: 'Galeria',
  testimonials: 'Depoimentos',
  faq: 'Perguntas frequentes',
  contact: 'Contato',
  final_cta: 'CTA final',
};
const ALL_SECTIONS = Object.keys(SECTION_LABELS) as SectionKey[];
const REQUIRED: SectionKey[] = ['contact', 'final_cta'];

const ICONS = [
  'check', 'star', 'shield', 'clock', 'heart', 'users', 'sparkles', 'calendar', 'briefcase', 'home', 'building',
  'wrench', 'zap', 'target', 'award', 'leaf', 'truck', 'smile', 'package', 'chart', 'lightbulb', 'scale',
  'dumbbell', 'utensils', 'car', 'scissors', 'stethoscope', 'graduation', 'code', 'camera', 'globe', 'tooth',
  'sliders', 'phone', 'mail', 'map-pin', 'message',
];

const LABEL_FIELDS: { key: string; label: string }[] = [
  { key: 'header_cta', label: 'Botão do cabeçalho' },
  { key: 'eyebrow_about', label: 'Sobretítulo — Sobre' },
  { key: 'eyebrow_services', label: 'Sobretítulo — Serviços' },
  { key: 'eyebrow_differentials', label: 'Sobretítulo — Diferenciais' },
  { key: 'eyebrow_products', label: 'Sobretítulo — Produtos' },
  { key: 'eyebrow_gallery', label: 'Sobretítulo — Galeria' },
  { key: 'eyebrow_testimonials', label: 'Sobretítulo — Depoimentos' },
  { key: 'eyebrow_faq', label: 'Sobretítulo — Perguntas' },
  { key: 'eyebrow_contact', label: 'Sobretítulo — Contato' },
  { key: 'nav_about', label: 'Menu — Sobre' },
  { key: 'nav_services', label: 'Menu — Serviços' },
  { key: 'nav_differentials', label: 'Menu — Diferenciais' },
  { key: 'nav_products', label: 'Menu — Produtos' },
  { key: 'nav_gallery', label: 'Menu — Galeria' },
  { key: 'nav_faq', label: 'Menu — Dúvidas' },
  { key: 'nav_contact', label: 'Menu — Contato' },
  { key: 'whatsapp_float', label: 'Botão flutuante do WhatsApp' },
  { key: 'whatsapp_message', label: 'Mensagem inicial do WhatsApp ({empresa} = nome)' },
  { key: 'contact_whatsapp', label: 'Contato — rótulo WhatsApp' },
  { key: 'contact_phone', label: 'Contato — rótulo Telefone' },
  { key: 'contact_email', label: 'Contato — rótulo E-mail' },
  { key: 'contact_address', label: 'Contato — rótulo Endereço' },
  { key: 'contact_hours', label: 'Contato — rótulo Horário' },
  { key: 'fact_specialty', label: 'Ficha — Especialidade' },
  { key: 'fact_location', label: 'Ficha — Localização' },
  { key: 'fact_hours', label: 'Ficha — Atendimento' },
  { key: 'fact_audience', label: 'Ficha — Público' },
  { key: 'testimonial_more', label: 'Depoimentos — "Ler mais"' },
  { key: 'testimonial_less', label: 'Depoimentos — "Ler menos"' },
  { key: 'footer_note', label: 'Rodapé — texto (vazio = endereço)' },
  { key: 'skip_link', label: 'Acessibilidade — link "pular para o conteúdo"' },
];

/** Lista trechos do site (texto integral guardado) para inserir numa seção com um clique. */
function SitePicker({ companyId, onPick, onClose }: { companyId: string; onPick: (text: string) => void; onClose: () => void }) {
  const { data, loading } = useAsync(() => companyService.sources(companyId), [companyId]);
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const blocks = (data?.pages ?? []).flatMap((p) =>
    p.content
      .split('\n')
      .map((l) => l.replace(/^## /, '').trim())
      .filter((l) => l.length > 2)
      .map((l) => ({ page: p.title || p.url, text: l })),
  );
  const shown = (t ? blocks.filter((b) => b.text.toLowerCase().includes(t)) : blocks).slice(0, 300);
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
          <Input className="h-8 pl-8 text-xs" placeholder="Buscar no texto do site…" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-200" aria-label="Fechar"><X className="size-4" /></button>
      </div>
      {loading ? (
        <p className="text-xs text-zinc-500">Carregando…</p>
      ) : !blocks.length ? (
        <p className="text-xs text-zinc-500">Sem conteúdo do site guardado. Em "Editar empresa", use "Ler o site agora".</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {shown.map((b, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(b.text)} className="w-full rounded-md bg-white px-2.5 py-1.5 text-left text-xs text-zinc-700 ring-1 ring-zinc-200 hover:ring-brand-500">
                {b.text}
                <span className="mt-0.5 block truncate text-[10px] text-zinc-400">{b.page}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomSectionEditor({ section, onChange, company }: { section: CustomSection; onChange: (s: CustomSection) => void; company?: Company | null }) {
  const companyId = company?.id;
  const [picker, setPicker] = useState<null | 'paragraphs' | 'items'>(null);
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Sobretítulo (opcional)" value={section.eyebrow ?? ''} onChange={(e) => onChange({ ...section, eyebrow: e.target.value || null })} />
        <Input placeholder="Título da seção" value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} className="font-medium" />
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-600">
        Alinhamento:
        {(['left', 'center'] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange({ ...section, align: a })}
            className={cn('rounded-md px-2 py-1', (section.align ?? 'left') === a ? 'bg-ink text-white' : 'bg-white ring-1 ring-zinc-200 hover:ring-zinc-300')}
          >
            {a === 'left' ? 'À esquerda' : 'Centralizado'}
          </button>
        ))}
      </div>
      <BlocksEditor blocks={section.blocks ?? []} onChange={(blocks) => onChange({ ...section, blocks })} company={company} />
      <Field label="Texto corrido (opcional)" hint="Separe os parágrafos com uma linha em branco.">
        <Textarea
          className="min-h-[80px]"
          value={section.paragraphs.join('\n\n')}
          onChange={(e) => onChange({ ...section, paragraphs: e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) })}
        />
      </Field>
      <ListEditor label="Lista (opcional — ex.: unidades, especialidades, convênios)" values={section.items} onChange={(items) => onChange({ ...section, items })} />
      {companyId ? (
        picker ? (
          <SitePicker
            companyId={companyId}
            onClose={() => setPicker(null)}
            onPick={(text) => onChange(picker === 'items' ? { ...section, items: [...section.items, text] } : { ...section, paragraphs: [...section.paragraphs, text] })}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" icon={<FileText className="size-3.5" />} onClick={() => setPicker('paragraphs')}>Inserir texto do site</Button>
            <Button type="button" variant="secondary" size="sm" icon={<FileText className="size-3.5" />} onClick={() => setPicker('items')}>Inserir item do site na lista</Button>
          </div>
        )
      ) : null}
    </>
  );
}

// ─── Blocos de interface ────────────────────────────────────────────
function Group({ title, children, actions, empty }: { title: string; children?: ReactNode; actions?: ReactNode; empty?: boolean }) {
  return (
    <details open={!empty} className="group rounded-lg border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className={cn(empty && 'text-zinc-400')}>{title}</span>
        <span className="flex items-center gap-2" onClick={(e) => actions && e.preventDefault()}>
          {actions}
          {!actions ? <span className="text-xs font-normal text-zinc-400 group-open:hidden">expandir</span> : null}
        </span>
      </summary>
      {children ? <div className="space-y-3 border-t border-zinc-100 p-4">{children}</div> : null}
    </details>
  );
}

function Txt({ label, value, onChange, area, placeholder }: { label: string; value: string | null | undefined; onChange: (v: string) => void; area?: boolean; placeholder?: string }) {
  return (
    <Field label={label}>
      {area ? (
        <Textarea value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select className="h-9 w-36 text-xs" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Ícone">
      {ICONS.map((i) => <option key={i} value={i}>ícone: {i}</option>)}
    </Select>
  );
}

/** Lista editável genérica: adicionar, remover e reordenar itens. */
function ItemList<T>({ items, onChange, create, addLabel, render }: { items: T[]; onChange: (v: T[]) => void; create: () => T; addLabel: string; render: (item: T, update: (patch: Partial<T>) => void) => ReactNode }) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-md border border-zinc-100 bg-zinc-50/50 p-3">
          <div className="mb-2 flex items-center gap-1">
            <span className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Item {i + 1}</span>
            <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="size-3.5" /></button>
            <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="size-3.5" /></button>
            <button type="button" className="rounded p-1 text-zinc-500 hover:bg-red-100 hover:text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 className="size-3.5" /></button>
          </div>
          <div className="space-y-2">{render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}</div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...items, create()])}>
        {addLabel}
      </Button>
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────
export function ContentTab({ content, onChange, company }: { content: LandingContent; onChange: (c: LandingContent) => void; company?: Company | null }) {
  const { data: defaults } = useAsync(() => landingPageService.labels(), []);
  const set = <K extends keyof LandingContent>(key: K, v: LandingContent[K]) => onChange({ ...content, [key]: v });
  const order = content.section_order;
  const customs = content.custom_sections ?? [];
  const sectionName = (k: SectionOrderKey) =>
    k.startsWith('custom:') ? `★ ${customs.find((c) => c.id === k.slice(7))?.title || 'Seção personalizada'}` : SECTION_LABELS[k as SectionKey];
  const allKeys: SectionOrderKey[] = [...ALL_SECTIONS, ...customs.map((c) => `custom:${c.id}` as SectionOrderKey)];

  /** Cria uma seção que não existia e a coloca antes do contato. */
  const createSection = <K extends keyof LandingContent>(key: K & SectionKey, value: LandingContent[K]) => {
    const next = order.filter((k) => k !== key);
    const at = next.indexOf('contact');
    next.splice(at >= 0 ? at : next.length, 0, key);
    onChange({ ...content, [key]: value, section_order: next });
  };
  const hidden = content.hidden_sections ?? [];
  const isHidden = (k: SectionOrderKey) => hidden.includes(k);
  const removeSection = (key: 'about' | 'services' | 'differentials' | 'products' | 'gallery' | 'faq') =>
    onChange({ ...content, [key]: null, section_order: order.filter((k) => k !== key), hidden_sections: hidden.filter((k) => k !== key) });
  /** Desativa (sai do site, mas fica salva e no lugar) ou reativa a seção. */
  const setHidden = (k: SectionOrderKey, off: boolean) =>
    onChange({
      ...content,
      hidden_sections: off ? [...hidden.filter((x) => x !== k), k] : hidden.filter((x) => x !== k),
      // Reativar uma seção que estava fora da ordem a coloca antes do contato
      section_order: off || order.includes(k) ? order : [...order.filter((x) => !REQUIRED.includes(x as SectionKey)), k, ...REQUIRED.filter((r) => order.includes(r))],
    });

  const move = (k: SectionOrderKey, dir: -1 | 1) => {
    const i = order.indexOf(k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    set('section_order', next);
  };
  const toggle = (k: SectionOrderKey) => setHidden(k, order.includes(k) && !isHidden(k));

  const addCustom = (section: Omit<CustomSection, 'id'>) => {
    const id = newId();
    const next = order.filter(() => true);
    const at = next.indexOf('contact');
    next.splice(at >= 0 ? at : next.length, 0, `custom:${id}`);
    onChange({ ...content, custom_sections: [...customs, { id, ...section }], section_order: next });
  };
  const updateCustom = (s: CustomSection) => set('custom_sections', customs.map((c) => (c.id === s.id ? s : c)));
  const removeCustom = (id: string) =>
    onChange({ ...content, custom_sections: customs.filter((c) => c.id !== id), section_order: order.filter((k) => k !== `custom:${id}`), hidden_sections: hidden.filter((k) => k !== `custom:${id}`) });

  const createBtn = (onClick: () => void) => (
    <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={onClick}>Criar seção</Button>
  );
  const hideBtn = (k: SectionOrderKey) => {
    const off = isHidden(k) || !order.includes(k);
    return (
      <button
        type="button"
        className={cn('flex items-center gap-1 rounded px-1.5 py-1 text-xs font-normal hover:bg-zinc-100', off ? 'text-amber-600' : 'text-zinc-400 hover:text-zinc-700')}
        title={off ? 'Ativar seção (volta a aparecer no site)' : 'Desativar seção (some do site, mas fica salva)'}
        onClick={() => setHidden(k, !off)}
      >
        {off ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {off ? 'Desativada' : null}
      </button>
    );
  };
  const removeBtn = (key: Parameters<typeof removeSection>[0]) => (
    <>
      {hideBtn(key)}
      <button type="button" className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Excluir seção" onClick={() => removeSection(key)}>
        <Trash2 className="size-4" />
      </button>
    </>
  );
  const labels = content.labels ?? {};

  return (
    <div className="space-y-3">
      <Group title="Seções e ordem">
        <p className="text-xs text-zinc-500">O olho desativa a seção: ela some do site, mas o conteúdo e a posição ficam salvos. Seções sem dados reais (ex.: depoimentos inexistentes ou galeria sem fotos liberadas) não aparecem, mesmo se ativadas.</p>
        <ul className="space-y-1">
          {[...order, ...allKeys.filter((k) => !order.includes(k))].map((k) => {
            const on = order.includes(k) && !isHidden(k);
            return (
              <li key={k} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', on ? 'bg-zinc-50' : 'opacity-60')}>
                <span className="flex-1 truncate text-sm">{sectionName(k)}</span>
                {order.includes(k) ? (
                  <>
                    <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-200" onClick={() => move(k, -1)} aria-label="Subir"><ArrowUp className="size-3.5" /></button>
                    <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-200" onClick={() => move(k, 1)} aria-label="Descer"><ArrowDown className="size-3.5" /></button>
                  </>
                ) : null}
                <button type="button" disabled={REQUIRED.includes(k as SectionKey)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30" onClick={() => toggle(k)} title={on ? 'Desativar seção' : 'Ativar seção'} aria-label={on ? 'Desativar seção' : 'Ativar seção'}>
                  {on ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group
        title={`Seções personalizadas (${customs.length})`}
        actions={<NewSectionButton onCreate={addCustom} />}
      >
        <p className="text-xs text-zinc-500">
          Crie seções com títulos, textos, fotos, ícones e botões, com informações do site que não entraram automaticamente (unidades, convênios, história…) ou conteúdo próprio. A nova seção entra antes do contato; mude a posição em "Seções e ordem".
        </p>
        {customs.map((c) => (
          <div key={c.id} className="space-y-2 rounded-md border border-zinc-100 bg-zinc-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{c.title || 'Seção personalizada'}</span>
              <span className="flex items-center gap-1">
                {hideBtn(`custom:${c.id}`)}
                <button type="button" className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Excluir seção" onClick={() => removeCustom(c.id)}><Trash2 className="size-4" /></button>
              </span>
            </div>
            <CustomSectionEditor section={c} onChange={updateCustom} company={company} />
          </div>
        ))}
      </Group>

      <Group title="Hero (topo da página)">
        <Txt label="Linha de apoio (acima do título)" value={content.hero.eyebrow} onChange={(v) => set('hero', { ...content.hero, eyebrow: v || null })} />
        <Txt label="Título principal" area value={content.hero.headline} onChange={(v) => set('hero', { ...content.hero, headline: v })} />
        <Txt label="Subtítulo" area value={content.hero.subheadline} onChange={(v) => set('hero', { ...content.hero, subheadline: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Txt label="Botão principal" value={content.hero.primary_cta} onChange={(v) => set('hero', { ...content.hero, primary_cta: v })} />
          <Txt label="Botão secundário" value={content.hero.secondary_cta} onChange={(v) => set('hero', { ...content.hero, secondary_cta: v || null })} placeholder="(vazio = sem botão)" />
        </div>
        <ListEditor label="Destaques (abaixo dos botões)" values={content.hero.highlights} onChange={(v) => set('hero', { ...content.hero, highlights: v })} />
      </Group>

      {content.about ? (
        <Group title="Sobre a empresa" actions={removeBtn('about')}>
          <Txt label="Título" value={content.about.title} onChange={(v) => set('about', { ...content.about!, title: v })} />
          <Field label="Texto" hint="Separe os parágrafos com uma linha em branco.">
            <Textarea
              className="min-h-[180px]"
              value={content.about.paragraphs.join('\n\n')}
              onChange={(e) => set('about', { ...content.about!, paragraphs: e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) })}
            />
          </Field>
        </Group>
      ) : (
        <Group title="Sobre a empresa (sem seção)" empty actions={createBtn(() => createSection('about', { title: 'Sobre nós', paragraphs: company?.description ? [company.description] : [] }))} />
      )}

      {content.services ? (
        <Group title={`Serviços (${content.services.items.length})`} actions={removeBtn('services')}>
          <Txt label="Título" value={content.services.title} onChange={(v) => set('services', { ...content.services!, title: v })} />
          <Txt label="Subtítulo" value={content.services.subtitle} onChange={(v) => set('services', { ...content.services!, subtitle: v || null })} />
          <ItemList
            items={content.services.items}
            onChange={(items) => set('services', { ...content.services!, items })}
            create={() => ({ name: '', description: '', benefit: null, icon: 'check' })}
            addLabel="Serviço"
            render={(it, up) => (
              <>
                <div className="flex gap-2">
                  <Input placeholder="Nome" value={it.name} onChange={(e) => up({ name: e.target.value })} className="font-medium" />
                  <IconSelect value={it.icon} onChange={(icon) => up({ icon })} />
                </div>
                <Textarea className="min-h-[64px]" placeholder="Descrição" value={it.description} onChange={(e) => up({ description: e.target.value })} />
                <Input placeholder="Benefício (opcional)" value={it.benefit ?? ''} onChange={(e) => up({ benefit: e.target.value || null })} />
              </>
            )}
          />
        </Group>
      ) : (
        <Group
          title="Serviços (sem seção)"
          empty
          actions={createBtn(() =>
            createSection('services', {
              title: 'Nossos serviços',
              subtitle: null,
              items: (company?.services ?? []).map((s) => ({ name: s.name, description: s.description ?? '', benefit: s.benefits[0] ?? null, icon: 'check' })),
            }),
          )}
        />
      )}

      {content.differentials ? (
        <Group title={`Diferenciais (${content.differentials.items.length})`} actions={removeBtn('differentials')}>
          <Txt label="Título" value={content.differentials.title} onChange={(v) => set('differentials', { ...content.differentials!, title: v })} />
          <Txt label="Subtítulo" value={content.differentials.subtitle} onChange={(v) => set('differentials', { ...content.differentials!, subtitle: v || null })} />
          <ItemList
            items={content.differentials.items}
            onChange={(items) => set('differentials', { ...content.differentials!, items })}
            create={() => ({ title: '', description: '', icon: 'star' })}
            addLabel="Diferencial"
            render={(it, up) => (
              <>
                <div className="flex gap-2">
                  <Input placeholder="Título" value={it.title} onChange={(e) => up({ title: e.target.value })} className="font-medium" />
                  <IconSelect value={it.icon} onChange={(icon) => up({ icon })} />
                </div>
                <Textarea className="min-h-[64px]" placeholder="Descrição" value={it.description} onChange={(e) => up({ description: e.target.value })} />
              </>
            )}
          />
        </Group>
      ) : (
        <Group
          title="Diferenciais (sem seção)"
          empty
          actions={createBtn(() =>
            createSection('differentials', {
              title: 'Por que nos escolher',
              subtitle: null,
              items: (company?.commercial_info.differentials ?? []).map((d) => ({ title: d, description: '', icon: 'star' })),
            }),
          )}
        />
      )}

      {content.products ? (
        <Group title={`Produtos (${content.products.items.length})`} actions={removeBtn('products')}>
          <Txt label="Título" value={content.products.title} onChange={(v) => set('products', { ...content.products!, title: v })} />
          <Txt label="Subtítulo" value={content.products.subtitle} onChange={(v) => set('products', { ...content.products!, subtitle: v || null })} />
          <ItemList
            items={content.products.items}
            onChange={(items) => set('products', { ...content.products!, items })}
            create={() => ({ name: '', description: '', features: [] })}
            addLabel="Produto"
            render={(it, up) => (
              <>
                <Input placeholder="Nome" value={it.name} onChange={(e) => up({ name: e.target.value })} className="font-medium" />
                <Textarea className="min-h-[64px]" placeholder="Descrição" value={it.description} onChange={(e) => up({ description: e.target.value })} />
                <ListEditor label="Características" values={it.features} onChange={(features) => up({ features })} />
              </>
            )}
          />
        </Group>
      ) : (
        <Group
          title="Produtos (sem seção)"
          empty
          actions={createBtn(() =>
            createSection('products', {
              title: 'Nossos produtos',
              subtitle: null,
              items: (company?.products ?? []).map((p) => ({ name: p.name, description: p.description ?? '', features: p.features })),
            }),
          )}
        />
      )}

      {content.gallery ? (
        <Group title="Galeria" actions={removeBtn('gallery')}>
          <p className="text-xs text-zinc-500">As fotos vêm das imagens liberadas da empresa (Editar empresa → Imagens).</p>
          <Txt label="Título" value={content.gallery.title} onChange={(v) => set('gallery', { ...content.gallery!, title: v })} />
          <Txt label="Subtítulo" value={content.gallery.subtitle} onChange={(v) => set('gallery', { ...content.gallery!, subtitle: v || null })} />
        </Group>
      ) : (
        <Group title="Galeria (sem seção)" empty actions={createBtn(() => createSection('gallery', { title: 'Conheça nosso espaço', subtitle: null }))} />
      )}

      <Group title="Depoimentos" actions={hideBtn('testimonials')}>
        <p className="text-xs text-zinc-500">
          Os depoimentos são sempre os reais, cadastrados na empresa (Editar empresa → Depoimentos). A seção só aparece se houver algum.
        </p>
        <Txt label="Título" value={content.testimonials?.title ?? ''} placeholder="O que dizem nossos clientes" onChange={(v) => set('testimonials', v ? { title: v } : null)} />
      </Group>

      {content.faq ? (
        <Group title={`Perguntas frequentes (${content.faq.items.length})`} actions={removeBtn('faq')}>
          <Txt label="Título" value={content.faq.title} onChange={(v) => set('faq', { ...content.faq!, title: v })} />
          <ItemList
            items={content.faq.items}
            onChange={(items) => set('faq', { ...content.faq!, items })}
            create={() => ({ question: '', answer: '' })}
            addLabel="Pergunta"
            render={(it, up) => (
              <>
                <Input placeholder="Pergunta" value={it.question} onChange={(e) => up({ question: e.target.value })} className="font-medium" />
                <Textarea className="min-h-[64px]" placeholder="Resposta (somente informações reais)" value={it.answer} onChange={(e) => up({ answer: e.target.value })} />
              </>
            )}
          />
        </Group>
      ) : (
        <Group title="Perguntas frequentes (sem seção)" empty actions={createBtn(() => createSection('faq', { title: 'Perguntas frequentes', items: [] }))} />
      )}

      <Group title="Contato">
        <p className="text-xs text-zinc-500">Telefone, WhatsApp, e-mail, endereço, horário e redes vêm do cadastro da empresa.</p>
        <Txt label="Título" value={content.contact.title} onChange={(v) => set('contact', { ...content.contact, title: v })} />
        <Txt label="Subtítulo" value={content.contact.subtitle} onChange={(v) => set('contact', { ...content.contact, subtitle: v || null })} />
      </Group>

      <Group title="CTA final">
        <Txt label="Título" area value={content.final_cta.title} onChange={(v) => set('final_cta', { ...content.final_cta, title: v })} />
        <Txt label="Subtítulo" value={content.final_cta.subtitle} onChange={(v) => set('final_cta', { ...content.final_cta, subtitle: v || null })} />
        <Txt label="Texto do botão" value={content.final_cta.cta} onChange={(v) => set('final_cta', { ...content.final_cta, cta: v })} />
      </Group>

      <Group title="Rótulos, menu e botões" empty>
        <p className="text-xs text-zinc-500">Deixe em branco para usar o texto padrão (mostrado em cinza).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {LABEL_FIELDS.map((f) => (
            <Txt
              key={f.key}
              label={f.label}
              value={labels[f.key] ?? ''}
              placeholder={defaults?.[f.key]}
              onChange={(v) => set('labels', { ...labels, [f.key]: v })}
            />
          ))}
        </div>
      </Group>
    </div>
  );
}
