import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowRight, Check, CircleSlash, FileSearch, Globe, Layers, PencilLine, RotateCcw, SkipForward, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { CompanyForm, emptyDraft } from '@/components/company/CompanyForm';
import { SellerPicker } from '@/components/SellerCell';
import { ClientLevelPicker } from '@/components/ClientLevelCell';
import { ProgressSteps } from '@/components/ProgressSteps';
import { StopJobButton } from '@/components/StopJobButton';
import { Button, Card, Input } from '@/components/ui';
import { useJob } from '@/hooks/useJob';
import { errorMessage } from '@/lib/api';
import { loadBatch, saveBatch, type LpBatch } from '@/lib/lpBatch';
import { shortUrl } from '@/lib/utils';
import { analysisService, companyService } from '@/services';
import type { AnalysisMeta, AnalysisResult, CompanyDraft, PlaceListing } from '@/types';

type Stage = 'url' | 'analyzing' | 'review' | 'generating';
/** Segundos que o lote espera na revisão (e antes de pular uma empresa com erro). */
const BATCH_WAIT = 10;

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
  // Vindo de "Buscar empresas": ?url=…&fotos=1 já inicia a análise
  const [params] = useSearchParams();
  const [stage, setStage] = useState<Stage>('url');
  const [url, setUrl] = useState(params.get('url') ?? '');
  const [allowImages, setAllowImages] = useState(params.get('fotos') !== '0');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [analyzeJobId, setAnalyzeJobId] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>(emptyDraft());
  const [meta, setMeta] = useState<AnalysisMeta | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Vendedor e nível do cliente da página ("" = nenhum): escolhidos na revisão dos dados da empresa.
  // Vendedor "auto" (Aleatório, padrão) = rodízio: o próximo depois do último que recebeu LP
  const [sellerId, setSellerId] = useState('auto');
  const [clientLevelId, setClientLevelId] = useState('');
  // Lote vindo de "Buscar empresas" (?lote=1): gera uma empresa por vez, sem voltar para a pesquisa
  const [batch, setBatch] = useState<LpBatch | null>(() => (params.get('lote') ? loadBatch() : null));
  // Contagem do lote: na revisão confirma sozinha ao chegar a zero; com erro, pula para a próxima empresa
  const [countdown, setCountdown] = useState<number | null>(null);

  const analyze = useJob<AnalysisResult>(analyzeJobId);
  const generate = useJob<{ landingPageId: string }>(generateJobId);

  // Análise concluída → tela de revisão
  useEffect(() => {
    const j = analyze.job;
    if (j?.status === 'done' && j.result) {
      setDraft(j.result.draft);
      setMeta(j.result.meta);
      setStage('review');
      if (batch) setCountdown(BATCH_WAIT);
      window.scrollTo({ top: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyze.job]);

  // Geração concluída → editor da LP (no lote, segue para a próxima empresa)
  useEffect(() => {
    const j = generate.job;
    if (j?.status === 'done' && j.result) {
      if (batch) {
        toast.success(`LP de “${draft.trade_name || draft.name}” gerada.`);
        next(true);
        return;
      }
      toast.success('Landing Page gerada! Revise a prévia e publique.');
      navigate(`/landing-pages/${j.result.landingPageId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generate.job, navigate]);

  useEffect(() => {
    if (batch) void startItem(batch);
    else if (params.get('url')) void startAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No lote, um erro na análise ou na geração pula para a próxima empresa depois da contagem
  const analyzeFailed = stage === 'analyzing' && (analyze.job?.status === 'error' || !!analyze.networkError);
  const generateFailed = stage === 'generating' && (generate.job?.status === 'error' || !!generate.networkError);
  useEffect(() => {
    if (batch && (analyzeFailed || generateFailed)) setCountdown(BATCH_WAIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeFailed, generateFailed]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (stage === 'review') void confirmAndGenerate();
      else next(false);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const startAnalysis = async (e?: FormEvent, target = url, fotos = allowImages) => {
    e?.preventDefault();
    if (!looksLikeUrl(target)) {
      setUrlError('Informe uma URL válida.');
      return false;
    }
    setUrlError(null);
    setStarting(true);
    try {
      let place: PlaceListing | undefined;
      try {
        place = JSON.parse(sessionStorage.getItem(`lp:place:${target.trim()}`) ?? 'null') ?? undefined;
      } catch {
        place = undefined;
      }
      const { jobId } = await analysisService.analyzeUrl(target.trim(), fotos, place);
      setAnalyzeJobId(jobId);
      setStage('analyzing');
      return true;
    } catch (err) {
      setUrlError(errorMessage(err));
      return false;
    } finally {
      setStarting(false);
    }
  };

  /** Começa a empresa atual do lote do zero (análise do link). */
  const startItem = async (b: LpBatch) => {
    const item = b.items[b.index];
    setCountdown(null);
    setUrl(item.url);
    setAllowImages(b.fotos);
    setDraft(emptyDraft());
    setMeta(null);
    setCompanyId(null);
    setAnalyzeJobId(null);
    setGenerateJobId(null);
    setStage('url');
    window.scrollTo({ top: 0 });
    // Link recusado: pula para a próxima depois da contagem
    if (!(await startAnalysis(undefined, item.url, b.fotos))) setCountdown(BATCH_WAIT);
  };

  /** Passa para a próxima empresa do lote; terminando, volta para a pesquisa. */
  const next = (generated: boolean) => {
    if (!batch) return;
    const b = { ...batch, index: batch.index + 1, ok: batch.ok + (generated ? 1 : 0) };
    if (b.index >= b.items.length) {
      saveBatch(null);
      setBatch(null);
      toast.success(`Lote concluído: ${b.ok} de ${b.items.length} LP(s) gerada(s).`);
      navigate('/buscar');
      return;
    }
    saveBatch(b);
    setBatch(b);
    void startItem(b);
  };

  const cancelBatch = () => {
    saveBatch(null);
    setBatch(null);
    setCountdown(null);
    toast.info('Lote interrompido. A empresa atual continua aberta aqui.');
  };

  // Qualquer alteração nos dados para a contagem, como o botão "Alterar"
  const changeDraft = (d: CompanyDraft) => {
    setCountdown(null);
    setDraft(d);
  };

  const fillManually = () => {
    setCountdown(null);
    setDraft({ ...emptyDraft(), reference_url: looksLikeUrl(url) ? url.trim() : null });
    setMeta(null);
    setStage('review');
  };

  const confirmAndGenerate = async () => {
    setCountdown(null);
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
        id = (await companyService.create({ ...cleaned, source_meta: meta ?? {}, analysis_job_id: analyzeJobId ?? undefined })).id;
        setCompanyId(id);
      }
      const { jobId } = await analysisService.generate(id, {
        ...(sellerId ? { sellerId } : {}),
        ...(clientLevelId ? { clientLevelId } : {}),
      });
      setGenerateJobId(jobId);
      setStage('generating');
      window.scrollTo({ top: 0 });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Em qual empresa do lote está, com a contagem para pular quando deu erro
  const failedHere = analyzeFailed || generateFailed || (stage === 'url' && !!urlError);
  const batchBar = batch ? (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm">
      <Layers className="size-4 flex-none text-brand-600" />
      <span className="min-w-0 flex-1">
        <strong>Lote: empresa {batch.index + 1} de {batch.items.length}</strong>
        <span className="text-zinc-600"> · {batch.items[batch.index].name}</span>
        {failedHere && countdown !== null ? <span className="block text-xs text-red-700">Pulando para a próxima em {countdown}s…</span> : null}
      </span>
      <Button size="sm" variant="secondary" icon={<SkipForward className="size-3.5" />} onClick={() => { setCountdown(null); next(false); }} disabled={saving} title="Deixa esta empresa sem LP e passa para a próxima">
        {failedHere ? 'Próxima' : 'Pular'}
      </Button>
      <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={cancelBatch}>Parar lote</Button>
    </div>
  ) : null;

  // ─── Etapa 1: URL ────────────────────────────────────────────────
  if (stage === 'url') {
    return (
      <div className="mx-auto max-w-2xl pt-4 lg:pt-12">
        {batchBar}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-ink text-white shadow-lg shadow-zinc-900/20">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Nova Landing Page</h1>
          <p className="mx-auto mt-2 max-w-md text-zinc-500">
            Informe o site da empresa ou o link dela no Google Maps. Vamos coletar as informações reais e montar uma página profissional.
          </p>
        </div>
        <Card className="p-5 sm:p-7">
          <form onSubmit={startAnalysis}>
            <label htmlFor="url" className="mb-2 block text-sm font-medium">Site ou link do Google</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="url"
                  className="h-12 pl-10 text-[15px]"
                  placeholder="www.empresa.com.br ou https://maps.app.goo.gl/…"
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
            <p className="mt-3 text-xs text-zinc-500">
              Empresa sem site? No Google Maps, abra o perfil da empresa, toque em <strong>Compartilhar</strong> → <strong>Copiar link</strong> e cole aqui. Os dados (endereço, telefone, horário, site) e as fotos vêm do perfil no Google (fotos exigem a “Local Business Data” assinada na chave do RapidAPI); depoimentos do Google não são copiados.
            </p>
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
        {batchBar}
        <h1 className="text-2xl font-semibold tracking-tight">Analisando empresa</h1>
        <p className="mt-1 truncate text-sm text-zinc-500" title={url}>{shortUrl(url, 70)}</p>
        <Card className="mt-6 p-5 sm:p-6">
          <ProgressSteps current={Math.max(j?.step ?? 1, 1)} range={[1, 6]} failed={failed} />
          {!failed ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2.5">
              <p className="text-xs leading-relaxed text-zinc-500">A leitura e interpretação pela IA costuma levar de 30 segundos a 2 minutos. Você pode acompanhar por aqui.</p>
              {j?.status !== 'done' ? <StopJobButton jobId={analyzeJobId} /> : null}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="flex items-start gap-2 text-sm font-medium text-red-700">
                <CircleSlash className="mt-0.5 size-4 flex-none" /> {j?.error ?? analyze.networkError}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => { setCountdown(null); setAnalyzeJobId(null); setStage('url'); }}>
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
        {batchBar}
        <h1 className="text-2xl font-semibold tracking-tight">Gerando Landing Page</h1>
        <p className="mt-1 text-sm text-zinc-500">{draft.trade_name || draft.name}</p>
        <Card className="mt-6 p-5 sm:p-6">
          <ProgressSteps current={Math.max(j?.step ?? 7, 7)} range={[1, 9]} failed={failed} done={j?.status === 'done'} />
          {!failed && j?.status !== 'done' ? (
            <div className="mt-5 flex justify-end">
              <StopJobButton jobId={generateJobId} />
            </div>
          ) : null}
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

  // Vendedor e nível do cliente: escolhidos junto com a confirmação dos dados da empresa
  const assignment = (
    <div className="grid gap-4 sm:grid-cols-2">
      <SellerPicker value={sellerId} onChange={setSellerId} disabled={saving} />
      <ClientLevelPicker value={clientLevelId} onChange={setClientLevelId} disabled={saving} />
    </div>
  );

  return (
    <div className="pb-28">
      {batchBar}
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
            <div className="mt-5 border-t border-zinc-100 pt-4">{assignment}</div>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-zinc-500"><FileSearch className="size-4" /> Fonte</div>
            <p className="text-sm text-zinc-600">{meta.pages.length} página(s) lida(s)</p>
            <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs text-zinc-500">
              {meta.pages.map((p) => <li key={p} className="truncate" title={p}>{shortUrl(p, 60)}</li>)}
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
      ) : (
        <Card className="mb-4 p-5">
          <div className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Empresa</div>
          {assignment}
        </Card>
      )}

      <CompanyForm value={draft} onChange={changeDraft} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/90 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Button variant="ghost" onClick={() => { setCountdown(null); setStage('url'); }} disabled={saving}>Voltar</Button>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Lote: confirma sozinho ao fim da contagem; "Alterar" para a contagem para editar com calma */}
            {batch && countdown !== null ? (
              <Button variant="secondary" size="lg" onClick={() => setCountdown(null)} disabled={saving} icon={<PencilLine className="size-4" />}>
                ALTERAR
              </Button>
            ) : null}
            <Button variant="brand" size="lg" className="relative isolate overflow-hidden" loading={saving} onClick={confirmAndGenerate} icon={<Sparkles className="size-4" />}>
              {/* Contagem do lote: a barra enche o botão até confirmar sozinho */}
              {batch && countdown !== null ? (
                <span aria-hidden className="fill-bar absolute inset-y-0 left-0 -z-10 bg-white/30" style={{ animationDuration: `${BATCH_WAIT}s` }} />
              ) : null}
              {batch ? `CONFIRMAR${countdown !== null ? ` (${countdown}s)` : ''}` : 'CONFIRMAR E GERAR LANDING PAGE'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
