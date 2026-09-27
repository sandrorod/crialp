import { useRef, useState } from 'react';
import { ImageOff, ImagePlus, Link2, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button, CardSection, Field, Input, ListEditor, Select, TextField, Textarea } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { companyService, miscService } from '@/services';
import type { CommercialInfo, CompanyDraft, CompanyImage, ImageType } from '@/types';

const IMAGE_TYPES: { value: ImageType; label: string }[] = [
  { value: 'logo', label: 'Logotipo' },
  { value: 'company', label: 'Empresa' },
  { value: 'institutional', label: 'Institucional' },
  { value: 'service', label: 'Serviço' },
  { value: 'product', label: 'Produto' },
  { value: 'gallery', label: 'Galeria' },
  { value: 'other', label: 'Outra' },
];

const COMMERCIAL_LISTS: { key: keyof CommercialInfo; label: string }[] = [
  { key: 'differentials', label: 'Diferenciais' },
  { key: 'selling_points', label: 'Argumentos de venda' },
  { key: 'benefits', label: 'Benefícios' },
  { key: 'guarantees', label: 'Garantias' },
  { key: 'promotions', label: 'Promoções e ofertas' },
  { key: 'calls_to_action', label: 'Chamadas para ação encontradas' },
  { key: 'additional_info', label: 'Informações adicionais' },
];

export function emptyDraft(): CompanyDraft {
  return {
    name: '', trade_name: null, legal_name: null, description: null, segment: null, reference_url: null,
    phone: null, mobile: null, whatsapp: null, email: null, address: null, number: null, neighborhood: null,
    city: null, state: null, zip_code: null, website: null, instagram: null, facebook: null, youtube: null,
    linkedin: null, tiktok: null, other_socials: [], opening_hours: null, commercial_info: {},
    services: [], products: [], images: [], testimonials: [],
  };
}

/** Converte a empresa carregada do backend no formato editável. */
export function toDraft(c: CompanyDraft): CompanyDraft {
  const base = emptyDraft();
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base)) out[k] = (c as unknown as Record<string, unknown>)[k] ?? (base as unknown as Record<string, unknown>)[k];
  const d = out as unknown as CompanyDraft;
  return {
    ...d,
    services: c.services.map((s) => ({ name: s.name, description: s.description, benefits: s.benefits ?? [], details: s.details })),
    products: c.products.map((p) => ({ name: p.name, description: p.description, features: p.features ?? [], benefits: p.benefits ?? [] })),
    images: c.images.map((i) => ({ url: i.url, type: i.type, alt_text: i.alt_text, source: i.source, usage_allowed: i.usage_allowed })),
    testimonials: c.testimonials.map((t) => ({ author: t.author, text: t.text, source_url: t.source_url })),
  };
}

export function CompanyForm({ value, onChange, companyId }: { value: CompanyDraft; onChange: (v: CompanyDraft) => void; companyId?: string }) {
  const set = (patch: Partial<CompanyDraft>) => onChange({ ...value, ...patch });
  const setCommercial = (patch: Partial<CommercialInfo>) => set({ commercial_info: { ...value.commercial_info, ...patch } });

  return (
    <div className="space-y-4">
      <CardSection title="Identificação" description="Como a empresa se apresenta.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome *" value={value.name} onChange={(v) => set({ name: v ?? '' })} required />
          <TextField label="Nome fantasia / comercial" value={value.trade_name} onChange={(v) => set({ trade_name: v })} />
          <TextField label="Razão social" value={value.legal_name} onChange={(v) => set({ legal_name: v })} />
          <TextField label="Segmento" value={value.segment} onChange={(v) => set({ segment: v })} placeholder="Ex.: Clínica odontológica" />
          <TextField className="sm:col-span-2" label="Descrição" multiline value={value.description} onChange={(v) => set({ description: v })} />
          <TextField label="URL de referência" value={value.reference_url} onChange={(v) => set({ reference_url: v })} />
          <TextField label="Site" value={value.website} onChange={(v) => set({ website: v })} />
        </div>
      </CardSection>

      <CardSection title="Contato e funcionamento" description="Nada é inventado: deixe em branco o que não existir.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Telefone" value={value.phone} onChange={(v) => set({ phone: v })} placeholder="(11) 3333-3333" />
          <TextField label="Celular" value={value.mobile} onChange={(v) => set({ mobile: v })} placeholder="(11) 99999-9999" />
          <TextField label="WhatsApp" value={value.whatsapp} onChange={(v) => set({ whatsapp: v })} hint="Usado para gerar os botões wa.me automaticamente." />
          <TextField label="E-mail" type="email" value={value.email} onChange={(v) => set({ email: v })} />
          <TextField className="sm:col-span-2" label="Horário de funcionamento" multiline value={value.opening_hours} onChange={(v) => set({ opening_hours: v })} placeholder="Seg a Sex, 8h às 18h · Sáb, 8h às 12h" />
        </div>
      </CardSection>

      <CardSection title="Endereço">
        <div className="grid gap-4 sm:grid-cols-6">
          <TextField className="sm:col-span-4" label="Logradouro" value={value.address} onChange={(v) => set({ address: v })} />
          <TextField className="sm:col-span-2" label="Número" value={value.number} onChange={(v) => set({ number: v })} />
          <TextField className="sm:col-span-2" label="Bairro" value={value.neighborhood} onChange={(v) => set({ neighborhood: v })} />
          <TextField className="sm:col-span-2" label="Cidade" value={value.city} onChange={(v) => set({ city: v })} />
          <TextField className="sm:col-span-1" label="UF" value={value.state} onChange={(v) => set({ state: v })} maxLength={40} />
          <TextField className="sm:col-span-1" label="CEP" value={value.zip_code} onChange={(v) => set({ zip_code: v })} />
        </div>
      </CardSection>

      <CardSection title="Redes sociais">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Instagram" value={value.instagram} onChange={(v) => set({ instagram: v })} placeholder="https://instagram.com/empresa" />
          <TextField label="Facebook" value={value.facebook} onChange={(v) => set({ facebook: v })} />
          <TextField label="YouTube" value={value.youtube} onChange={(v) => set({ youtube: v })} />
          <TextField label="LinkedIn" value={value.linkedin} onChange={(v) => set({ linkedin: v })} />
          <TextField label="TikTok" value={value.tiktok} onChange={(v) => set({ tiktok: v })} />
        </div>
        {value.other_socials.length ? (
          <div className="mt-4 space-y-2">
            <span className="block text-[13px] font-medium text-zinc-700">Outras redes</span>
            {value.other_socials.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-36" value={s.network} onChange={(e) => set({ other_socials: value.other_socials.map((x, j) => (j === i ? { ...x, network: e.target.value } : x)) })} />
                <Input value={s.url} onChange={(e) => set({ other_socials: value.other_socials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                <Button type="button" variant="ghost" onClick={() => set({ other_socials: value.other_socials.filter((_, j) => j !== i) })} icon={<Trash2 className="size-4" />} aria-label="Remover" />
              </div>
            ))}
          </div>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className="mt-3" icon={<Plus className="size-4" />} onClick={() => set({ other_socials: [...value.other_socials, { network: '', url: '' }] })}>
          Outra rede
        </Button>
      </CardSection>

      <CardSection
        title={`Serviços (${value.services.length})`}
        description="Todos os serviços identificados. Edite, reordene removendo ou adicione novos."
        actions={
          <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => set({ services: [...value.services, { name: '', description: null, benefits: [], details: null }] })}>
            Adicionar
          </Button>
        }
      >
        {value.services.length ? (
          <div className="space-y-3">
            {value.services.map((s, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-4">
                <div className="flex gap-2">
                  <Input placeholder="Nome do serviço" value={s.name} onChange={(e) => set({ services: value.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="font-medium" />
                  <Button type="button" variant="ghost" onClick={() => set({ services: value.services.filter((_, j) => j !== i) })} icon={<Trash2 className="size-4" />} aria-label="Remover serviço" />
                </div>
                <Textarea className="mt-2 min-h-[64px]" placeholder="Descrição" value={s.description ?? ''} onChange={(e) => set({ services: value.services.map((x, j) => (j === i ? { ...x, description: e.target.value || null } : x)) })} />
                <Textarea className="mt-2 min-h-[56px]" placeholder="Detalhes / informações adicionais" value={s.details ?? ''} onChange={(e) => set({ services: value.services.map((x, j) => (j === i ? { ...x, details: e.target.value || null } : x)) })} />
                <div className="mt-3">
                  <ListEditor label="Benefícios" values={s.benefits} onChange={(b) => set({ services: value.services.map((x, j) => (j === i ? { ...x, benefits: b } : x)) })} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum serviço identificado.</p>
        )}
      </CardSection>

      <CardSection
        title={`Produtos (${value.products.length})`}
        actions={
          <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => set({ products: [...value.products, { name: '', description: null, features: [], benefits: [] }] })}>
            Adicionar
          </Button>
        }
      >
        {value.products.length ? (
          <div className="space-y-3">
            {value.products.map((p, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-4">
                <div className="flex gap-2">
                  <Input placeholder="Nome do produto" value={p.name} onChange={(e) => set({ products: value.products.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="font-medium" />
                  <Button type="button" variant="ghost" onClick={() => set({ products: value.products.filter((_, j) => j !== i) })} icon={<Trash2 className="size-4" />} aria-label="Remover produto" />
                </div>
                <Textarea className="mt-2 min-h-[64px]" placeholder="Descrição" value={p.description ?? ''} onChange={(e) => set({ products: value.products.map((x, j) => (j === i ? { ...x, description: e.target.value || null } : x)) })} />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ListEditor label="Características" values={p.features} onChange={(f) => set({ products: value.products.map((x, j) => (j === i ? { ...x, features: f } : x)) })} />
                  <ListEditor label="Benefícios" values={p.benefits} onChange={(b) => set({ products: value.products.map((x, j) => (j === i ? { ...x, benefits: b } : x)) })} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum produto identificado.</p>
        )}
      </CardSection>

      <CardSection title="Informações comerciais" description="Base para diferenciais, argumentos e CTAs da página.">
        <div className="grid gap-5 sm:grid-cols-2">
          {COMMERCIAL_LISTS.map(({ key, label }) => (
            <ListEditor key={key} label={label} values={(value.commercial_info[key] as string[] | undefined) ?? []} onChange={(v) => setCommercial({ [key]: v })} />
          ))}
          <Field label="Público-alvo" className="sm:col-span-2">
            <Textarea value={value.commercial_info.target_audience ?? ''} onChange={(e) => setCommercial({ target_audience: e.target.value || null })} />
          </Field>
        </div>
      </CardSection>

      <CardSection
        title={`Depoimentos (${value.testimonials.length})`}
        description="Somente depoimentos reais. A seção só aparece na página se houver algum."
        actions={
          <Button type="button" variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => set({ testimonials: [...value.testimonials, { author: null, text: '', source_url: null }] })}>
            Adicionar
          </Button>
        }
      >
        {value.testimonials.length ? (
          <div className="space-y-3">
            {value.testimonials.map((t, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-4">
                <div className="flex gap-2">
                  <Input placeholder="Autor" value={t.author ?? ''} onChange={(e) => set({ testimonials: value.testimonials.map((x, j) => (j === i ? { ...x, author: e.target.value || null } : x)) })} />
                  <Button type="button" variant="ghost" onClick={() => set({ testimonials: value.testimonials.filter((_, j) => j !== i) })} icon={<Trash2 className="size-4" />} aria-label="Remover depoimento" />
                </div>
                <Textarea className="mt-2" placeholder="Texto do depoimento" value={t.text} onChange={(e) => set({ testimonials: value.testimonials.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum depoimento encontrado na fonte.</p>
        )}
      </CardSection>

      <ImagesEditor images={value.images} onChange={(images) => set({ images })} companyId={companyId} />
    </div>
  );
}

function ImagesEditor({ images, onChange, companyId }: { images: CompanyImage[]; onChange: (v: CompanyImage[]) => void; companyId?: string }) {
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const setAll = (usage_allowed: boolean) => onChange(images.map((img) => ({ ...img, usage_allowed })));

  const fetchFromSite = async () => {
    if (!companyId) return;
    setFetching(true);
    try {
      const r = await companyService.fetchImages(companyId, true);
      if (!r.images.length) toast.info('Nenhuma foto nova encontrada no site.');
      else {
        onChange([...images, ...r.images]);
        toast.success(`${r.images.length} foto(s) adicionada(s). Revise e clique em "Salvar empresa".`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFetching(false);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (i: number, patch: Partial<CompanyImage>) => onChange(images.map((img, j) => (j === i ? { ...img, ...patch } : img)));
  const allowed = images.filter((i) => i.usage_allowed).length;

  const addUrl = () => {
    const t = url.trim();
    if (!t) return;
    onChange([...images, { url: t, type: 'other', alt_text: null, source: 'manual', usage_allowed: true }]);
    setUrl('');
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const r = await miscService.upload(file);
      onChange([...images, { url: r.url, type: 'other', alt_text: null, source: 'upload', usage_allowed: true }]);
      toast.success('Imagem enviada.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <CardSection
      title={`Imagens (${allowed} liberada${allowed === 1 ? '' : 's'} de ${images.length})`}
      description="Só as imagens liberadas aparecem na Landing Page. A primeira foto liberada vira o destaque do topo."
      actions={
        <div className="flex flex-wrap justify-end gap-2">
          {companyId ? (
            <Button type="button" variant="secondary" size="sm" loading={fetching} icon={<ImagePlus className="size-4" />} onClick={fetchFromSite}>
              Buscar fotos do site
            </Button>
          ) : null}
          {images.length ? (
            allowed < images.length ? (
              <Button type="button" size="sm" icon={<ShieldCheck className="size-4" />} onClick={() => setAll(true)}>Liberar todas</Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>Bloquear todas</Button>
            )
          ) : null}
        </div>
      }
    >
      {images.length > 0 && allowed === 0 ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          Nenhuma imagem está liberada, então a Landing Page ficará sem fotos. Use <strong>Liberar todas</strong> ou marque as que deseja usar.
        </div>
      ) : null}
      {fetching ? <p className="mb-4 text-sm text-zinc-500">Lendo o site e selecionando as melhores fotos… (pode levar até 1 minuto)</p> : null}
      {images.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img, i) => (
            <div key={`${img.url}-${i}`} className={cn('overflow-hidden rounded-lg border transition', img.usage_allowed ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-zinc-200')}>
              <div className="relative aspect-[4/3] bg-zinc-100">
                <Thumb url={img.url} alt={img.alt_text ?? ''} contain={img.type === 'logo'} />
                <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1.5 text-zinc-600 shadow-sm hover:text-red-600" aria-label="Remover imagem">
                  <Trash2 className="size-3.5" />
                </button>
                <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  {img.source === 'scraped' ? 'Coletada' : img.source === 'upload' ? 'Enviada' : 'URL'}
                </span>
              </div>
              <div className="space-y-2 p-2.5">
                <Select className="h-8 text-xs" value={img.type} onChange={(e) => update(i, { type: e.target.value as ImageType })}>
                  {IMAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <Input className="h-8 text-xs" placeholder="Texto alternativo" value={img.alt_text ?? ''} onChange={(e) => update(i, { alt_text: e.target.value || null })} />
                <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-600">
                  <input type="checkbox" className="mt-0.5 accent-emerald-600" checked={img.usage_allowed} onChange={(e) => update(i, { usage_allowed: e.target.checked })} />
                  <span className="flex items-center gap-1">
                    {img.usage_allowed ? <ShieldCheck className="size-3.5 text-emerald-600" /> : null}
                    Tenho permissão de uso
                  </span>
                </label>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Nenhuma imagem. Sem imagens, a página usa composição tipográfica.</p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input className="pl-9" placeholder="Adicionar imagem por URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
        </div>
        <Button type="button" variant="secondary" icon={<ImagePlus className="size-4" />} onClick={addUrl}>Adicionar URL</Button>
        <Button type="button" variant="secondary" loading={uploading} icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Enviar arquivo</Button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </CardSection>
  );
}

function Thumb({ url, alt, contain }: { url: string; alt: string; contain?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="grid h-full place-items-center text-zinc-400">
        <ImageOff className="size-5" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn('h-full w-full', contain ? 'object-contain p-3' : 'object-cover')} />;
}
