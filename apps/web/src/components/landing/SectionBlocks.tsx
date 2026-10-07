import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Heading, Image as ImageIcon, Link2, Minus, MousePointerClick, Plus, Shapes, Trash2, Type, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn, confirmDelete } from '@/lib/utils';
import { landingPageService, miscService } from '@/services';
import type { BlockType, BlockWidth, Company, CustomSection, SectionBlock } from '@/types';
import { IconPickerButton } from './IconPicker';

export const newId = () => Math.random().toString(36).slice(2, 8);

const BLOCK_TYPES: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: 'heading', label: 'Título', icon: Heading },
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'image', label: 'Imagem', icon: ImageIcon },
  { type: 'icon', label: 'Ícone', icon: Shapes },
  { type: 'button', label: 'Botão', icon: MousePointerClick },
  { type: 'divider', label: 'Divisória', icon: Minus },
];
const TYPE_LABEL = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b.label])) as Record<BlockType, string>;

const WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: 'full', label: 'Linha inteira' },
  { value: 'half', label: 'Metade' },
  { value: 'third', label: 'Um terço' },
];

/** Elemento novo com textos de exemplo para o usuário trocar. */
export function newBlock(type: BlockType, width?: BlockWidth): SectionBlock {
  const id = newId();
  switch (type) {
    case 'heading': return { id, type, width: width ?? 'full', text: 'Novo título' };
    case 'text': return { id, type, width: width ?? 'full', text: 'Escreva o texto aqui.' };
    case 'image': return { id, type, width: width ?? 'full', url: '', alt: '', caption: null };
    case 'icon': return { id, type, width: width ?? 'third', icon: 'star', title: 'Título do destaque', text: null };
    case 'button': return { id, type, width: width ?? 'full', label: 'Fale conosco', url: '' };
    case 'divider': return { id, type, width: 'full' };
  }
}

/** Modelos de seção prontos (criados com elementos de exemplo). */
export const SECTION_TEMPLATES: { key: string; label: string; description: string; build: () => Omit<CustomSection, 'id'> }[] = [
  { key: 'blank', label: 'Em branco', description: 'Só o título; adicione os elementos que quiser.', build: () => ({ eyebrow: null, title: 'Nova seção', paragraphs: [], items: [], blocks: [], align: 'left' }) },
  {
    key: 'text-image',
    label: 'Texto e imagem',
    description: 'Texto de um lado, imagem do outro.',
    build: () => ({ eyebrow: null, title: 'Nova seção', paragraphs: [], items: [], blocks: [newBlock('text', 'half'), newBlock('image', 'half')], align: 'left' }),
  },
  {
    key: 'icons',
    label: 'Cards com ícones',
    description: 'Três destaques, cada um com ícone, título e descrição.',
    build: () => ({ eyebrow: null, title: 'Nova seção', paragraphs: [], items: [], blocks: [newBlock('icon'), newBlock('icon'), newBlock('icon')], align: 'left' }),
  },
  {
    key: 'photos',
    label: 'Galeria de imagens',
    description: 'Três imagens lado a lado (adicione mais se quiser).',
    build: () => ({ eyebrow: null, title: 'Nova seção', paragraphs: [], items: [], blocks: [newBlock('image', 'third'), newBlock('image', 'third'), newBlock('image', 'third')], align: 'left' }),
  },
  {
    key: 'image',
    label: 'Imagem grande',
    description: 'Uma imagem ocupando a largura toda, com legenda opcional.',
    build: () => ({ eyebrow: null, title: 'Nova seção', paragraphs: [], items: [], blocks: [newBlock('image')], align: 'center' }),
  },
  {
    key: 'cta',
    label: 'Chamada com botão',
    description: 'Texto centralizado e um botão.',
    build: () => ({ eyebrow: null, title: 'Nova seção', paragraphs: [], items: [], blocks: [newBlock('text'), newBlock('button')], align: 'center' }),
  },
];

/** Botão "Nova seção" com a escolha do modelo. */
export function NewSectionButton({ onCreate }: { onCreate: (s: Omit<CustomSection, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setOpen((o) => !o)}>Nova seção</Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
            {SECTION_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-zinc-50"
                onClick={() => {
                  onCreate(t.build());
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-zinc-500">{t.description}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <IconPickerButton value={value} onChange={onChange} />;
}

function ImageField({ value, onChange, company }: { value: string; onChange: (url: string) => void; company?: Company | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const photos = (company?.images ?? []).filter((i) => i.usage_allowed && i.type !== 'logo');

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await miscService.upload(file);
      onChange(url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-40">
          <img src={value} alt="" referrerPolicy="no-referrer" className="h-24 w-40 rounded-md object-cover ring-1 ring-zinc-200" />
          <button type="button" onClick={() => confirmDelete('esta imagem do elemento') && onChange('')} className="absolute right-1 top-1 rounded bg-white/90 p-0.5 text-zinc-600 hover:text-red-600" aria-label="Tirar imagem"><X className="size-3.5" /></button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        <Button type="button" variant="secondary" size="sm" loading={uploading} icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>Enviar imagem</Button>
        {photos.length ? (
          <Button type="button" variant="secondary" size="sm" icon={<ImageIcon className="size-3.5" />} onClick={() => setPicking((p) => !p)}>Imagens da empresa</Button>
        ) : null}
      </div>
      {picking ? (
        <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
          {photos.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => {
                onChange(p.url);
                setPicking(false);
              }}
              className={cn('overflow-hidden rounded-md ring-1 ring-zinc-200 hover:ring-brand-500', p.url === value && 'ring-2 ring-brand-500')}
            >
              <img src={p.url} alt={p.alt_text ?? ''} referrerPolicy="no-referrer" loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BlockFields({ block: b, onChange, company }: { block: SectionBlock; onChange: (b: SectionBlock) => void; company?: Company | null }) {
  switch (b.type) {
    case 'heading':
      return <Input value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} placeholder="Título" className="font-medium" />;
    case 'text':
      return <Textarea className="min-h-[90px]" value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} />;
    case 'image':
      return (
        <div className="space-y-2">
          <ImageField value={b.url} onChange={(url) => onChange({ ...b, url })} company={company} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={b.caption ?? ''} onChange={(e) => onChange({ ...b, caption: e.target.value || null })} placeholder="Legenda (opcional)" />
            <Input value={b.alt} onChange={(e) => onChange({ ...b, alt: e.target.value })} placeholder="Descrição da imagem (acessibilidade)" />
          </div>
        </div>
      );
    case 'icon':
      return (
        <div className="space-y-2">
          <IconPicker value={b.icon} onChange={(icon) => onChange({ ...b, icon })} />
          <Input value={b.title} onChange={(e) => onChange({ ...b, title: e.target.value })} placeholder="Título" className="font-medium" />
          <Textarea value={b.text ?? ''} onChange={(e) => onChange({ ...b, text: e.target.value || null })} placeholder="Descrição (opcional)" />
        </div>
      );
    case 'button':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={b.label} onChange={(e) => onChange({ ...b, label: e.target.value })} placeholder="Texto do botão" />
          <div>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
              <Input className="pl-8" value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value.trim() })} placeholder="Link (opcional)" />
            </div>
            <span className="mt-1 block text-xs text-zinc-500">Vazio = contato principal (WhatsApp/telefone).</span>
          </div>
        </div>
      );
    case 'divider':
      return <p className="text-xs text-zinc-500">Linha separando os elementos.</p>;
  }
}

/** Lista de elementos da seção: adicionar, editar, reordenar e excluir. */
export function BlocksEditor({ blocks, onChange, company, path }: { blocks: SectionBlock[]; onChange: (b: SectionBlock[]) => void; company?: Company | null; path?: string }) {
  const update = (i: number, b: SectionBlock) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <span className="block text-[13px] font-medium text-zinc-700">Elementos</span>
      {blocks.map((b, i) => (
        <div key={b.id} data-field={path ? `${path}.${i}` : undefined} className="space-y-2 rounded-md border border-zinc-200 bg-white p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{TYPE_LABEL[b.type]}</span>
            {b.type !== 'divider' ? (
              <select className="h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-xs text-zinc-700" value={b.width} onChange={(e) => update(i, { ...b, width: e.target.value as BlockWidth })} aria-label="Largura">
                {WIDTHS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            ) : null}
            <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-100" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="size-3.5" /></button>
            <button type="button" className="rounded p-1 text-zinc-500 hover:bg-zinc-100" onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="size-3.5" /></button>
            <button type="button" className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600" onClick={() => confirmDelete(`este elemento (${TYPE_LABEL[b.type].toLowerCase()})`) && onChange(blocks.filter((_, j) => j !== i))} aria-label="Excluir elemento"><Trash2 className="size-3.5" /></button>
          </div>
          <BlockFields block={b} onChange={(nb) => update(i, nb)} company={company} />
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange([...blocks, newBlock(type)])}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:border-brand-500 hover:text-brand-600"
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">"Metade" e "Um terço" colocam elementos lado a lado no computador; no celular cada um ocupa a linha inteira.</p>
    </div>
  );
}
