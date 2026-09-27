import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Check, CircleSlash, FileSearch, Globe, PencilLine, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { CompanyForm, emptyDraft } from '@/components/company/CompanyForm';
import { ProgressSteps } from '@/components/ProgressSteps';
import { Button, Card, Input } from '@/components/ui';
import { useJob } from '@/hooks/useJob';
import { errorMessage } from '@/lib/api';
import { analysisService, companyService } from '@/services';
import type { AnalysisMeta, AnalysisResult, CompanyDraft } from '@/types';

type Stage = 'url' | 'analyzing' | 'review' | 'generating';

function looksLikeUrl(v: string) {
  const t = v.trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function NewLandingPagePage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('url');
  const [url, setUrl] = useState('');
  const [allowImages, setAllowImages] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [analyzeJobId, setAnalyzeJobId] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>(emptyDraft());
  const [meta, setMeta] = useState<AnalysisMeta | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const analyze = useJob<AnalysisResult>(analyzeJobId);
  const generate = useJob<{ landingPageId: string }>(generateJobId);

  // Análise concluída → tela de revisão
  useEffect(() => {
    const j = analyze.job;
    if (j?.status === 'done' && j.result) {
      setDraft(j.result.draft);
      setMeta(j.result.meta);
      setStage('review');
      window.scrollTo({ top: 0 });
    }
  }, [analyze.job]);

  // Geração concluída → editor da LP
  useEffect(() => {
    const j = generate.job;
    if (j?.status === 'done' && j.result) {
      toast.success('Landing Page gerada! Revise a prévia e publique.');
      navigate(`/landing-pages/${j.result.landingPageId}`);
    }
  }, [generate.job, navigate]);

  const startAnalysis = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!looksLikeUrl(url)) {
      setUrlError('Informe uma URL válida.');
      return;
    }
    setUrlError(null);
    setStarting(true);
    try {
      const { jobId } = await analysisService.analyzeUrl(url.trim(), allowImages);
      setAnalyzeJobId(jobId);
      setStage('analyzing');
    } catch (err) {
      setUrlError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const fillManually = () => {
    setDraft({ ...emptyDraft(), reference_url: looksLikeUrl(url) ? url.trim() : null });
    setMeta(null);
    setStage('review');
  };

  const confirmAndGenerate = async () => {
    if (!draft.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    try {
      let id = companyId;
      if (!id) {
        const cleaned: CompanyDraft = {
          ...draft,
          services: draft.services.filter((s) => s.name.trim()),
          products: draft.products.filter((p) => p.name.trim()),
          testimonials: draft.testimonials.filter((t) => t.text.trim()),
          other_socials: draft.other_socials.filter((s) => s.url.trim()),
        };
        id = (await companyService.create({ ...cleaned, source_meta: meta ?? {} })).id;
        setCompanyId(id);
      }
      const { jobId } = await analysisService.generate(id);
      setGenerateJobId(jobId);
      setStage('generating');
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ─── Etapa 1: URL ────────────────────────────────────────────────
  if (stage === 'url') {
    return (
      <div className="mx-auto max-w-2xl pt-4 lg:pt-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-ink text-white shadow-lg shadow-zinc-900/20">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Nova Landing Page</h1>
          <p className="mx-auto mt-2 max-w-md text-zinc-500">
            Informe o site de referência da empresa. Vamos coletar as informações reais e montar uma página profissional.
          </p>
        </div>
        <Card className="p-5 sm:p-7">
          <form onSubmit={startAnalysis}>
            <label htmlFor="url" className="mb-2 block text-sm font-medium">URL de referência</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="url"
                  className="h-12 pl-10 text-[15px]"
                  placeholder="https://www.empresa.com.br"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoFocus
                  inputMode="url"
                  autoComplete="url"
                />
              </div>
              <Button type="submit" size="lg" loading={starting} className="sm:w-auto">
                ANALISAR EMPRESA <ArrowRight className="size-4" />
              </Button>
            </div>
            {urlError ? <p className="mt-3 flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="size-4" /> {urlError}</p> : null}
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
              <input type="checkbox" className="mt-0.5 size-4 accent-zinc-900" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} />
              <span>
                <span className="font-medium text-ink">Usar as fotos do site na Landing Page</span>
                <span className="block text-xs text-zinc-500">Declaro ter autorização da empresa para usar as imagens. Você ainda poderá remover fotos na revisão.</span>
              </span>
            </label>
          </form>
          <div className="mt-6 grid gap-3 border-t border-zinc-100 pt-6 text-sm text-zinc-600 sm:grid-cols-3">
            {[
              ['Coleta', 'Contatos, serviços, horários, redes e imagens.'],
              ['Revisão', 'Você confere e corrige tudo antes de gerar.'],
              ['Sem invenções', 'Só entra o que foi encontrado ou informado.'],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="font-medium text-ink">{t}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-zinc-500">{d}</div>
              </div>
            ))}
          </div>
        </Card>
        <p className="mt-5 text-center text-sm text-zinc-500">
          O site não tem as informações?{' '}
          <button onClick={fillManually} className="font-medium text-ink underline-offset-2 hover:underline">Preencher manualmente</button>
        </p>
      </div>
    );
  }

  // ─── Etapa 2: análise em andamento ───────────────────────────────
  if (stage === 'analyzing') {
    const j = analyze.job;
    const failed = j?.status === 'error' || !!analyze.networkError;
    return (
      <div className="mx-auto max-w-xl pt-4 lg:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Analisando empresa</h1>
        <p className="mt-1 truncate text-sm text-zinc-500">{url}</p>
        <Card className="mt-6 p-5 sm:p-6">
          <ProgressSteps current={Math.max(j?.step ?? 1, 1)} range={[1, 6]} failed={failed} />
          {!failed ? (
            <p className="mt-5 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
              A leitura e interpretação pela IA costuma levar de 30 segundos a 2 minutos. Você pode acompanhar por aqui.
            </p>
          ) : (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="flex items-start gap-2 text-sm font-medium text-red-700">
                <CircleSlash className="mt-0.5 size-4 flex-none" /> {j?.error ?? analyze.networkError}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => { setAnalyzeJobId(null); setStage('url'); }}>
                  Tentar outra URL
                </Button>
                <Button size="sm" variant="secondary" icon={<PencilLine className="size-3.5" />} onClick={fillManually}>
                  Preencher manualmente
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ─── Etapa 4: geração ────────────────────────────────────────────
  if (stage === 'generating') {
    const j = generate.job;
    const failed = j?.status === 'error' || !!generate.networkError;
    return (
      <div className="mx-auto max-w-xl pt-4 lg:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">Gerando Landing Page</h1>
        <p className="mt-1 text-sm text-zinc-500">{draft.trade_name || draft.name}</p>
        <Card className="mt-6 p-5 sm:p-6">
          <ProgressSteps current={Math.max(j?.step ?? 7, 7)} range={[1, 9]} failed={failed} done={j?.status === 'done'} />
          {failed ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">{j?.error ?? generate.networkError}</p>
              <p className="mt-1 text-xs text-red-600/80">Os dados da empresa já foram salvos.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" loading={saving} icon={<RotateCcw className="size-3.5" />} onClick={confirmAndGenerate}>Tentar novamente</Button>
                {companyId ? <Link to={`/empresas/${companyId}`}><Button size="sm" variant="secondary">Ver empresa</Button></Link> : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    );
  }

  // ─── Etapa 3: revisão dos dados ──────────────────────────────────
  const summary: [string, string | null][] = [
    ['Nome', draft.trade_name || draft.name || null],
    ['Segmento', draft.segment],
    ['Telefone', draft.phone || draft.mobile],
    ['WhatsApp', draft.whatsapp],
    ['E-mail', draft.email],
    ['Site', draft.website],
    ['Instagram', draft.instagram],
    ['Cidade', draft.city ? `${draft.city}${draft.state ? ` – ${draft.state}` : ''}` : null],
  ];

  return (
    <div className="pb-28">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Revise as informações</h1>
        <p className="mt-1 text-sm text-zinc-500">Corrija o que for necessário. A Landing Page será gerada exatamente a partir destes dados.</p>
      </div>

      {meta ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Empresa</div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {summary.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-zinc-500">{k}</dt>
                  <dd className={v ? 'truncate text-sm font-medium' : 'text-sm text-zinc-400'}>{v ?? 'Não encontrado'}</dd>
                </div>
              ))}
            </dl>
            {draft.services.length ? (
              <div className="mt-5 border-t border-zinc-100 pt-4">
                <div className="mb-2 text-xs text-zinc-500">Serviços encontrados</div>
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {draft.services.map((s, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-sm"><Check className="size-4 text-emerald-600" /> {s.name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500"><FileSearch className="size-4" /> Fonte</div>
            <p className="text-sm text-zinc-600">{meta.pages.length} página(s) lida(s)</p>
            <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-zinc-500">
              {meta.pages.map((p) => <li key={p} className="truncate">{p}</li>)}
            </ul>
            {meta.missing_info.length ? (
              <div className="mt-4">
                <div className="text-xs font-medium text-amber-700">Não encontrado na fonte</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{meta.missing_info.join(' · ')}</p>
              </div>
            ) : null}
            {meta.removed.length ? (
              <div className="mt-4">
                <div className="text-xs font-medium text-red-700">Descartado por não constar na fonte</div>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  {meta.removed.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      <CompanyForm value={draft} onChange={setDraft} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/90 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Button variant="ghost" onClick={() => setStage('url')} disabled={saving}>Voltar</Button>
          <Button variant="brand" size="lg" loading={saving} onClick={confirmAndGenerate} icon={<Sparkles className="size-4" />}>
            CONFIRMAR E GERAR LANDING PAGE
          </Button>
        </div>
      </div>
    </div>
  );
}
