import { useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, Globe, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Field, Input, ListEditor, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn, copyToClipboard, formatDate } from '@/lib/utils';
import { landingPageService } from '@/services';
import type { HeroVariant, LandingPageDetail, ThemeSettings } from '@/types';

// ─── Visual ─────────────────────────────────────────────────────────
const HERO_VARIANTS: { value: HeroVariant; label: string; hint: string }[] = [
  { value: 'split', label: 'Dividido', hint: 'Texto + imagem/painel' },
  { value: 'centered', label: 'Centralizado', hint: 'Mensagem direta' },
  { value: 'image', label: 'Imagem cheia', hint: 'Requer foto liberada' },
];

export function DesignTab({ theme, onChange, imagesAllowed }: { theme: ThemeSettings; onChange: (t: ThemeSettings) => void; imagesAllowed: number }) {
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
        <div className="grid grid-cols-3 gap-2">
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
        {theme.heroVariant === 'image' && imagesAllowed === 0 ? (
          <p className="mt-2 text-xs text-amber-700">Nenhuma imagem liberada: o topo será exibido centralizado. Libere imagens em "Editar empresa".</p>
        ) : null}
      </div>
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
