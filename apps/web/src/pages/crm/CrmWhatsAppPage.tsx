import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Ban, ChevronDown, Building2, Check, CheckCheck, Clock, MessageCircle, MessageSquarePlus, FileText, Mic, Paperclip, Pencil, Plus, Search, Send, Smile, Tag, Trash2, User, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { ContactForm } from '@/components/crm/CrmForms';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crmService, dateTime, phone, waKey, type OutgoingMedia, type SendTo } from '@/services/crm';
import type { CrmConversation, CrmLabel, CrmMessage } from '@/types/crm';
import { isCrmManager } from './CrmLayout';

const LIST_POLL = 6_000;

// Seletor de emojis só é baixado quando aberto
const EmojiPanel = lazy(() => import('@/components/crm/EmojiPanel'));
const CHAT_POLL = 4_000;

const title = (c: CrmConversation) => c.contact_name ?? c.push_name ?? phone(c.phone);

/** Recarrega periodicamente enquanto a aba está visível (o lp não tem tempo real). */
function usePolling(fn: () => void, ms: number, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && ref.current(), ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function CrmWhatsAppPage() {
  const { user } = useAuth();
  const manager = isCrmManager(user?.role);
  const { refreshUnread } = useOutletContext<{ refreshUnread: () => void }>();
  const [params, setParams] = useSearchParams();
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [managingLabels, setManagingLabels] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const filters = { unlinked: onlyUnlinked, label: labelFilter, search: debounced };
  const { data: labels, reload: reloadLabels } = useAsync(() => crmService.labels(), []);
  const { data: conversations, reload, setData } = useAsync(() => crmService.conversations(filters), [onlyUnlinked, labelFilter, debounced]);
  // Busca as mensagens novas na Evolution e recarrega a lista (e o contador do menu) quando chegou algo
  usePolling(
    () =>
      void crmService
        .sync()
        .catch(() => ({ added: 0 }))
        .then((r) => {
          if (r.added) refreshUnread();
          return crmService.conversations(filters);
        })
        .then(setData)
        .catch(() => {}),
    LIST_POLL,
    [onlyUnlinked, labelFilter, debounced],
  );

  const selectedId = params.get('id');
  const contactParam = params.get('contato');
  const companyParam = params.get('empresa');

  // Vindo de um contato/empresa: abre a conversa do número cadastrado ATUAL (se já existir) ou prepara uma nova
  useEffect(() => {
    if (!conversations || selectedId || (!contactParam && !companyParam)) return;
    let alive = true;
    const number = contactParam
      ? crmService.contact(contactParam).then((c) => c.whatsapp)
      : crmService.company(companyParam!).then((d) => d.company.whatsapp || d.company.mobile);
    void number
      .then((n) => {
        const key = waKey(n);
        const found = key ? conversations.find((c) => waKey(c.phone) === key) : null;
        if (alive && found) setParams({ id: found.id }, { replace: true });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [conversations, contactParam, companyParam, selectedId, setParams]);
  const [picking, setPicking] = useState(false);

  const list = conversations ?? [];
  // A conversa aberta continua na tela mesmo se a busca/etiqueta tirar ela da lista
  const lastSelected = useRef<CrmConversation | null>(null);
  const found = conversations?.find((c) => c.id === selectedId) ?? null;
  if (found) lastSelected.current = found;
  const selected = found ?? (lastSelected.current?.id === selectedId ? lastSelected.current : null);
  const starting = !selectedId && (contactParam || companyParam);
  const open = !!selectedId || !!starting;

  return (
    <Card className="flex h-[calc(100dvh-260px)] min-h-[480px] overflow-hidden">
      <aside className={cn('w-full flex-col border-r border-zinc-100 md:flex md:w-80', open ? 'hidden' : 'flex')}>
        <div className="space-y-2 border-b border-zinc-100 p-3">
          {/* Uma linha: pesquisa, filtro de etiqueta (só as cores), nova conversa e editar etiquetas */}
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input placeholder="Pesquisar…" title="Nome, número, empresa ou texto das mensagens" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8 text-[13px]" />
            </div>
            <LabelFilter labels={labels ?? []} value={labelFilter} onChange={setLabelFilter} />
            <button type="button" onClick={() => setPicking(true)} className={TOOL_BTN} title="Nova conversa" aria-label="Nova conversa">
              <MessageSquarePlus className="size-4" />
            </button>
            <button type="button" onClick={() => setManagingLabels(true)} className={TOOL_BTN} title="Editar etiquetas" aria-label="Editar etiquetas">
              <Tag className="size-4" />
            </button>
          </div>
          {manager ? (
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" className="accent-brand-600" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />
              Só números sem empresa no sistema
            </label>
          ) : null}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {!conversations ? <li className="grid place-items-center p-6"><Spinner /></li> : null}
          {conversations && !list.length ? (
            <li className="p-6 text-center text-sm text-zinc-500">{debounced || labelFilter ? 'Nada encontrado com essa busca ou etiqueta.' : 'Nenhuma conversa.'}</li>
          ) : null}
          {list.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setParams({ id: c.id })}
                className={cn('flex w-full flex-col gap-0.5 border-b border-zinc-50 px-4 py-3 text-left hover:bg-zinc-50', c.id === selectedId && 'bg-zinc-100')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{title(c)}</span>
                  <span className="shrink-0 text-[11px] text-zinc-400">{dateTime(c.last_message_at)}</span>
                </div>
                <span className="truncate text-xs text-zinc-500">{c.company_name ?? <span className="text-amber-600">sem empresa no sistema</span>}</span>
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-xs text-zinc-500">
                    {c.matched ? <Highlight text={c.matched.body} term={debounced} /> : c.last_message}
                  </span>
                  {c.unread ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span> : null}
                </div>
                {c.labels?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.labels.map((l) => <LabelChip key={l.id} label={l} />)}
                  </div>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col bg-zinc-50', open ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <Chat
            key={selected.id}
            conversation={selected}
            labels={labels ?? []}
            onManageLabels={() => setManagingLabels(true)}
            manager={manager}
            onBack={() => setParams({})}
            onChanged={() => {
              void reload();
              refreshUnread();
            }}
          />
        ) : starting ? (
          <NewConversation
            contactId={contactParam}
            companyId={companyParam}
            onBack={() => setParams({})}
            onSent={(id) => {
              void reload();
              setParams({ id }, { replace: true });
            }}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-zinc-500">
            <div className="text-center">
              <MessageCircle className="mx-auto mb-2 size-8 text-zinc-300" />
              Selecione uma conversa
            </div>
          </div>
        )}
      </section>
      {managingLabels ? (
        <LabelsManager
          labels={labels ?? []}
          onClose={() => setManagingLabels(false)}
          onChanged={() => {
            void reloadLabels();
            void reload();
          }}
          onRemoved={(id) => labelFilter === id && setLabelFilter('')}
        />
      ) : null}
      {picking ? (
        <NewChatPicker
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false);
            setParams(p);
          }}
        />
      ) : null}
    </Card>
  );
}

const TOOL_BTN = 'grid size-9 flex-none place-items-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-ink';

/**
 * Filtro de etiqueta compacto: fechado mostra só a(s) cor(es); aberto, cada cor com o nome ao lado.
 */
function LabelFilter({ labels, value, onChange }: { labels: CrmLabel[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const current = labels.find((l) => l.id === value);
  const title = current ? `Etiqueta: ${current.name}` : value === 'none' ? 'Sem etiqueta' : 'Todas as etiquetas';
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const Option = ({ v, swatch, label }: { v: string; swatch: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={() => pick(v)}
      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-50', value === v && 'bg-zinc-100 font-medium')}
    >
      {swatch}
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div ref={box} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(TOOL_BTN, (value || open) && 'border-zinc-400 text-ink')}
        title={title}
        aria-label={title}
        aria-expanded={open}
      >
        {current ? (
          <span className="size-4 rounded" style={{ background: current.color }} />
        ) : value === 'none' ? (
          <span className="size-4 rounded border-2 border-dashed border-zinc-300" />
        ) : labels.length ? (
          // Todas: as cores das etiquetas em miniatura
          <span className="grid size-4 grid-cols-2 gap-px overflow-hidden rounded">
            {[0, 1, 2, 3].map((i) => <span key={i} style={{ background: labels[i % labels.length].color }} />)}
          </span>
        ) : (
          <span className="size-4 rounded border border-zinc-300" />
        )}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
          <Option v="" label="Todas as etiquetas" swatch={<span className="size-3.5 flex-none rounded border border-zinc-300 bg-white" />} />
          <Option v="none" label="Sem etiqueta" swatch={<span className="size-3.5 flex-none rounded border-2 border-dashed border-zinc-300" />} />
          {labels.length ? <div className="my-1 border-t border-zinc-100" /> : null}
          <div className="max-h-64 overflow-y-auto">
            {labels.map((l) => (
              <Option key={l.id} v={l.id} label={l.name} swatch={<span className="size-3.5 flex-none rounded" style={{ background: l.color }} />} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const LABEL_COLORS = ['#2553e0', '#0ea5e9', '#16a34a', '#84cc16', '#f59e0b', '#f97316', '#dc2626', '#ec4899', '#8b5cf6', '#71717a'];

function LabelChip({ label }: { label: CrmLabel }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium" style={{ background: `${label.color}1f`, color: label.color }}>
      <span className="size-1.5 flex-none rounded-full" style={{ background: label.color }} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/** Trecho da mensagem encontrada na busca, com o termo destacado. */
function Highlight({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  const start = Math.max(0, i - 24);
  return (
    <>
      {start > 0 ? '…' : ''}
      {text.slice(start, i)}
      <mark className="rounded bg-amber-100 px-0.5 text-ink">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

/** Etiquetas da conversa aberta: marcar/desmarcar e criar uma nova ali mesmo. */
function LabelPicker({ conversation, labels, onManage, onChanged }: { conversation: CrmConversation; labels: CrmLabel[]; onManage: () => void; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => (conversation.labels ?? []).map((l) => l.id));
  const [newName, setNewName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setSelected((conversation.labels ?? []).map((l) => l.id)), [conversation.labels]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const save = async (ids: string[]) => {
    setSelected(ids);
    try {
      await crmService.setConversationLabels(conversation.id, ids);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const l = await crmService.createLabel({ name, color: LABEL_COLORS[labels.length % LABEL_COLORS.length] });
      setNewName('');
      await save([...selected, l.id]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div ref={box} className="relative">
      <Button variant="secondary" size="sm" icon={<Tag className="size-4" />} onClick={() => setOpen((o) => !o)}>
        Etiquetas{selected.length ? ` (${selected.length})` : ''}
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Etiquetar conversa</p>
          <div className="max-h-56 overflow-y-auto">
            {!labels.length ? <p className="px-1 py-2 text-xs text-zinc-500">Nenhuma etiqueta ainda. Crie a primeira abaixo.</p> : null}
            {labels.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-zinc-50">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={selected.includes(l.id)}
                  onChange={(e) => void save(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))}
                />
                <span className="size-2.5 flex-none rounded-full" style={{ background: l.color }} />
                <span className="truncate">{l.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-1 border-t border-zinc-100 pt-2">
            <Input
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void create();
                }
              }}
              placeholder="Nova etiqueta"
              className="h-8 text-[13px]"
            />
            <Button size="sm" onClick={() => void create()} disabled={!newName.trim()} aria-label="Criar etiqueta" icon={<Plus className="size-4" />} />
          </div>
          <button type="button" onClick={() => { setOpen(false); onManage(); }} className="mt-1 w-full rounded-md px-1 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50 hover:text-ink">
            ⚙ Gerenciar etiquetas (cores, nomes, excluir)
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Criar, renomear, trocar a cor e excluir etiquetas (valem para a equipe toda). */
function LabelsManager({ labels, onClose, onChanged, onRemoved }: { labels: CrmLabel[]; onClose: () => void; onChanged: () => void; onRemoved: (id: string) => void }) {
  const { data, reload } = useAsync(() => crmService.labels(), []);
  const list = data ?? labels;
  const [editing, setEditing] = useState<{ id: string | null; name: string; color: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      if (editing.id) await crmService.updateLabel(editing.id, { name: editing.name.trim(), color: editing.color });
      else await crmService.createLabel({ name: editing.name.trim(), color: editing.color });
      setEditing(null);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (l: CrmLabel) => {
    const uses = l.conversations ? ` Ela sai de ${l.conversations} conversa${l.conversations > 1 ? 's' : ''}.` : '';
    if (!window.confirm(`Excluir a etiqueta "${l.name}"?${uses}`)) return;
    try {
      await crmService.removeLabel(l.id);
      onRemoved(l.id);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      title="Etiquetas"
      description="Valem para toda a equipe, como no WhatsApp Business."
      onClose={onClose}
      busy={busy}
      actions={
        <button
          type="button"
          onClick={() => setEditing({ id: null, name: '', color: LABEL_COLORS[list.length % LABEL_COLORS.length] })}
          disabled={!!editing}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-ink disabled:opacity-40"
          aria-label="Nova etiqueta"
          title="Nova etiqueta"
        >
          <Plus className="size-5" />
        </button>
      }
    >
      <ul className="space-y-1">
        {editing && !editing.id ? (
          <LabelEditRow value={editing} onChange={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} busy={busy} />
        ) : null}
        {list.map((l) =>
          editing?.id === l.id ? (
            <LabelEditRow key={l.id} value={editing} onChange={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} busy={busy} />
          ) : (
            <li key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
              <span className="size-3 flex-none rounded-full" style={{ background: l.color }} />
              <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
              <span className="text-xs text-zinc-400">{l.conversations ?? 0}</span>
              <button type="button" onClick={() => setEditing({ id: l.id, name: l.name, color: l.color })} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-ink" aria-label={`Editar ${l.name}`} title="Editar">
                <Pencil className="size-3.5" />
              </button>
              <button type="button" onClick={() => void remove(l)} className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label={`Excluir ${l.name}`} title="Excluir">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ),
        )}
        {!list.length && !editing ? <li className="py-4 text-center text-sm text-zinc-500">Nenhuma etiqueta ainda. Clique no + para criar.</li> : null}
      </ul>
    </Modal>
  );
}

function LabelEditRow({
  value, onChange, onSave, onCancel, busy,
}: { value: { id: string | null; name: string; color: string }; onChange: (v: { id: string | null; name: string; color: string }) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <li className="space-y-2 rounded-lg border border-zinc-200 p-2">
      <Input
        autoFocus
        maxLength={40}
        value={value.name}
        placeholder="Nome da etiqueta"
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {LABEL_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onChange({ ...value, color: c })} className={cn('size-6 rounded-full ring-offset-2', value.color === c && 'ring-2 ring-ink')} style={{ background: c }} aria-label={`Cor ${c}`} />
        ))}
        <input type="color" value={value.color} onChange={(e) => onChange({ ...value, color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-zinc-200 p-0" aria-label="Outra cor" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={onSave} loading={busy} disabled={!value.name.trim()}>Salvar</Button>
      </div>
    </li>
  );
}

/** Escolhe uma empresa ou contato com WhatsApp cadastrado para começar (ou abrir) a conversa. */
function NewChatPicker({ onClose, onPick }: { onClose: () => void; onPick: (p: { empresa: string } | { contato: string }) => void }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data, loading } = useAsync(() => crmService.whatsappTargets(debounced || undefined), [debounced]);
  const empty = data && !data.companies.length && !data.contacts.length;
  const Item = ({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) => (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-50">
        <span className="text-zinc-400">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{title}</span>
          <span className="block truncate text-xs text-zinc-500">{sub}</span>
        </span>
      </button>
    </li>
  );
  return (
    <Modal open title="Nova conversa" description="Empresas e contatos com WhatsApp cadastrado" onClose={onClose}>
      <Input autoFocus placeholder="Buscar por nome ou número…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {loading && !data ? <div className="grid place-items-center p-6"><Spinner /></div> : null}
        {empty ? <p className="p-6 text-center text-sm text-zinc-500">Nada encontrado com WhatsApp cadastrado.</p> : null}
        {data?.contacts.length ? (
          <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Contatos</p>
            <ul>
              {data.contacts.map((c) => (
                <Item key={c.id} icon={<User className="size-4" />} title={c.name} sub={`${phone(c.whatsapp)} · ${c.company_name}`} onClick={() => onPick({ contato: c.id })} />
              ))}
            </ul>
          </>
        ) : null}
        {data?.companies.length ? (
          <>
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Empresas</p>
            <ul>
              {data.companies.map((c) => (
                <Item key={c.id} icon={<Building2 className="size-4" />} title={c.name} sub={[phone(c.whatsapp), c.city].filter(Boolean).join(' · ')} onClick={() => onPick({ empresa: c.id })} />
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function Chat({
  conversation, labels, onManageLabels, manager, onBack, onChanged,
}: { conversation: CrmConversation; labels: CrmLabel[]; onManageLabels: () => void; manager: boolean; onBack: () => void; onChanged: () => void }) {
  const { data: messages, setData } = useAsync(() => crmService.messages(conversation.id), [conversation.id]);
  usePolling(() => void crmService.messages(conversation.id).then(setData).catch(() => {}), CHAT_POLL, [conversation.id]);
  const [linking, setLinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const removeMessage = async (m: CrmMessage, everyone: boolean) => {
    const question = everyone
      ? 'Apagar esta mensagem para todos? Ela some também do WhatsApp do cliente.'
      : 'Apagar esta mensagem só aqui no CRM? Ela continua no WhatsApp do cliente.';
    if (!window.confirm(question)) return;
    try {
      await crmService.removeMessage(m.id, everyone);
      setData(await crmService.messages(conversation.id));
      onChanged();
      toast.success(everyone ? 'Mensagem apagada para todos.' : 'Mensagem apagada do CRM.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // Reação aparece na hora; se o WhatsApp recusar, volta como estava
  const react = async (m: CrmMessage, emoji: string) => {
    const before = messages;
    setData((messages ?? []).map((x) => (x.id === m.id ? { ...x, my_reaction: emoji || null } : x)));
    try {
      await crmService.react(m.id, emoji);
    } catch (err) {
      setData(before);
      toast.error(errorMessage(err));
    }
  };

  // Chaves: no Chrome atual scrollIntoView devolve uma Promise, que o React trataria como função de limpeza
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);
  useEffect(() => {
    if (conversation.unread) void crmService.markRead(conversation.id).then(onChanged).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.unread]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
        <button className="md:hidden" onClick={onBack} aria-label="Voltar"><ArrowLeft className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink">{title(conversation)}</div>
          <div className="truncate text-xs text-zinc-500">
            {phone(conversation.phone)}
            {conversation.company_id ? (
              <> · <Link to={`/crm/empresas/${conversation.company_id}`} className="hover:underline">{conversation.company_name}</Link></>
            ) : null}
          </div>
          {conversation.labels?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">{conversation.labels.map((l) => <LabelChip key={l.id} label={l} />)}</div>
          ) : null}
        </div>
        <LabelPicker conversation={conversation} labels={labels} onManage={onManageLabels} onChanged={onChanged} />
        {manager && !conversation.contact_id ? (
          <Button variant="secondary" size="sm" icon={<UserPlus className="size-4" />} onClick={() => setLinking(true)}>
            {conversation.company_id ? 'Salvar como contato' : 'Vincular a uma empresa'}
          </Button>
        ) : null}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {!messages ? <div className="grid place-items-center p-6"><Spinner /></div> : null}
        {messages?.map((m, i) => {
          const day = new Date(m.created_at).toDateString();
          const newDay = i === 0 || new Date(messages[i - 1].created_at).toDateString() !== day;
          return (
            <div key={m.id}>
              {newDay ? <p className="my-3 text-center text-[11px] text-zinc-400">{new Date(m.created_at).toLocaleDateString('pt-BR')}</p> : null}
              <Bubble m={m} onReact={react} onDelete={removeMessage} />
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <Composer
        to={{ conversation_id: conversation.id }}
        onSent={async () => {
          setData(await crmService.messages(conversation.id));
          onChanged();
        }}
      />

      {linking ? (
        <ContactForm
          initial={{ name: conversation.push_name ?? '', whatsapp: conversation.phone }}
          companyId={conversation.company_id ?? undefined}
          onClose={() => setLinking(false)}
          onSaved={onChanged}
        />
      ) : null}
    </>
  );
}

function NewConversation({ contactId, companyId, onBack, onSent }: { contactId: string | null; companyId: string | null; onBack: () => void; onSent: (conversationId: string) => void }) {
  const { data, error } = useAsync(async () => {
    if (contactId) {
      const c = await crmService.contact(contactId);
      return { name: c.name, sub: c.company_name, number: c.whatsapp };
    }
    const d = await crmService.company(companyId!);
    return { name: d.company.name, sub: 'WhatsApp da empresa', number: d.company.whatsapp || d.company.mobile };
  }, [contactId, companyId]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
        <button className="md:hidden" onClick={onBack} aria-label="Voltar"><ArrowLeft className="size-5" /></button>
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{data?.name ?? '…'}</div>
          <div className="truncate text-xs text-zinc-500">{data ? `${phone(data.number)} · ${data.sub}` : null}</div>
        </div>
      </header>
      <div className="grid flex-1 place-items-center p-6 text-center text-sm text-zinc-500">
        {error ?? (data && !data.number ? 'Sem WhatsApp cadastrado.' : 'Nenhuma mensagem ainda. Envie a primeira abaixo.')}
      </div>
      {data?.number ? (
        <Composer to={contactId ? { contact_id: contactId } : { company_id: companyId! }} onSent={onSent} />
      ) : null}
    </>
  );
}

const MAX_MEDIA_BYTES = 3 * 1024 * 1024;

type Attachment = OutgoingMedia & { preview: string | null; size: number };

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(blob);
  });

/** Foto grande vira JPEG de até 1600px (o WhatsApp recomprime de qualquer jeito); GIF fica como está. */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || (file.size < 900 * 1024 && /jpe?g|png/.test(file.type))) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.82));
}

function kindOf(file: File): OutgoingMedia['kind'] {
  if (file.type === 'image/gif') return 'gif';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

async function toAttachment(file: File | Blob, name: string, kind: OutgoingMedia['kind']): Promise<Attachment> {
  const blob = kind === 'image' && file instanceof File ? await shrinkImage(file) : file;
  if (blob.size > MAX_MEDIA_BYTES) throw new Error(`O arquivo tem ${(blob.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB — o limite é 3 MB.`);
  const mime = (blob.type || 'application/octet-stream').split(';')[0];
  return {
    kind,
    mime: kind === 'image' && blob !== file ? 'image/jpeg' : mime,
    file_name: kind === 'image' && blob !== file ? name.replace(/\.[^.]+$/, '') + '.jpg' : name,
    data: await toBase64(blob),
    preview: ['image', 'gif', 'video'].includes(kind) ? URL.createObjectURL(blob) : null,
    size: blob.size,
  };
}

function Composer({ to, onSent }: { to: SendTo; onSent: (conversationId: string) => void | Promise<void> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [recording, setRecording] = useState<{ started: number; seconds: number } | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream; cancel: boolean } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);

  // Fecha o seletor ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setEmojiOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEmojiOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiOpen]);

  // Cronômetro da gravação
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecording((r) => (r ? { ...r, seconds: Math.floor((Date.now() - r.started) / 1000) } : r)), 500);
    return () => clearInterval(t);
  }, [recording?.started]);

  // Libera a prévia e o microfone ao sair
  useEffect(() => () => {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
  }, [attachment]);
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  /** Emoji entra onde está o cursor (ou no lugar do trecho selecionado), e o cursor fica depois dele. */
  const insertEmoji = (emoji: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const sendMedia = async (media: OutgoingMedia) => {
    setSending(true);
    try {
      const r = await crmService.sendMedia(to, media);
      await onSent(r.conversation_id);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAttachment(await toAttachment(file, file.name, kindOf(file)));
      input.current?.focus();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (sending) return;
    if (attachment) {
      const { preview: _p, size: _s, ...media } = attachment;
      // Áudio vai como mensagem de voz (sem legenda): o texto, se houver, segue em outra mensagem
      const ok = await sendMedia({ ...media, caption: media.kind === 'audio' ? undefined : text.trim() || undefined });
      if (!ok) return;
      setAttachment(null);
      if (media.kind !== 'audio' || !text.trim()) {
        setText('');
        setEmojiOpen(false);
        return;
      }
    }
    if (!text.trim()) return;
    setSending(true);
    try {
      const r = await crmService.send(to, text);
      setText('');
      setEmojiOpen(false);
      await onSent(r.conversation_id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return toast.error('Este navegador não grava áudio.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const state = { rec, chunks: [] as Blob[], stream, cancel: false };
      rec.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(null);
        if (state.cancel || !state.chunks.length) return;
        const blob = new Blob(state.chunks, { type: rec.mimeType || type || 'audio/webm' });
        try {
          const a = await toAttachment(blob, 'audio', 'audio');
          await sendMedia(a);
        } catch (err) {
          toast.error(errorMessage(err));
        }
      };
      recorder.current = state;
      rec.start();
      setRecording({ started: Date.now(), seconds: 0 });
    } catch {
      toast.error('Não foi possível usar o microfone. Libere o acesso no navegador.');
    }
  };
  const stopRecording = (cancel: boolean) => {
    if (!recorder.current) return;
    recorder.current.cancel = cancel;
    recorder.current.rec.stop();
  };

  const iconBtn = 'grid size-10 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-ink disabled:opacity-40';
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <form ref={box} onSubmit={submit} className="relative border-t border-zinc-100 bg-white p-3">
      {emojiOpen ? (
        <div className="absolute bottom-full right-3 z-20 mb-2 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl shadow-2xl">
          <Suspense fallback={<div className="grid h-[380px] w-[340px] place-items-center bg-white"><Spinner /></div>}>
            <EmojiPanel onPick={insertEmoji} />
          </Suspense>
        </div>
      ) : null}

      {attachment ? (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          {attachment.preview && attachment.kind === 'video' ? (
            <video src={attachment.preview} className="size-14 rounded object-cover" muted />
          ) : attachment.preview ? (
            <img src={attachment.preview} alt="" className="size-14 rounded object-cover" />
          ) : (
            <span className="grid size-14 place-items-center rounded bg-white text-zinc-400">{attachment.kind === 'audio' ? <Mic className="size-5" /> : <FileText className="size-5" />}</span>
          )}
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-medium text-ink">{attachment.file_name}</div>
            <div className="text-xs text-zinc-500">
              {MEDIA_LABEL[attachment.kind]} · {Math.max(1, Math.round(attachment.size / 1024))} KB
              {attachment.kind === 'audio' ? ' · vai como mensagem de voz' : ' · o texto abaixo vira a legenda'}
            </div>
          </div>
          <button type="button" onClick={() => setAttachment(null)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-ink" aria-label="Tirar anexo" title="Tirar anexo">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {recording ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => stopRecording(true)} className={iconBtn} aria-label="Descartar áudio" title="Descartar">
            <Trash2 className="size-5" />
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" /> Gravando… {clock(recording.seconds)}
          </div>
          <Button type="button" onClick={() => stopRecording(false)} aria-label="Enviar áudio" icon={<Send className="size-4" />} />
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => fileInput.current?.click()} className={iconBtn} title="Anexar foto, GIF, vídeo, áudio ou documento" aria-label="Anexar" disabled={sending}>
            <Paperclip className="size-5" />
          </button>
          <Textarea
            ref={input}
            rows={1}
            className="max-h-40 min-h-10 resize-none py-2"
            placeholder={attachment ? 'Legenda (opcional)' : 'Digite uma mensagem (Enter envia, Shift+Enter quebra linha)'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              // Colar uma imagem (print) vira anexo
              const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
              if (file) {
                e.preventDefault();
                void pickFile(file);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setEmojiOpen((o) => !o)}
              className={cn(iconBtn, emojiOpen && 'bg-zinc-100 text-ink')}
              title="Emojis"
              aria-label="Emojis"
              aria-expanded={emojiOpen}
            >
              <Smile className="size-5" />
            </button>
            {text.trim() || attachment ? (
              <Button type="submit" loading={sending} aria-label="Enviar" icon={<Send className="size-4" />} />
            ) : (
              <Button type="button" variant="secondary" loading={sending} onClick={() => void startRecording()} aria-label="Gravar áudio" title="Gravar áudio" icon={<Mic className="size-4" />} />
            )}
          </div>
        </div>
      )}
    </form>
  );
}

const MEDIA_LABEL: Record<string, string> = { image: 'Foto', gif: 'GIF', video: 'Vídeo', audio: 'Áudio', document: 'Documento', sticker: 'Figurinha' };

/** Mídia da mensagem: carrega do servidor (que baixa da Evolution na primeira vez). */
function MediaView({ m }: { m: CrmMessage }) {
  const [failed, setFailed] = useState(false);
  const url = crmService.mediaUrl(m.id);
  if (failed) {
    return <div className="text-xs italic text-zinc-500">[{MEDIA_LABEL[m.type] ?? m.type} indisponível — veja no celular]</div>;
  }
  if (m.type === 'image' || m.type === 'sticker') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={MEDIA_LABEL[m.type]} loading="lazy" onError={() => setFailed(true)} className={cn('rounded-lg', m.type === 'sticker' ? 'size-32 object-contain' : 'max-h-72 w-auto max-w-full object-cover')} />
      </a>
    );
  }
  if (m.type === 'gif') {
    // GIF do WhatsApp é um vídeo curto; GIF enviado pelo CRM é imagem animada
    return m.media_mime?.startsWith('image/') ? (
      <img src={url} alt="GIF" loading="lazy" onError={() => setFailed(true)} className="max-h-72 max-w-full rounded-lg" />
    ) : (
      <video src={url} autoPlay loop muted playsInline onError={() => setFailed(true)} className="max-h-72 max-w-full rounded-lg" />
    );
  }
  if (m.type === 'video') return <video src={url} controls preload="metadata" onError={() => setFailed(true)} className="max-h-72 max-w-full rounded-lg" />;
  if (m.type === 'audio') return <audio src={url} controls preload="none" onError={() => setFailed(true)} className="w-64 max-w-full" />;
  return (
    <a href={url} className="flex items-center gap-2 rounded-lg bg-white/60 px-2 py-1.5 text-sm text-brand-700 hover:underline">
      <FileText className="size-4 flex-none" />
      <span className="truncate">{m.file_name || 'Documento'}</span>
    </a>
  );
}

const TYPE_LABEL: Record<string, string> = {
  image: 'imagem', video: 'vídeo', audio: 'áudio', document: 'documento', sticker: 'figurinha', location: 'localização', contact: 'contato', other: 'mídia',
};

const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

/** Texto da mensagem com os endereços (http, https e www.) clicáveis, abrindo em nova aba. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        // Pontuação colada no fim ("veja site.com.") fica fora do link
        const m = /^(.*?)([.,;:!?)\]]*)$/.exec(part)!;
        const href = m[1].startsWith('www.') ? `https://${m[1]}` : m[1];
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-brand-600 underline hover:text-brand-700">
              {m[1]}
            </a>
            {m[2]}
          </span>
        );
      })}
    </>
  );
}

const MEDIA_TYPES = new Set(['image', 'gif', 'video', 'audio', 'sticker', 'document']);

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function Bubble({ m, onReact, onDelete }: { m: CrmMessage; onReact: (m: CrmMessage, emoji: string) => void; onDelete: (m: CrmMessage, everyone: boolean) => void }) {
  const out = m.direction === 'out';
  const [picker, setPicker] = useState<'quick' | 'full' | 'menu' | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const reactions = [m.their_reaction, m.my_reaction].filter(Boolean) as string[];

  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setPicker(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicker(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker]);

  // Mesmo emoji de novo tira a reação (como no WhatsApp)
  const pick = (emoji: string) => {
    setPicker(null);
    onReact(m, m.my_reaction === emoji ? '' : emoji);
  };

  return (
    <div className={cn('group flex items-center gap-1', out ? 'flex-row-reverse' : 'flex-row', reactions.length > 0 && 'mb-3')}>
      <div className={cn('relative max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-xs', out ? 'bg-brand-50 text-ink' : 'bg-white text-ink')}>
        {m.revoked ? (
          <div className="flex items-center gap-1.5 italic text-zinc-500">
            <Ban className="size-3.5" /> {out ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
          </div>
        ) : (
          <>
            {MEDIA_TYPES.has(m.type) ? <div className="mb-1"><MediaView m={m} /></div> : m.type !== 'text' ? <div className="text-xs italic text-zinc-500">[{TYPE_LABEL[m.type] ?? m.type}]</div> : null}
            {m.body ? <div className="whitespace-pre-wrap break-words"><Linkified text={m.body} /></div> : null}
          </>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-400">
          {out && m.sent_by_name ? <span>{m.sent_by_name} ·</span> : null}
          {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {out ? <StatusIcon status={m.status} /> : null}
        </div>
        {reactions.length ? (
          <button
            type="button"
            onClick={() => m.my_reaction && pick(m.my_reaction)}
            title={m.my_reaction ? 'Clique para tirar a sua reação' : 'Reação do cliente'}
            className={cn('absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white px-1.5 py-px text-sm leading-5 shadow-xs', out ? 'right-2' : 'left-2')}
          >
            {reactions.map((r, i) => <span key={i}>{r}</span>)}
          </button>
        ) : null}
      </div>

      <div ref={box} className={cn('relative flex items-center', out ? 'flex-row-reverse' : 'flex-row')}>
          <button
            type="button"
            onClick={() => setPicker(picker === 'menu' ? null : 'menu')}
            className={cn('grid size-7 place-items-center rounded-full text-zinc-400 hover:bg-white hover:text-ink', picker === 'menu' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60')}
            title="Mais opções"
            aria-label="Mais opções da mensagem"
          >
            <ChevronDown className="size-4" />
          </button>
          {picker === 'menu' ? (
            <div className={cn('absolute bottom-full z-20 mb-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg', out ? 'right-0' : 'left-0')}>
              <button type="button" onClick={() => { setPicker(null); onDelete(m, false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50">
                <Trash2 className="size-4" /> Apagar para mim
              </button>
              {m.can_revoke ? (
                <button type="button" onClick={() => { setPicker(null); onDelete(m, true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <Ban className="size-4" /> Apagar para todos
                </button>
              ) : null}
            </div>
          ) : null}
        {m.can_react ? (
          <>
          <button
            type="button"
            onClick={() => setPicker(picker === 'quick' || picker === 'full' ? null : 'quick')}
            className={cn('grid size-7 place-items-center rounded-full text-zinc-400 hover:bg-white hover:text-ink', picker === 'quick' || picker === 'full' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60')}
            title="Reagir"
            aria-label="Reagir"
          >
            <Smile className="size-4" />
          </button>
          {picker === 'quick' ? (
            <div className={cn('absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-1 shadow-lg', out ? 'right-0' : 'left-0')}>
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => pick(e)}
                  className={cn('grid size-8 place-items-center rounded-full text-lg transition hover:scale-125 hover:bg-zinc-100', m.my_reaction === e && 'bg-zinc-200')}
                  aria-label={`Reagir com ${e}`}
                >
                  {e}
                </button>
              ))}
              <button type="button" onClick={() => setPicker('full')} className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100" aria-label="Mais emojis" title="Mais emojis">
                +
              </button>
            </div>
          ) : picker === 'full' ? (
            <div className={cn('absolute bottom-full z-20 mb-1 overflow-hidden rounded-xl shadow-2xl', out ? 'right-0' : 'left-0')}>
              <Suspense fallback={<div className="grid h-[380px] w-[340px] place-items-center bg-white"><Spinner /></div>}>
                <EmojiPanel onPick={pick} />
              </Suspense>
            </div>
          ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck className="size-3 text-sky-500" />;
  if (status === 'delivered') return <CheckCheck className="size-3" />;
  if (status === 'error') return <AlertTriangle className="size-3 text-red-500" />;
  if (status === 'pending') return <Clock className="size-3" />;
  return <Check className="size-3" />;
}
