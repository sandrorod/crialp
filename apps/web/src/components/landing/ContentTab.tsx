import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, ListEditor, Select, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/utils';
import { landingPageService } from '@/services';
import type { Company, LandingContent, SectionKey } from '@/types';

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
];

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

  /** Cria uma seção que não existia e a coloca antes do contato. */
  const createSection = <K extends keyof LandingContent>(key: K & SectionKey, value: LandingContent[K]) => {
    const next = order.filter((k) => k !== key);
    const at = next.indexOf('contact');
    next.splice(at >= 0 ? at : next.length, 0, key);
    onChange({ ...content, [key]: value, section_order: next });
  };
  const removeSection = (key: 'about' | 'services' | 'differentials' | 'products' | 'gallery' | 'faq') =>
    onChange({ ...content, [key]: null, section_order: order.filter((k) => k !== key) });

  const move = (k: SectionKey, dir: -1 | 1) => {
    const i = order.indexOf(k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    set('section_order', next);
  };
  const toggle = (k: SectionKey) =>
    set('section_order', order.includes(k) ? order.filter((x) => x !== k) : [...order.filter((x) => !REQUIRED.includes(x)), k, ...REQUIRED.filter((r) => order.includes(r))]);

  const createBtn = (onClick: () => void) => (
    <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={onClick}>Criar seção</Button>
  );
  const removeBtn = (key: Parameters<typeof removeSection>[0]) => (
    <button type="button" className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Excluir seção" onClick={() => removeSection(key)}>
      <Trash2 className="size-4" />
    </button>
  );
  const labels = content.labels ?? {};

  return (
    <div className="space-y-3">
      <Group title="Seções e ordem">
        <p className="text-xs text-zinc-500">Seções sem dados reais (ex.: depoimentos inexistentes ou galeria sem fotos liberadas) não aparecem, mesmo se ativadas.</p>
        <ul className="space-y-1">
          {[...order, ...ALL_SECTIONS.filter((k) => !order.includes(k))].map((k) => {
            const on = order.includes(k);
            return (
              <li key={k} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5', on ? 'bg-zinc-50' : 'opacity-60')}>
                <span className="flex-1 text-sm">{SECTION_LABELS[k]}</span>
                {on ? (
                  <>
                    <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-200" onClick={() => move(k, -1)} aria-label="Subir"><ArrowUp className="size-3.5" /></button>
                    <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-200" onClick={() => move(k, 1)} aria-label="Descer"><ArrowDown className="size-3.5" /></button>
                  </>
                ) : null}
                <button type="button" disabled={REQUIRED.includes(k)} className="rounded p-1 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30" onClick={() => toggle(k)} aria-label={on ? 'Ocultar' : 'Mostrar'}>
                  {on ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
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

      <Group title="Depoimentos">
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
