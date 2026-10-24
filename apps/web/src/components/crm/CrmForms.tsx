import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { crmService, toLocalInput } from '@/services/crm';
import type { CrmContact, CrmDeal, CrmTask } from '@/types/crm';

const MANAGERS = ['owner', 'admin'];
const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** Seletor de empresa (lista as que o usuário pode ver). */
function CompanySelect({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const { data } = useAsync(() => crmService.companies({}), []);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{required ? 'Selecione…' : '—'}</option>
      {data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

function Footer({ onClose, saving, form, onDelete }: { onClose: () => void; saving: boolean; form: string; onDelete?: () => void }) {
  return (
    <>
      {onDelete ? (
        <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete} disabled={saving}>
          Excluir
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        Cancelar
      </Button>
      <Button type="submit" form={form} loading={saving}>
        Salvar
      </Button>
    </>
  );
}

// ─── Contato ────────────────────────────────────────────────────────
export function ContactForm({
  contact,
  initial,
  companyId,
  onClose,
  onSaved,
}: {
  contact?: CrmContact | null;
  initial?: Partial<CrmContact>;
  companyId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    company_id: contact?.company_id ?? companyId ?? '',
    name: contact?.name ?? initial?.name ?? '',
    job_title: contact?.job_title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    whatsapp: contact?.whatsapp ?? initial?.whatsapp ?? '',
    notes: contact?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        company_id: f.company_id,
        name: f.name,
        job_title: orNull(f.job_title),
        email: orNull(f.email),
        phone: orNull(f.phone),
        whatsapp: orNull(f.whatsapp),
        notes: orNull(f.notes),
      };
      if (contact) await crmService.updateContact(contact.id, body);
      else await crmService.createContact(body);
      toast.success('Contato salvo.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={contact ? 'Editar contato' : 'Novo contato'}
      onClose={onClose}
      busy={saving}
      footer={<Footer onClose={onClose} saving={saving} form="crm-contact" />}
    >
      <form id="crm-contact" onSubmit={submit} className="space-y-3">
        {!companyId ? (
          <Field label="Empresa *">
            <CompanySelect value={f.company_id} onChange={(v) => setF({ ...f, company_id: v })} required />
          </Field>
        ) : null}
        <Field label="Nome *">
          <Input required value={f.name} onChange={set('name')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cargo">
            <Input value={f.job_title} onChange={set('job_title')} />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Telefone">
            <Input value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="WhatsApp (com DDD)">
            <Input placeholder="(11) 98888-7777" value={f.whatsapp} onChange={set('whatsapp')} />
          </Field>
        </div>
        <Field label="Observações">
          <Textarea value={f.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Negócio ────────────────────────────────────────────────────────
export function DealForm({
  deal,
  companyId,
  stageId,
  onClose,
  onSaved,
}: {
  deal?: CrmDeal | null;
  companyId?: string;
  stageId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: stages } = useAsync(() => crmService.stages(), []);
  const [f, setF] = useState({
    title: deal?.title ?? '',
    company_id: deal?.company_id ?? companyId ?? '',
    contact_id: deal?.contact_id ?? '',
    stage_id: deal?.stage_id ?? stageId ?? '',
    value: deal ? String(Number(deal.value)) : '',
    expected_close: deal?.expected_close?.slice(0, 10) ?? '',
    notes: deal?.notes ?? '',
  });
  const { data: detail } = useAsync(() => (f.company_id ? crmService.company(f.company_id) : Promise.resolve(null)), [f.company_id]);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const stage = f.stage_id || stages?.[0]?.id || '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        title: f.title,
        company_id: f.company_id,
        contact_id: f.contact_id || null,
        stage_id: stage,
        value: Number(f.value.replace(/\./g, '').replace(',', '.')) || 0,
        expected_close: f.expected_close || null,
        notes: orNull(f.notes),
      };
      if (deal) await crmService.updateDeal(deal.id, body);
      else await crmService.createDeal(body);
      toast.success('Negócio salvo.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deal || !window.confirm(`Excluir o negócio "${deal.title}"? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      await crmService.removeDeal(deal.id);
      toast.success('Negócio excluído.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={deal ? 'Editar negócio' : 'Novo negócio'}
      onClose={onClose}
      busy={saving}
      footer={<Footer onClose={onClose} saving={saving} form="crm-deal" onDelete={deal ? () => void remove() : undefined} />}
    >
      <form id="crm-deal" onSubmit={submit} className="space-y-3">
        <Field label="Título *">
          <Input required value={f.title} onChange={set('title')} placeholder="Ex.: Plano anual do site" />
        </Field>
        {!companyId ? (
          <Field label="Empresa *">
            <CompanySelect value={f.company_id} onChange={(v) => setF({ ...f, company_id: v, contact_id: '' })} required />
          </Field>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contato">
            <Select value={f.contact_id} onChange={set('contact_id')}>
              <option value="">—</option>
              {detail?.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={stage} onChange={set('stage_id')}>
              {stages?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor (R$)">
            <Input inputMode="decimal" value={f.value} onChange={set('value')} placeholder="0,00" />
          </Field>
          <Field label="Previsão de fechamento">
            <Input type="date" value={f.expected_close} onChange={set('expected_close')} />
          </Field>
        </div>
        <Field label="Observações">
          <Textarea value={f.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Modal>
  );
}

// ─── Tarefa ─────────────────────────────────────────────────────────
export function TaskForm({ task, companyId, onClose, onSaved }: { task?: CrmTask | null; companyId?: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const isManager = !!user && MANAGERS.includes(user.role);
  const { data: users } = useAsync(() => (isManager ? crmService.users() : Promise.resolve([])), [isManager]);
  const [f, setF] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    due_at: toLocalInput(task?.due_at),
    company_id: task?.company_id ?? companyId ?? '',
    assignee_id: task?.assignee_id ?? user?.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        title: f.title,
        description: orNull(f.description),
        due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
        company_id: f.company_id || null,
        assignee_id: isManager ? f.assignee_id || null : null,
      };
      if (task) await crmService.updateTask(task.id, body);
      else await crmService.createTask(body);
      toast.success('Tarefa salva.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={task ? 'Editar tarefa' : 'Nova tarefa'}
      onClose={onClose}
      busy={saving}
      footer={<Footer onClose={onClose} saving={saving} form="crm-task" />}
    >
      <form id="crm-task" onSubmit={submit} className="space-y-3">
        <Field label="O que fazer *">
          <Input required value={f.title} onChange={set('title')} placeholder="Ex.: Ligar para retomar a proposta" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quando">
            <Input type="datetime-local" value={f.due_at} onChange={set('due_at')} />
          </Field>
          {!companyId ? (
            <Field label="Empresa">
              <CompanySelect value={f.company_id} onChange={(v) => setF({ ...f, company_id: v })} />
            </Field>
          ) : null}
          {isManager ? (
            <Field label="Responsável">
              <Select value={f.assignee_id} onChange={set('assignee_id')}>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <Field label="Detalhes">
          <Textarea value={f.description} onChange={set('description')} />
        </Field>
      </form>
    </Modal>
  );
}
