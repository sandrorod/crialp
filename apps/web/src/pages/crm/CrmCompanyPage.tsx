import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CheckSquare, History, KanbanSquare, MessageCircle, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, ConfirmDialog, ErrorBlock, LoadingBlock } from '@/components/ui';
import { ContactForm, DealForm, TaskForm } from '@/components/crm/CrmForms';
import { Avatar, CrmBar, Pill, TONES, type CrmTone } from '@/components/crm/CrmTheme';
import { useAsync } from '@/hooks/useAsync';
import { errorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { crmService, dateTime, money, phone } from '@/services/crm';
import type { CrmContact, CrmDeal, CrmTask } from '@/types/crm';

type Editing = { kind: 'contact'; item?: CrmContact } | { kind: 'deal'; item?: CrmDeal } | { kind: 'task'; item?: CrmTask } | null;
type Removing = { kind: 'contact' | 'deal' | 'task'; id: string; label: string } | null;

export function CrmCompanyPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useAsync(() => crmService.company(id), [id]);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<Removing>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (loading && !data) return <LoadingBlock />;
  if (!data) return null;
  const { company, contacts, deals, tasks, conversations, notes } = data;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      if (removing.kind === 'contact') await crmService.removeContact(removing.id);
      if (removing.kind === 'deal') await crmService.removeDeal(removing.id);
      if (removing.kind === 'task') await crmService.removeTask(removing.id);
      setRemoving(null);
      void reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleTask = async (t: CrmTask) => {
    try {
      await crmService.setTaskDone(t.id, !t.done);
      void reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const companyWa = company.whatsapp || company.mobile;
  const address = [company.address, company.number, company.neighborhood, [company.city, company.state].filter(Boolean).join(' – ')].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">
      <div>
        <Link to="/crm" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-ink">
          <ArrowLeft className="size-4" /> Empresas
        </Link>
        <Card className="mt-2 overflow-hidden">
          <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5', TONES.blue.bar)}>
            <div className="flex min-w-0 items-start gap-4">
              <Avatar name={company.name} size="lg" />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-ink">{company.name}</h2>
                <p className="text-sm text-zinc-500">{[company.segment, address].filter(Boolean).join(' · ')}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-zinc-600">
                  Vendedor: {company.seller_names ? <strong className="text-ink">{company.seller_names}</strong> : <Pill tone="amber">sem vendedor</Pill>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {company.lp_slug ? (
                <a href={`/lp/${company.lp_slug}`} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm">
                    Ver Landing Page
                  </Button>
                </a>
              ) : null}
              {companyWa ? (
                <Link to={`/crm/whatsapp?empresa=${company.id}`}>
                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" icon={<MessageCircle className="size-4" />}>
                    WhatsApp {phone(companyWa)}
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
          {company.phone || company.email || company.website ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-blue-100/70 px-5 py-2.5 text-sm text-zinc-600">
              {company.phone ? <span>Tel: {phone(company.phone)}</span> : null}
              {company.email ? <span>{company.email}</span> : null}
              {company.website ? (
                <a href={company.website} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                  {company.website}
                </a>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <Section tone="sky" icon={<Users className="size-4" />} title="Contatos" onAdd={() => setEditing({ kind: 'contact' })}>
        {!contacts.length ? (
          <Empty>Nenhum contato cadastrado.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">
                    {c.name}
                    {c.job_title ? <span className="font-normal text-zinc-500"> · {c.job_title}</span> : null}
                  </div>
                  <div className="text-xs text-zinc-500">{[c.email, phone(c.phone)].filter(Boolean).join(' · ')}</div>
                </div>
                {c.whatsapp ? (
                  <Link to={`/crm/whatsapp?contato=${c.id}`}>
                    <Button variant="secondary" size="sm" className="text-emerald-700 hover:bg-emerald-50" icon={<MessageCircle className="size-4" />}>
                      {phone(c.whatsapp)}
                    </Button>
                  </Link>
                ) : null}
                <IconBtn label="Editar" onClick={() => setEditing({ kind: 'contact', item: c })}>
                  <Pencil className="size-4" />
                </IconBtn>
                <IconBtn label="Excluir" onClick={() => setRemoving({ kind: 'contact', id: c.id, label: c.name })}>
                  <Trash2 className="size-4" />
                </IconBtn>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section tone="violet" icon={<KanbanSquare className="size-4" />} title="Negócios" onAdd={() => setEditing({ kind: 'deal' })}>
          {!deals.length ? (
            <Empty>Nenhum negócio.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {deals.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{d.title}</div>
                    <div className="text-xs text-zinc-500">
                      {money(d.value)}
                      {d.expected_close ? ` · previsão ${formatDate(d.expected_close)}` : ''}
                    </div>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: d.stage_color }}>
                    {d.stage_name}
                  </span>
                  <IconBtn label="Editar" onClick={() => setEditing({ kind: 'deal', item: d })}>
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn label="Excluir" onClick={() => setRemoving({ kind: 'deal', id: d.id, label: d.title })}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section tone="amber" icon={<CheckSquare className="size-4" />} title="Tarefas e follow-ups" onAdd={() => setEditing({ kind: 'task' })}>
          {!tasks.length ? (
            <Empty>Nenhuma tarefa.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {tasks.map((t) => {
                const late = !t.done && t.due_at && new Date(t.due_at) < new Date();
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <input type="checkbox" className="size-4 accent-emerald-600" checked={t.done} onChange={() => void toggleTask(t)} aria-label="Concluída" />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing({ kind: 'task', item: t })}>
                      <div className={cn('font-medium text-ink', t.done && 'font-normal text-zinc-400 line-through')}>{t.title}</div>
                      <div className="text-xs text-zinc-500">{t.assignee_name}</div>
                    </button>
                    <Pill tone={t.done ? 'emerald' : late ? 'rose' : 'zinc'} className="shrink-0" title={late ? 'Atrasada' : undefined}>
                      {t.due_at ? dateTime(t.due_at) : 'sem prazo'}
                    </Pill>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section tone="emerald" icon={<MessageCircle className="size-4" />} title="Conversas no WhatsApp">
          {!conversations.length ? (
            <Empty>Nenhuma conversa ainda.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {conversations.map((cv) => (
                <li key={cv.id}>
                  <Link to={`/crm/whatsapp?id=${cv.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-emerald-50/40">
                    <Avatar name={cv.contact_name ?? cv.push_name ?? cv.phone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">{cv.contact_name ?? cv.push_name ?? phone(cv.phone)}</div>
                      <div className="truncate text-xs text-zinc-500">{cv.last_message}</div>
                    </div>
                    {cv.unread ? <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{cv.unread}</span> : null}
                    <span className="text-xs text-zinc-400">{dateTime(cv.last_message_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          tone="rose"
          icon={<History className="size-4" />}
          title="Histórico de prospecção"
          action={
            <Link to="/vendas" className="text-sm font-medium text-rose-700 hover:underline">
              Lançar em Vendas
            </Link>
          }
        >
          {!notes.length ? (
            <Empty>Nenhum lançamento.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {notes.map((n) => (
                <li key={n.id} className="px-5 py-3 text-sm">
                  <div className="text-xs text-zinc-500">
                    {n.author_name} · {dateTime(n.created_at)}
                  </div>
                  <div className="whitespace-pre-wrap text-zinc-700">{n.note}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {editing?.kind === 'contact' ? <ContactForm contact={editing.item} companyId={company.id} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      {editing?.kind === 'deal' ? <DealForm deal={editing.item} companyId={company.id} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      {editing?.kind === 'task' ? <TaskForm task={editing.item} companyId={company.id} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      <ConfirmDialog
        open={!!removing}
        title="Excluir"
        description={
          <>
            Excluir <strong>{removing?.label}</strong>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        danger
        loading={busy}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function Section({
  tone,
  icon,
  title,
  onAdd,
  action,
  children,
}: {
  tone: CrmTone;
  icon: ReactNode;
  title: string;
  onAdd?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CrmBar tone={tone} icon={icon} title={title} className="py-2.5">
        <div className="ml-auto">
          {action ??
            (onAdd ? (
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={onAdd}>
                Adicionar
              </Button>
            ) : null)}
        </div>
      </CrmBar>
      {children}
    </Card>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-5 py-8 text-center text-sm text-zinc-500">{children}</p>;

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-ink">
      {children}
    </button>
  );
}
