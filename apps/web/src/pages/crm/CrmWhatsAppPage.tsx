import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bookmark,
  ChevronDown,
  CircleAlert,
  Building2,
  Check,
  CheckCheck,
  Clock,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  FileText,
  Mic,
  Paperclip,
  Pencil,
  Phone,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  Smile,
  Tag,
  Trash2,
  User,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { CompanyInfoPanel } from '@/components/crm/CompanyInfoPanel';
import { Avatar, TONES } from '@/components/crm/CrmTheme';
import { ContactForm } from '@/components/crm/CrmForms';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { applyQuickReply, matchQuickReplies, shortcutAt } from '@/lib/quickReplies';
import { cn } from '@/lib/utils';
import { crmService, dateTime, phone, waKey, type CrmGif, type CrmSavedGif, type OutgoingMedia, type SendTo } from '@/services/crm';
import { GifPanel } from '@/components/crm/GifPanel';
import type { CrmConversation, CrmLabel, CrmMessage, CrmQuickReply } from '@/types/crm';
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
  // Telas menores que 1600px: painel da empresa aberto por cima da conversa
  const [companyOpen, setCompanyOpen] = useState(false);
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
  // Botão direito (ou tocar e segurar no celular) numa conversa da lista: menu com "Fixar no topo" e "Marcar como não lida"
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; opened: boolean }>({ timer: null, opened: false });
  const openMenu = (id: string, x: number, y: number) => setMenu({ id, x: Math.min(x, window.innerWidth - 220), y: Math.min(y, window.innerHeight - 100) });
  const markUnread = async (id: string) => {
    setMenu(null);
    // Aberta: fecha antes, senão a conversa aberta marcaria como lida de novo
    if (id === selectedId) setParams({});
    try {
      await crmService.markUnread(id);
      setData((list) => list?.map((c) => (c.id === id ? { ...c, unread: Math.max(c.unread, 1) } : c)) ?? list);
      refreshUnread();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  /** Fixa/desafixa no topo; a lista é reordenada na hora (a próxima atualização confirma com o servidor). */
  const togglePin = async (id: string) => {
    setMenu(null);
    const pinned = !conversations?.find((c) => c.id === id)?.pinned;
    try {
      await (pinned ? crmService.pin(id) : crmService.unpin(id));
      setData((cur) => {
        if (!cur) return cur;
        const list = cur.map((c) => (c.id === id ? { ...c, pinned } : c));
        const moved = list.find((c) => c.id === id)!;
        const rest = list.filter((c) => c.id !== id);
        // Fixada: vai para o topo; desafixada: logo depois das fixadas (a ordem certa vem na próxima atualização)
        const at = pinned ? 0 : rest.filter((c) => c.pinned).length;
        return [...rest.slice(0, at), moved, ...rest.slice(at)];
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // pointerdown (e não click): soltar o dedo depois de segurar não fecha o menu que acabou de abrir
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const contactParam = params.get('contato');
  const companyParam = params.get('empresa');
  const numberParam = params.get('numero');

  // Vindo de um contato/empresa: abre a conversa do número cadastrado ATUAL (se já existir) ou prepara uma nova
  useEffect(() => {
    if (!conversations || selectedId || (!contactParam && !companyParam && !numberParam)) return;
    let alive = true;
    const number = contactParam
      ? crmService.contact(contactParam).then((c) => c.whatsapp)
      : companyParam
        ? crmService.company(companyParam).then((d) => d.company.whatsapp || d.company.mobile)
        : Promise.resolve(numberParam);
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
  }, [conversations, contactParam, companyParam, numberParam, selectedId, setParams]);
  // Lista de contatos/empresas, ou direto o campo do número fora do cadastro
  const [picking, setPicking] = useState<false | 'list' | 'number'>(false);
  const { data: permissions } = useAsync(() => crmService.permissions(), []);
  const freeNumber = !!permissions?.free_number;

  const list = conversations ?? [];
  // A conversa aberta continua na tela mesmo se a busca/etiqueta tirar ela da lista
  const lastSelected = useRef<CrmConversation | null>(null);
  const found = conversations?.find((c) => c.id === selectedId) ?? null;
  if (found) lastSelected.current = found;
  const selected = found ?? (lastSelected.current?.id === selectedId ? lastSelected.current : null);
  const starting = !selectedId && (contactParam || companyParam || numberParam);
  const open = !!selectedId || !!starting;

  // Altura da tela menos o cabeçalho (56px), a margem de cima (2px) e 5% embaixo; no celular, menos também as abas em cima
  return (
    <Card className="flex h-[calc(95dvh-120px)] min-h-[480px] overflow-hidden md:h-[calc(95dvh-58px)]">
      <aside className={cn('w-full flex-col border-r border-zinc-100 md:flex md:w-80', open ? 'hidden' : 'flex')}>
        <div className={cn('space-y-2 border-b p-3', TONES.emerald.bar)}>
          {/* Uma linha: pesquisa, filtro de etiqueta (só as cores), nova conversa e editar etiquetas */}
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Pesquisar…"
                title="Nome, número, empresa ou texto das mensagens"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-[13px]"
              />
            </div>
            <LabelFilter labels={labels ?? []} value={labelFilter} onChange={setLabelFilter} />
            <button type="button" onClick={() => setPicking('list')} className={TOOL_BTN} title="Nova conversa" aria-label="Nova conversa">
              <MessageSquarePlus className="size-4" />
            </button>
            {freeNumber ? (
              <button
                type="button"
                onClick={() => setPicking('number')}
                className={TOOL_BTN}
                title="Conversar com número fora do cadastro"
                aria-label="Conversar com número fora do cadastro"
              >
                <Phone className="size-4" />
              </button>
            ) : null}
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
          {!conversations ? (
            <li className="grid place-items-center p-6">
              <Spinner />
            </li>
          ) : null}
          {conversations && !list.length ? (
            <li className="p-6 text-center text-sm text-zinc-500">
              {debounced || labelFilter ? 'Nada encontrado com essa busca ou etiqueta.' : 'Nenhuma conversa.'}
            </li>
          ) : null}
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  // Tocar e segurar abriu o menu: o toque não abre a conversa
                  if (press.current.opened) {
                    press.current.opened = false;
                    return;
                  }
                  setParams({ id: c.id });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(c.id, e.clientX, e.clientY);
                }}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  press.current.opened = false;
                  press.current.timer = setTimeout(() => {
                    press.current.opened = true;
                    openMenu(c.id, t.clientX, t.clientY);
                  }, 500);
                }}
                onTouchMove={() => press.current.timer && clearTimeout(press.current.timer)}
                onTouchEnd={() => press.current.timer && clearTimeout(press.current.timer)}
                className={cn(
                  'flex w-full select-none items-start gap-3 border-b border-l-4 border-b-zinc-50 px-4 py-3 pl-3 text-left transition-colors',
                  // Aberta: azul claro; mensagem não lida: cartão destacado na cor do WhatsApp
                  c.id === selectedId
                    ? 'border-l-sky-500 bg-sky-50'
                    : c.unread
                      ? 'border-l-emerald-500 bg-emerald-50 hover:bg-emerald-100/70'
                      : 'border-l-transparent hover:bg-zinc-50',
                )}
              >
                <Avatar name={title(c)} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn('flex min-w-0 items-center gap-1.5 text-sm text-ink', c.unread ? 'font-semibold' : 'font-medium')}>
                      <span className="truncate">{title(c)}</span>
                      {!c.company_id ? (
                        <span title="Sem empresa no sistema" aria-label="Sem empresa no sistema" className="flex-none text-amber-500">
                          <CircleAlert className="size-3.5" />
                        </span>
                      ) : null}
                    </span>
                    <span className={cn('flex shrink-0 items-center gap-1 text-[11px]', c.unread ? 'font-medium text-emerald-700' : 'text-zinc-400')}>
                      {c.pinned ? (
                        <span title="Fixada no topo" aria-label="Fixada no topo" className="text-zinc-400">
                          <Pin className="size-3 rotate-45" />
                        </span>
                      ) : null}
                      {dateTime(c.last_message_at)}
                    </span>
                  </div>
                  {c.company_name ? <span className="truncate text-xs text-zinc-500">{c.company_name}</span> : null}
                  <div className="flex items-center gap-2">
                    <span className={cn('flex-1 truncate text-xs', c.unread ? 'font-medium text-zinc-700' : 'text-zinc-500')}>
                      {c.matched ? <Highlight text={c.matched.body} term={debounced} /> : c.last_message}
                    </span>
                    {c.unread ? <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span> : null}
                  </div>
                  {c.labels?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.labels.map((l) => (
                        <LabelChip key={l.id} label={l} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
        {menu ? (
          <div
            role="menu"
            className="fixed z-50 min-w-48 rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void togglePin(menu.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-zinc-50"
            >
              {list.find((c) => c.id === menu.id)?.pinned ? (
                <>
                  <PinOff className="size-4 text-zinc-500" /> Desafixar
                </>
              ) : (
                <>
                  <Pin className="size-4 text-zinc-500" /> Fixar no topo
                </>
              )}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void markUnread(menu.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-zinc-50"
            >
              <Mail className="size-4 text-zinc-500" /> Marcar como não lida
            </button>
          </div>
        ) : null}
      </aside>

      <section className={cn('crm-chat-bg relative min-w-0 flex-1 flex-col', open ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <Chat
            key={selected.id}
            onShowCompany={() => setCompanyOpen(true)}
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
            number={numberParam}
            onBack={() => setParams({})}
            onSent={(id) => {
              void reload();
              setParams({ id }, { replace: true });
            }}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-zinc-500">
            <div className="rounded-2xl bg-white/85 px-8 py-6 text-center shadow-xs ring-1 ring-emerald-100">
              <span className={cn('mx-auto mb-3 grid size-12 place-items-center rounded-2xl', TONES.emerald.tile)}>
                <MessageCircle className="size-6" />
              </span>
              <div className="font-medium text-ink">Selecione uma conversa</div>
              <div className="mt-0.5 text-xs">ou comece uma nova pelo botão ao lado da pesquisa</div>
            </div>
          </div>
        )}
        {/* Telas menores que 1600px: dados da empresa por cima da conversa (sem apertar nada) */}
        {companyOpen && selected ? (
          <div className="absolute inset-y-0 right-0 z-30 w-80 max-w-full border-l border-zinc-200 shadow-2xl min-[1600px]:hidden">
            <CompanyInfoPanel conversation={selected} onClose={() => setCompanyOpen(false)} />
          </div>
        ) : null}
      </section>
      {/* Coluna da empresa, da mesma largura da lista de conversas (a página fica 320px mais larga) */}
      <aside className="hidden w-80 flex-none border-l border-zinc-100 min-[1600px]:flex min-[1600px]:flex-col" aria-label="Dados da empresa">
        <CompanyInfoPanel conversation={selected ?? null} />
      </aside>
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
          allowNumber={freeNumber}
          startTyping={picking === 'number'}
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
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ background: labels[i % labels.length].color }} />
            ))}
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
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium"
      style={{ background: `${label.color}1f`, color: label.color }}
    >
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
function LabelPicker({
  conversation,
  labels,
  onManage,
  onChanged,
}: {
  conversation: CrmConversation;
  labels: CrmLabel[];
  onManage: () => void;
  onChanged: () => void;
}) {
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
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="mt-1 w-full rounded-md px-1 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50 hover:text-ink"
          >
            ⚙ Gerenciar etiquetas (cores, nomes, excluir)
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Criar, renomear, trocar a cor e excluir etiquetas (valem para a equipe toda). */
function LabelsManager({
  labels,
  onClose,
  onChanged,
  onRemoved,
}: {
  labels: CrmLabel[];
  onClose: () => void;
  onChanged: () => void;
  onRemoved: (id: string) => void;
}) {
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
      tight
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
              <button
                type="button"
                onClick={() => setEditing({ id: l.id, name: l.name, color: l.color })}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-ink"
                aria-label={`Editar ${l.name}`}
                title="Editar"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void remove(l)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Excluir ${l.name}`}
                title="Excluir"
              >
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
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: { id: string | null; name: string; color: string };
  onChange: (v: { id: string | null; name: string; color: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
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
          <button
            key={c}
            type="button"
            onClick={() => onChange({ ...value, color: c })}
            className={cn('size-6 rounded-full ring-offset-2', value.color === c && 'ring-2 ring-ink')}
            style={{ background: c }}
            aria-label={`Cor ${c}`}
          />
        ))}
        <input
          type="color"
          value={value.color}
          onChange={(e) => onChange({ ...value, color: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-zinc-200 p-0"
          aria-label="Outra cor"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSave} loading={busy} disabled={!value.name.trim()}>
          Salvar
        </Button>
      </div>
    </li>
  );
}

/** Escolhe uma empresa ou contato com WhatsApp cadastrado para começar (ou abrir) a conversa. */
function NewChatPicker({
  allowNumber,
  startTyping,
  onClose,
  onPick,
}: {
  allowNumber: boolean;
  startTyping: boolean;
  onClose: () => void;
  onPick: (p: { empresa: string } | { contato: string } | { numero: string }) => void;
}) {
  const [search, setSearch] = useState('');
  // Número fora do cadastro (quem a gerência liberou na aba Conexão)
  const [typing, setTyping] = useState(startTyping);
  const [number, setNumber] = useState('');
  const digits = number.replace(/\D/g, '');
  const validNumber = digits.length >= 10 && digits.length <= 15;
  const startNumber = (e: FormEvent) => {
    e.preventDefault();
    if (validNumber) onPick({ numero: digits });
  };
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data, loading } = useAsync(() => crmService.whatsappTargets(debounced || undefined), [debounced]);
  const [tab, setTab] = useState<'contatos' | 'empresas'>('contatos');
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
  const tabs = [
    { key: 'contatos' as const, label: 'Contatos', count: data?.contacts.length ?? 0 },
    { key: 'empresas' as const, label: 'Empresas', count: data?.companies.length ?? 0 },
  ];
  const items =
    tab === 'contatos'
      ? (data?.contacts ?? []).map((c) => (
          <Item
            key={c.id}
            icon={<User className="size-4" />}
            title={c.name}
            sub={`${phone(c.whatsapp)} · ${c.company_name}`}
            onClick={() => onPick({ contato: c.id })}
          />
        ))
      : (data?.companies ?? []).map((c) => (
          <Item
            key={c.id}
            icon={<Building2 className="size-4" />}
            title={c.name}
            sub={[phone(c.whatsapp), c.city].filter(Boolean).join(' · ')}
            onClick={() => onPick({ empresa: c.id })}
          />
        ));
  return (
    <Modal open title="Nova conversa" tight="more" onClose={onClose}>
      <Input autoFocus={!startTyping} placeholder="Buscar por nome ou número…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {allowNumber ? (
        typing ? (
          <form onSubmit={startNumber} className="mt-3 flex items-center gap-2">
            <Input
              autoFocus
              type="tel"
              inputMode="tel"
              placeholder="(11) 91234-5678"
              aria-label="Número de WhatsApp"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={!validNumber}>
              Começar conversa
            </Button>
            <button type="button" onClick={() => setTyping(false)} className={TOOL_BTN} title="Cancelar" aria-label="Cancelar">
              <X className="size-4" />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTyping(true);
              // Já aproveita o que foi digitado na busca, se for um número
              if (/^[\d\s()+-]+$/.test(search.trim())) setNumber(search.trim());
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-left text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:text-ink"
          >
            <Phone className="size-4 text-zinc-400" />
            Conversar com número fora do cadastro
          </button>
        )
      ) : null}
      {/* Abas: mostra só a lista escolhida */}
      <div className="mt-3 flex gap-1 border-b border-zinc-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.key ? 'border-ink text-ink' : 'border-transparent text-zinc-500 hover:text-ink',
            )}
          >
            {t.label}
            {data ? <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] text-zinc-600">{t.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="mt-2 h-[min(50vh,360px)] overflow-y-auto">
        {loading && !data ? (
          <div className="grid place-items-center p-6">
            <Spinner />
          </div>
        ) : null}
        {data && !items.length ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            {tab === 'contatos' ? 'Nenhum contato com WhatsApp cadastrado.' : 'Nenhuma empresa com WhatsApp cadastrado.'}
          </p>
        ) : (
          <ul>{items}</ul>
        )}
      </div>
    </Modal>
  );
}

function Chat({
  conversation,
  labels,
  onManageLabels,
  manager,
  onBack,
  onChanged,
  onShowCompany,
}: {
  onShowCompany: () => void;
  conversation: CrmConversation;
  labels: CrmLabel[];
  onManageLabels: () => void;
  manager: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data: messages, setData } = useAsync(() => crmService.messages(conversation.id), [conversation.id]);
  usePolling(
    () =>
      void crmService
        .messages(conversation.id)
        .then(setData)
        .catch(() => {}),
    CHAT_POLL,
    [conversation.id],
  );
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

  /** Edita o texto no WhatsApp do cliente; devolve se deu certo (o balão sai do modo de edição). */
  const editMessage = async (m: CrmMessage, text: string) => {
    try {
      await crmService.editMessage(m.id, text);
      setData(await crmService.messages(conversation.id));
      onChanged();
      toast.success('Mensagem editada.');
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
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
    if (conversation.unread)
      void crmService
        .markRead(conversation.id)
        .then(onChanged)
        .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.unread]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
        <button type="button" className="md:hidden" onClick={onBack} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={title(conversation)} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink">{title(conversation)}</div>
          <div className="truncate text-xs text-zinc-500">
            {phone(conversation.phone)}
            {conversation.company_id ? (
              <>
                {' '}
                ·{' '}
                <Link to={`/crm/empresas/${conversation.company_id}`} className="hover:underline">
                  {conversation.company_name}
                </Link>
              </>
            ) : null}
          </div>
          {conversation.labels?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {conversation.labels.map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
            </div>
          ) : null}
        </div>
        <LabelPicker conversation={conversation} labels={labels} onManage={onManageLabels} onChanged={onChanged} />
        <Button variant="secondary" size="sm" className="min-[1600px]:hidden" icon={<Building2 className="size-4" />} onClick={onShowCompany}>
          Empresa
        </Button>
        {manager && !conversation.contact_id ? (
          <Button variant="secondary" size="sm" icon={<UserPlus className="size-4" />} onClick={() => setLinking(true)}>
            {conversation.company_id ? 'Salvar como contato' : 'Vincular a uma empresa'}
          </Button>
        ) : null}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {!messages ? (
          <div className="grid place-items-center p-6">
            <Spinner />
          </div>
        ) : null}
        {messages?.map((m, i) => {
          const day = new Date(m.created_at).toDateString();
          const newDay = i === 0 || new Date(messages[i - 1].created_at).toDateString() !== day;
          return (
            <div key={m.id}>
              {newDay ? (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-zinc-500 shadow-xs ring-1 ring-zinc-200/60">
                    {new Date(m.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </p>
              ) : null}
              <Bubble m={m} onReact={react} onDelete={removeMessage} onEdit={editMessage} />
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

function NewConversation({
  contactId,
  companyId,
  number,
  onBack,
  onSent,
}: {
  contactId: string | null;
  companyId: string | null;
  number: string | null;
  onBack: () => void;
  onSent: (conversationId: string) => void;
}) {
  const { data, error } = useAsync(async () => {
    if (number) return { name: phone(number), sub: 'Fora do cadastro', number };
    if (contactId) {
      const c = await crmService.contact(contactId);
      return { name: c.name, sub: c.company_name, number: c.whatsapp };
    }
    const d = await crmService.company(companyId!);
    return { name: d.company.name, sub: 'WhatsApp da empresa', number: d.company.whatsapp || d.company.mobile };
  }, [contactId, companyId, number]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
        <button type="button" className="md:hidden" onClick={onBack} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={data?.name} />
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{data?.name ?? '…'}</div>
          <div className="truncate text-xs text-zinc-500">{data ? `${phone(data.number)} · ${data.sub}` : null}</div>
        </div>
      </header>
      <div className="grid flex-1 place-items-center p-6 text-center text-sm text-zinc-500">
        {error ?? (data && !data.number ? 'Sem WhatsApp cadastrado.' : 'Nenhuma mensagem ainda. Envie a primeira abaixo.')}
      </div>
      {data?.number ? <Composer to={number ? { phone: number } : contactId ? { contact_id: contactId } : { company_id: companyId! }} onSent={onSent} /> : null}
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
  // Galeria de GIFs (clicar envia na hora)
  const [gifOpen, setGifOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [recording, setRecording] = useState<{ started: number; seconds: number } | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream; cancel: boolean } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);
  // Mensagens prontas: "/atalho" digitado puxa o texto salvo
  const { data: quickReplies, reload: reloadQuickReplies } = useAsync(() => crmService.quickReplies(), []);
  const [slash, setSlash] = useState<{ start: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [managing, setManaging] = useState<{ shortcut?: string } | null>(null);
  const usable = (quickReplies ?? []).filter((r) => r.can_use);
  const suggestions = slash ? matchQuickReplies(usable, slash.query) : [];

  // Fecha o seletor de emojis/GIFs ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!emojiOpen && !gifOpen) return;
    const close = () => {
      setEmojiOpen(false);
      setGifOpen(false);
    };
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiOpen, gifOpen]);

  // Cronômetro da gravação
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecording((r) => (r ? { ...r, seconds: Math.floor((Date.now() - r.started) / 1000) } : r)), 500);
    return () => clearInterval(t);
  }, [recording?.started]);

  // Libera a prévia e o microfone ao sair
  useEffect(
    () => () => {
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    },
    [attachment],
  );
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const updateSlash = (value: string, cursor: number) => {
    const found = shortcutAt(value, cursor);
    setSlash((cur) => (cur?.start === found?.start && cur?.query === found?.query ? cur : found));
    if (found?.query !== slash?.query) setSlashIndex(0);
  };

  /** Troca o "/atalho" pelo texto da mensagem pronta; o cursor fica no fim, para revisar antes de enviar. */
  const pickQuickReply = (r: CrmQuickReply) => {
    if (!slash) return;
    const el = input.current;
    const n = applyQuickReply(text, slash.start, el?.selectionStart ?? text.length, r.body);
    setText(n.text);
    setSlash(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(n.cursor, n.cursor);
    });
  };

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

  const sendGif = async (gif: CrmGif) => {
    setSending(true);
    try {
      const r = await crmService.sendGif(to, gif.id);
      setGifOpen(false);
      await onSent(r.conversation_id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const sendSavedGif = async (gif: CrmSavedGif) => {
    setSending(true);
    try {
      const r = await crmService.sendSavedGif(to, gif.id);
      setGifOpen(false);
      await onSent(r.conversation_id);
    } catch (err) {
      toast.error(errorMessage(err));
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
    <>
      {/* Fora do <form>: o envio do formulário do modal não pode chegar ao envio da mensagem */}
      {managing ? (
        <QuickRepliesManager
          initialShortcut={managing.shortcut}
          onClose={() => {
            setManaging(null);
            input.current?.focus();
          }}
          onChanged={() => void reloadQuickReplies()}
        />
      ) : null}
      <form ref={box} onSubmit={submit} className="relative border-t border-zinc-100 bg-white p-3">
        {slash && !recording ? (
          <div
            className="absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
            role="listbox"
            aria-label="Mensagens prontas"
          >
            {suggestions.length ? (
              <ul className="max-h-72 overflow-y-auto py-1">
                {suggestions.map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === slashIndex}
                      // Não tira o foco do campo antes do clique
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickQuickReply(r)}
                      onMouseEnter={() => setSlashIndex(i)}
                      className={cn('flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left', i === slashIndex ? 'bg-zinc-100' : 'hover:bg-zinc-50')}
                    >
                      <span className="text-sm font-semibold text-ink">/{r.shortcut}</span>
                      <span className="line-clamp-2 whitespace-pre-line text-xs text-zinc-500">{r.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-2.5 text-sm text-zinc-500">
                {usable.length ? `Nenhuma mensagem pronta com "/${slash.query}".` : 'Nenhuma mensagem pronta ainda.'}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-3 py-1.5 text-[11px] text-zinc-500">
              <span>{suggestions.length ? '↑↓ escolhe · Enter ou Tab usa · Esc fecha' : 'Esc fecha'}</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setManaging({ shortcut: suggestions.length ? undefined : slash.query || undefined })}
                className="font-medium text-ink hover:underline"
              >
                {suggestions.length || !slash.query ? 'Gerenciar mensagens prontas' : `Criar /${slash.query}`}
              </button>
            </div>
          </div>
        ) : null}
        {gifOpen ? (
          <div className="absolute bottom-full right-3 z-20 mb-2 overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/5">
            <GifPanel onPick={(g) => void sendGif(g)} onPickSaved={(g) => void sendSavedGif(g)} sending={sending} />
          </div>
        ) : null}
        {emojiOpen ? (
          <div className="absolute bottom-full right-3 z-20 mb-2 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl shadow-2xl">
            <Suspense
              fallback={
                <div className="grid h-[380px] w-[340px] place-items-center bg-white">
                  <Spinner />
                </div>
              }
            >
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
              <span className="grid size-14 place-items-center rounded bg-white text-zinc-400">
                {attachment.kind === 'audio' ? <Mic className="size-5" /> : <FileText className="size-5" />}
              </span>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium text-ink">{attachment.file_name}</div>
              <div className="text-xs text-zinc-500">
                {MEDIA_LABEL[attachment.kind]} · {Math.max(1, Math.round(attachment.size / 1024))} KB
                {attachment.kind === 'audio' ? ' · vai como mensagem de voz' : ' · o texto abaixo vira a legenda'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-ink"
              aria-label="Tirar anexo"
              title="Tirar anexo"
            >
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
            {/* Mensagens prontas em cima, anexar embaixo (como emojis e enviar, do outro lado) */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setManaging({})}
                className={iconBtn}
                title="Mensagens prontas (digite / no campo para usar)"
                aria-label="Mensagens prontas"
                disabled={sending}
              >
                <Zap className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className={iconBtn}
                title="Anexar foto, GIF, vídeo, áudio ou documento"
                aria-label="Anexar"
                disabled={sending}
              >
                <Paperclip className="size-5" />
              </button>
            </div>
            <Textarea
              ref={input}
              rows={1}
              className="max-h-40 min-h-10 resize-none py-2"
              placeholder={attachment ? 'Legenda (opcional)' : 'Digite uma mensagem (Enter envia, Shift+Enter quebra linha)'}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                updateSlash(e.target.value, e.target.selectionStart);
              }}
              // Cursor movido (clique, setas): a lista de mensagens prontas acompanha
              onSelect={(e) => updateSlash(e.currentTarget.value, e.currentTarget.selectionStart)}
              onBlur={() => setSlash(null)}
              onPaste={(e) => {
                // Colar uma imagem (print) vira anexo
                const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
                if (file) {
                  e.preventDefault();
                  void pickFile(file);
                }
              }}
              onKeyDown={(e) => {
                if (slash && e.key === 'Escape') {
                  e.preventDefault();
                  setSlash(null);
                  return;
                }
                if (slash && suggestions.length) {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const step = e.key === 'ArrowDown' ? 1 : -1;
                    setSlashIndex((i) => (i + step + suggestions.length) % suggestions.length);
                    return;
                  }
                  if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                    e.preventDefault();
                    pickQuickReply(suggestions[Math.min(slashIndex, suggestions.length - 1)]);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setGifOpen(false);
                    setEmojiOpen((o) => !o);
                  }}
                  className={cn(iconBtn, emojiOpen && 'bg-zinc-100 text-ink')}
                  title="Emojis"
                  aria-label="Emojis"
                  aria-expanded={emojiOpen}
                >
                  <Smile className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen(false);
                    setGifOpen((o) => !o);
                  }}
                  className={cn(iconBtn, 'text-[11px] font-bold tracking-tight', gifOpen && 'bg-zinc-100 text-ink')}
                  title="GIFs"
                  aria-label="GIFs"
                  aria-expanded={gifOpen}
                >
                  GIF
                </button>
              </div>
              {text.trim() || attachment ? (
                <Button type="submit" loading={sending} aria-label="Enviar" icon={<Send className="size-4" />} />
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  loading={sending}
                  onClick={() => void startRecording()}
                  aria-label="Gravar áudio"
                  title="Gravar áudio"
                  icon={<Mic className="size-4" />}
                />
              )}
            </div>
          </div>
        )}
      </form>
    </>
  );
}

type QuickReplyDraft = { id: string | null; shortcut: string; body: string; visibility: 'all' | 'users'; user_ids: string[]; created_by: string | null };
const ROLE_LABEL: Record<string, string> = { owner: 'dono', admin: 'admin', seller: 'vendedor' };

/**
 * Mensagens prontas: nome (o atalho chamado com "/" no campo de mensagem) e texto. Valem para toda a equipe.
 * `initialShortcut`: abre já criando uma com esse nome (vindo de "/nome" sem mensagem).
 */
function QuickRepliesManager({ initialShortcut, onClose, onChanged }: { initialShortcut?: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useAsync(() => crmService.quickReplies(), []);
  const list = data ?? [];
  const { user } = useAuth();
  // Subusuários para "Só quem eu escolher" (vendedor só enxerga a si mesmo)
  const { data: team } = useAsync(() => crmService.users(), []);
  const others = (team ?? []).filter((u) => u.id !== user?.id);
  const blank = (shortcut = ''): QuickReplyDraft => ({ id: null, shortcut, body: '', visibility: 'all', user_ids: [], created_by: user?.id ?? null });
  const [editing, setEditing] = useState<QuickReplyDraft | null>(initialShortcut !== undefined ? blank(initialShortcut) : null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase().replace(/^\//, '');
  const shown = q ? list.filter((r) => r.shortcut.includes(q) || r.body.toLowerCase().includes(q)) : list;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!editing) return;
    const shortcut = editing.shortcut.trim().replace(/^\/+/, '');
    if (!shortcut || !editing.body.trim()) return toast.error('Preencha o nome e o texto da mensagem.');
    setBusy(true);
    try {
      const input = { shortcut, body: editing.body, visibility: editing.visibility, user_ids: editing.visibility === 'users' ? editing.user_ids : [] };
      if (editing.id) await crmService.updateQuickReply(editing.id, input);
      else await crmService.createQuickReply(input);
      toast.success(`Mensagem /${shortcut.toLowerCase()} salva.`);
      setEditing(null);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (r: CrmQuickReply) => {
    if (!window.confirm(`Excluir a mensagem pronta "/${r.shortcut}"?`)) return;
    try {
      await crmService.removeQuickReply(r.id);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      title="Mensagens prontas"
      tight="more"
      onClose={onClose}
      busy={busy}
      actions={
        <button
          type="button"
          onClick={() => setEditing(blank())}
          disabled={!!editing}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-ink disabled:opacity-40"
          aria-label="Nova mensagem pronta"
          title="Nova mensagem pronta"
        >
          <Plus className="size-5" />
        </button>
      }
    >
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Nome (atalho)</span>
            <div className="flex items-center rounded-lg border border-zinc-200 focus-within:border-zinc-400">
              <span className="pl-3 text-sm font-semibold text-zinc-400">/</span>
              <input
                // biome-ignore lint/a11y/noAutofocus: formulário recém-aberto no modal; o foco vai para o primeiro campo vazio, como no resto do painel
                autoFocus={!editing.shortcut}
                value={editing.shortcut}
                maxLength={31}
                onChange={(e) => setEditing({ ...editing, shortcut: e.target.value.replace(/\s+/g, '-') })}
                placeholder="valor"
                className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
                aria-label="Nome (atalho)"
              />
            </div>
            <span className="mt-1 block text-[11px] text-zinc-400">
              No WhatsApp, digite /{editing.shortcut.trim().replace(/^\/+/, '').toLowerCase() || 'nome'} para puxar o texto. Sem espaços.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Texto</span>
            <Textarea
              autoFocus={!!editing.shortcut}
              rows={7}
              maxLength={4000}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="Texto completo que vai para o campo de mensagem"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-zinc-600">Quem pode usar</legend>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { value: 'all', label: 'Todos da equipe' },
                  { value: 'users', label: 'Só quem eu escolher' },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={editing.visibility === o.value}
                  onClick={() => setEditing({ ...editing, visibility: o.value })}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs',
                    editing.visibility === o.value ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {editing.visibility === 'users' ? (
              <div className="rounded-lg border border-zinc-200 p-2">
                <p className="mb-1 text-[11px] text-zinc-500">
                  {editing.created_by === user?.id ? 'Você criou, então sempre pode usar. ' : ''}Marque os subusuários que também podem usar:
                </p>
                {others.length ? (
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                    {others.map((u) => {
                      const checked = editing.user_ids.includes(u.id);
                      return (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-zinc-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setEditing({ ...editing, user_ids: checked ? editing.user_ids.filter((x) => x !== u.id) : [...editing.user_ids, u.id] })
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{u.name}</span>
                            <span className="text-[11px] text-zinc-400">{ROLE_LABEL[u.role] ?? u.role}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-1 text-xs text-zinc-500">Sem outros subusuários para escolher: a mensagem fica só para você.</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-400">Todos os subusuários da equipe podem usar com /.</p>
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Salvar
            </Button>
          </div>
        </form>
      ) : loading && !data ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <p className="py-4 text-center text-sm text-red-600">{error}</p>
      ) : (
        <div className="space-y-2">
          {list.length > 5 ? (
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou texto" aria-label="Buscar mensagem pronta" />
          ) : null}
          <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
            {shown.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-ink">/{r.shortcut}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-px text-[10px] font-medium',
                        r.visibility === 'all' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
                      )}
                      title={
                        r.visibility === 'users' ? `Podem usar: ${[r.created_by_name, ...r.users.map((u) => u.name)].filter(Boolean).join(', ')}` : undefined
                      }
                    >
                      {r.visibility === 'all' ? 'Todos' : `Privada · ${1 + r.users.length} ${r.users.length ? 'pessoas' : 'pessoa'}`}
                    </span>
                  </div>
                  <div className="line-clamp-2 whitespace-pre-line text-xs text-zinc-500">{r.body}</div>
                </div>
                {r.can_edit ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: r.id,
                          shortcut: r.shortcut,
                          body: r.body,
                          visibility: r.visibility,
                          user_ids: r.users.map((u) => u.id),
                          created_by: r.created_by,
                        })
                      }
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-ink"
                      aria-label={`Editar /${r.shortcut}`}
                      title="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(r)}
                      className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Excluir /${r.shortcut}`}
                      title="Excluir"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
            {!list.length ? (
              <li className="py-4 text-center text-sm text-zinc-500">
                Nenhuma mensagem pronta ainda. Clique no + para criar e depois digite /nome no campo de mensagem.
              </li>
            ) : !shown.length ? (
              <li className="py-4 text-center text-sm text-zinc-500">Nada encontrado.</li>
            ) : null}
          </ul>
        </div>
      )}
    </Modal>
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
        <img
          src={url}
          alt={MEDIA_LABEL[m.type]}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn('rounded-lg', m.type === 'sticker' ? 'size-32 object-contain' : 'max-h-72 w-auto max-w-full object-cover')}
        />
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
  image: 'imagem',
  video: 'vídeo',
  audio: 'áudio',
  document: 'documento',
  sticker: 'figurinha',
  location: 'localização',
  contact: 'contato',
  other: 'mídia',
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

function Bubble({
  m,
  onReact,
  onDelete,
  onEdit,
}: {
  m: CrmMessage;
  onReact: (m: CrmMessage, emoji: string) => void;
  onDelete: (m: CrmMessage, everyone: boolean) => void;
  onEdit: (m: CrmMessage, text: string) => Promise<boolean>;
}) {
  const out = m.direction === 'out';
  const [picker, setPicker] = useState<'quick' | 'full' | 'menu' | null>(null);
  // Editando o texto dentro do próprio balão (Enter salva, Shift+Enter quebra linha, Esc cancela)
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveEdit = async () => {
    if (draft === null || saving) return;
    const text = draft.trim();
    if (!text) return toast.error('A mensagem não pode ficar vazia.');
    if (text === m.body) return setDraft(null);
    setSaving(true);
    const ok = await onEdit(m, text);
    setSaving(false);
    if (ok) setDraft(null);
  };
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
      <div className={cn('relative max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-xs', out ? 'bg-[#dcf8d4] text-ink' : 'bg-white text-ink')}>
        {m.revoked ? (
          <div className="flex items-center gap-1.5 italic text-zinc-500">
            <Ban className="size-3.5" /> {out ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
          </div>
        ) : (
          <>
            {MEDIA_TYPES.has(m.type) ? (
              <div className="mb-1">
                <MediaView m={m} />
              </div>
            ) : m.type !== 'text' ? (
              <div className="text-xs italic text-zinc-500">[{TYPE_LABEL[m.type] ?? m.type}]</div>
            ) : null}
            {draft !== null ? (
              <div className="w-[min(420px,70vw)] space-y-2">
                <Textarea
                  autoFocus
                  rows={Math.min(8, Math.max(2, draft.split('\n').length))}
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setDraft(null);
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void saveEdit();
                    }
                  }}
                  aria-label="Editar mensagem"
                />
                <div className="flex items-center justify-end gap-2">
                  <span className="mr-auto text-[11px] text-zinc-400">Enter salva · Esc cancela</span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={() => void saveEdit()} loading={saving}>
                    Salvar
                  </Button>
                </div>
              </div>
            ) : m.body ? (
              <div className="whitespace-pre-wrap break-words">
                <Linkified text={m.body} />
              </div>
            ) : null}
          </>
        )}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-400">
          {out && m.sent_by_name ? <span>{m.sent_by_name} ·</span> : null}
          {m.edited_at && !m.revoked ? <span title={`Editada em ${new Date(m.edited_at).toLocaleString('pt-BR')}`}>editada ·</span> : null}
          {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {out ? <StatusIcon status={m.status} /> : null}
        </div>
        {reactions.length ? (
          <button
            type="button"
            onClick={() => m.my_reaction && pick(m.my_reaction)}
            title={m.my_reaction ? 'Clique para tirar a sua reação' : 'Reação do cliente'}
            className={cn(
              'absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white px-1.5 py-px text-sm leading-5 shadow-xs',
              out ? 'right-2' : 'left-2',
            )}
          >
            {reactions.map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </button>
        ) : null}
      </div>

      <div ref={box} className={cn('relative flex items-center', out ? 'flex-row-reverse' : 'flex-row')}>
        <button
          type="button"
          onClick={() => setPicker(picker === 'menu' ? null : 'menu')}
          className={cn(
            'grid size-7 place-items-center rounded-full text-zinc-400 hover:bg-white hover:text-ink',
            picker === 'menu' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60',
          )}
          title="Mais opções"
          aria-label="Mais opções da mensagem"
        >
          <ChevronDown className="size-4" />
        </button>
        {picker === 'menu' ? (
          <div
            className={cn(
              'absolute bottom-full z-20 mb-1 w-48 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg',
              out ? 'right-0' : 'left-0',
            )}
          >
            {/* GIF (vídeo em loop), figurinha ou imagem GIF: guarda na lista do próprio usuário para reenviar */}
            {!m.revoked && (m.type === 'gif' || m.type === 'sticker' || (m.type === 'image' && m.media_mime === 'image/gif')) ? (
              <button
                type="button"
                onClick={() => {
                  setPicker(null);
                  crmService
                    .saveGif(m.id)
                    .then(() => toast.success('GIF salvo. Ele aparece em GIF → Salvos.'))
                    .catch((err) => toast.error(errorMessage(err)));
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <Bookmark className="size-4" /> Salvar GIF
              </button>
            ) : null}
            {m.can_edit ? (
              <button
                type="button"
                onClick={() => {
                  setPicker(null);
                  setDraft(m.body ?? '');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <Pencil className="size-4" /> Editar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setPicker(null);
                onDelete(m, false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <Trash2 className="size-4" /> Apagar para mim
            </button>
            {m.can_revoke ? (
              <button
                type="button"
                onClick={() => {
                  setPicker(null);
                  onDelete(m, true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
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
              className={cn(
                'grid size-7 place-items-center rounded-full text-zinc-400 hover:bg-white hover:text-ink',
                picker === 'quick' || picker === 'full' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60',
              )}
              title="Reagir"
              aria-label="Reagir"
            >
              <Smile className="size-4" />
            </button>
            {picker === 'quick' ? (
              <div
                className={cn(
                  'absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-1 shadow-lg',
                  out ? 'right-0' : 'left-0',
                )}
              >
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => pick(e)}
                    className={cn(
                      'grid size-8 place-items-center rounded-full text-lg transition hover:scale-125 hover:bg-zinc-100',
                      m.my_reaction === e && 'bg-zinc-200',
                    )}
                    aria-label={`Reagir com ${e}`}
                  >
                    {e}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPicker('full')}
                  className="grid size-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"
                  aria-label="Mais emojis"
                  title="Mais emojis"
                >
                  +
                </button>
              </div>
            ) : picker === 'full' ? (
              <div className={cn('absolute bottom-full z-20 mb-1 overflow-hidden rounded-xl shadow-2xl', out ? 'right-0' : 'left-0')}>
                <Suspense
                  fallback={
                    <div className="grid h-[380px] w-[340px] place-items-center bg-white">
                      <Spinner />
                    </div>
                  }
                >
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
