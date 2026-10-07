import { useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input, Modal } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/utils';
import { landingPageService } from '@/services';

// Ícones e grupos vêm do servidor (mesmos SVGs da página publicada) e são buscados uma vez só
let iconsPromise: Promise<{ svgs: Record<string, string>; categories: { label: string; icons: string[] }[] }> | null = null;
export const loadIconCatalog = () =>
  (iconsPromise ??= Promise.all([landingPageService.icons(), landingPageService.iconCategories()])
    .then(([svgs, categories]) => ({ svgs, categories }))
    .catch((err) => ((iconsPromise = null), Promise.reject(err))));

export function IconSvg({ svg, className, style }: { svg?: string; className?: string; style?: CSSProperties }) {
  return <span className={cn('inline-grid place-items-center [&_svg]:size-5', className)} style={style} dangerouslySetInnerHTML={{ __html: svg ?? '' }} />;
}

/** Cores e cantos da página, para os ícones do seletor aparecerem como vão ficar no site. */
export type IconPageStyle = { ink: string; soft: string; radius: string };

/** Lê o estilo dos ícones da página aberta na prévia. */
export function readIconStyle(doc: Document | null | undefined): IconPageStyle | undefined {
  if (!doc?.documentElement) return undefined;
  const css = doc.defaultView?.getComputedStyle(doc.documentElement);
  const v = (name: string) => css?.getPropertyValue(name).trim() ?? '';
  return v('--primary-ink') ? { ink: v('--primary-ink'), soft: v('--primary-soft'), radius: v('--radius-sm') || '10px' } : undefined;
}

/** Popup com todos os ícones (busca + grupos). */
export function IconPickerModal({
  open,
  value,
  pageStyle,
  onPick,
  onClose,
}: {
  open: boolean;
  value?: string | null;
  pageStyle?: IconPageStyle;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const { data, error, reload } = useAsync(() => (open ? loadIconCatalog() : Promise.resolve(null)), [open]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const cats = data.categories.filter((c) => !category || c.label === category);
    if (!q) return cats;
    // Busca pelo nome do ícone ou do grupo; cada ícone aparece uma vez só
    const seen = new Set<string>();
    return [
      {
        label: 'Resultados',
        icons: cats.flatMap((c) => (c.label.toLowerCase().includes(q) ? c.icons : c.icons.filter((n) => n.replace(/-/g, ' ').includes(q)))).filter((n) => !seen.has(n) && seen.add(n)),
      },
    ];
  }, [data, query, category]);

  const close = () => {
    setQuery('');
    onClose();
  };

  const boxStyle: CSSProperties | undefined = pageStyle ? { background: pageStyle.soft, color: pageStyle.ink, borderRadius: pageStyle.radius } : undefined;

  return (
    <Modal open={open} title="Escolher ícone" description="Os ícones aparecem nas cores da página." onClose={close} size="lg">
      {error ? (
        <p className="text-sm text-red-600">
          Não foi possível carregar os ícones. <button type="button" className="underline" onClick={() => void reload()}>Tentar de novo</button>
        </p>
      ) : !data ? (
        <p className="text-sm text-zinc-500">Carregando ícones…</p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar (ex.: heart, car, coffee)…" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {[null, ...data.categories.map((c) => c.label)].map((label) => (
              <button
                key={label ?? 'todos'}
                type="button"
                onClick={() => setCategory(label)}
                className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium', category === label ? 'bg-ink text-white' : 'bg-zinc-100 text-zinc-600 hover:text-ink')}
              >
                {label ?? 'Todos'}
              </button>
            ))}
          </div>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g.label}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{g.label}</h3>
                {g.icons.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
                    {g.icons.map((name) => (
                      <button
                        key={name}
                        type="button"
                        title={name}
                        onClick={() => {
                          onPick(name);
                          close();
                        }}
                        className={cn('grid aspect-square place-items-center rounded-lg p-1 transition hover:bg-zinc-100', name === value && 'ring-2 ring-brand-500')}
                      >
                        <IconSvg svg={data.svgs[name]} style={boxStyle} className={cn('size-11 [&_svg]:size-6', !boxStyle && 'rounded-lg bg-brand-50 text-brand-600')} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Nenhum ícone encontrado.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Campo de ícone (como um select): mostra o desenho do ícone atual; clicar abre o popup com todos. */
export function IconPickerButton({ value, onChange, label = 'Trocar ícone' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { data } = useAsync(loadIconCatalog, []);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className="inline-flex h-10 flex-none items-center gap-1.5 rounded-lg border border-zinc-200 bg-white pl-1.5 pr-2 hover:border-zinc-300"
      >
        <IconSvg svg={data?.svgs[value]} className="size-7 rounded-md bg-brand-50 text-brand-600 [&_svg]:size-[18px]" />
        <ChevronDown className="size-4 text-zinc-400" />
      </button>
      <IconPickerModal open={open} value={value} onPick={onChange} onClose={() => setOpen(false)} />
    </>
  );
}
