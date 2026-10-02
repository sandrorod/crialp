import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, PanelsTopLeft, Save, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CompanyForm, toDraft } from '@/components/company/CompanyForm';
import { SourcesPanel } from '@/components/company/SourcesPanel';
import { ProgressSteps } from '@/components/ProgressSteps';
import { StopJobButton } from '@/components/StopJobButton';
import { Button, Card, ConfirmDialog, ErrorBlock, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useJob } from '@/hooks/useJob';
import { errorMessage } from '@/lib/api';
import { analysisService, companyService } from '@/services';
import type { AnalysisMeta, CompanyDraft } from '@/types';
import { formatDate, shortUrl } from '@/lib/utils';

/** O que a coleta encontrou (e não encontrou) no site de referência. */
function SourceCard({ meta }: { meta: AnalysisMeta }) {
  return (
    <details className="mb-4 rounded-xl border border-zinc-200/80 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">Fonte da coleta</span>
        <span className="text-xs text-zinc-500">
          {meta.pages.length} página(s) lida(s) · {formatDate(meta.analyzed_at, true)}
        </span>
      </summary>
      <div className="grid gap-5 border-t border-zinc-100 p-5 text-sm sm:grid-cols-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-zinc-500">Páginas lidas</div>
          <ul className="space-y-1 text-xs">
            {meta.pages.map((p) => (
              <li key={p} className="truncate"><a href={p} target="_blank" rel="noreferrer" title={p} className="text-brand-600 hover:underline">{shortUrl(p)}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-amber-700">Não encontrado no site</div>
          {meta.missing_info.length ? <ul className="list-disc space-y-0.5 pl-4 text-xs text-zinc-600">{meta.missing_info.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="text-xs text-zinc-400">—</p>}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-red-700">Descartado (não confirmado na fonte)</div>
          {meta.removed.length ? <ul className="list-disc space-y-0.5 pl-4 text-xs text-zinc-600">{meta.removed.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="text-xs text-zinc-400">Nada descartado.</p>}
        </div>
      </div>
    </details>
  );
}

export function CompanyEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: company, error, loading, reload } = useAsync(() => companyService.get(id), [id]);
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, networkError } = useJob<{ landingPageId: string }>(jobId);

  useEffect(() => {
    if (company) {
      setDraft(toDraft(company));
      setDirty(false);
    }
  }, [company]);

  useEffect(() => {
    if (job?.status === 'done' && job.result) {
      toast.success('Landing Page gerada.');
      navigate(`/landing-pages/${job.result.landingPageId}`);
    }
    if (job?.status === 'error') toast.error(job.error ?? 'Não foi possível gerar a Landing Page. Tente novamente.');
  }, [job, navigate]);

  const save = async () => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await companyService.update(id, {
        ...draft,
        services: draft.services.filter((s) => s.name.trim()),
        products: draft.products.filter((p) => p.name.trim()),
        testimonials: draft.testimonials.filter((t) => t.text.trim()),
        other_socials: draft.other_socials.filter((s) => s.url.trim()),
      });
      setDraft(toDraft(updated));
      setDirty(false);
      toast.success('Empresa salva. A Landing Page já reflete os novos dados.');
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (dirty && !(await save())) return;
    try {
      const r = await analysisService.generate(id, company?.landing_page ? { landingPageId: company.landing_page.id, keepTheme: true } : {});
      setJobId(r.jobId);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await companyService.remove(id);
      toast.success('Empresa excluída.');
      navigate('/empresas');
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (loading || !company || !draft) return <Card><LoadingBlock rows={6} /></Card>;

  const generating = !!jobId && job?.status !== 'done' && job?.status !== 'error' && !networkError;

  return (
    <div className="pb-24">
      <Link to="/empresas" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-ink">
        <ArrowLeft className="size-4" /> Empresas
      </Link>
      <PageHeader
        title={company.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {company.segment ?? 'Sem segmento'}
            {company.landing_page ? <StatusBadge status={company.landing_page.status} /> : null}
          </span>
        }
        actions={
          <>
            {company.landing_page ? (
              <Link to={`/landing-pages/${company.landing_page.id}`}>
                <Button variant="secondary" icon={<PanelsTopLeft className="size-4" />}>Landing Page</Button>
              </Link>
            ) : null}
            <Button variant="brand" onClick={generate} loading={generating} icon={<Sparkles className="size-4" />}>
              {company.landing_page ? 'Regenerar Landing Page' : 'Gerar Landing Page'}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="size-4" />} aria-label="Excluir" />
          </>
        }
      />

      {generating ? (
        <Card className="mb-4 p-5">
          <ProgressSteps current={Math.max(job?.step ?? 7, 7)} range={[7, 9]} />
          <div className="mt-4 flex justify-end">
            <StopJobButton jobId={jobId} />
          </div>
        </Card>
      ) : null}

      {company.source_meta && 'final_url' in company.source_meta ? <SourceCard meta={company.source_meta as AnalysisMeta} /> : null}
      <SourcesPanel companyId={id} draft={draft} onApply={(patch) => { setDraft({ ...draft, ...patch }); setDirty(true); toast.success('Aplicado ao cadastro. Clique em "Salvar empresa" para gravar.'); }} />

      <CompanyForm value={draft} companyId={id} onChange={(v) => { setDraft(v); setDirty(true); }} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/90 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-[1280px] items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <span className="mr-auto text-sm text-zinc-500">{dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
          <Button onClick={save} loading={saving} disabled={!dirty} icon={<Save className="size-4" />}>Salvar empresa</Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Excluir empresa?"
        description="Todos os dados da empresa e a Landing Page vinculada serão excluídos permanentemente."
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
