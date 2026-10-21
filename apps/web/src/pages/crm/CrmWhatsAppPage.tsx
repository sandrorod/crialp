import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Building2, Check, CheckCheck, Clock, MessageCircle, MessageSquarePlus, Search, Send, Smile, User, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { ContactForm } from '@/components/crm/CrmForms';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { crmService, dateTime, phone, waKey } from '@/services/crm';
import type { CrmConversation, CrmMessage } from '@/types/crm';
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
  const { data: conversations, reload, setData } = useAsync(() => crmService.conversations(onlyUnlinked), [onlyUnlinked]);
  // Busca as mensagens novas na Evolution e recarrega a lista (e o contador do menu) quando chegou algo
  usePolling(
    () =>
      void crmService
        .sync()
        .catch(() => ({ added: 0 }))
        .then((r) => {
          if (r.added) refreshUnread();
          return crmService.conversations(onlyUnlinked);
        })
        .then(setData)
        .catch(() => {}),
    LIST_POLL,
    [onlyUnlinked],
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

  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return (conversations ?? []).filter(
      (c) => !t || title(c).toLowerCase().includes(t) || (c.company_name ?? '').toLowerCase().includes(t) || (digits.length >= 3 && c.phone.includes(digits)),
    );
  }, [conversations, search]);

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const starting = !selectedId && (contactParam || companyParam);
  const open = !!selectedId || !!starting;

  return (
    <Card className="flex h-[calc(100dvh-260px)] min-h-[480px] overflow-hidden">
      <aside className={cn('w-full flex-col border-r border-zinc-100 md:flex md:w-80', open ? 'hidden' : 'flex')}>
        <div className="space-y-2 border-b border-zinc-100 p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input placeholder="Buscar conversa…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="secondary" onClick={() => setPicking(true)} title="Nova conversa" aria-label="Nova conversa" icon={<MessageSquarePlus className="size-4" />} />
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
          {conversations && !list.length ? <li className="p-6 text-center text-sm text-zinc-500">Nenhuma conversa.</li> : null}
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
                  <span className="flex-1 truncate text-xs text-zinc-500">{c.last_message}</span>
                  {c.unread ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span> : null}
                </div>
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

function Chat({ conversation, manager, onBack, onChanged }: { conversation: CrmConversation; manager: boolean; onBack: () => void; onChanged: () => void }) {
  const { data: messages, setData } = useAsync(() => crmService.messages(conversation.id), [conversation.id]);
  usePolling(() => void crmService.messages(conversation.id).then(setData).catch(() => {}), CHAT_POLL, [conversation.id]);
  const [linking, setLinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

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
        </div>
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
              <Bubble m={m} />
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <Composer
        onSend={async (text) => {
          await crmService.send({ conversation_id: conversation.id }, text);
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
        <Composer
          onSend={async (text) => {
            const r = await crmService.send(contactId ? { contact_id: contactId } : { company_id: companyId! }, text);
            onSent(r.conversation_id);
          }}
        />
      ) : null}
    </>
  );
}

function Composer({ onSend }: { onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
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

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setText('');
      setEmojiOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };
  return (
    <form ref={box} onSubmit={submit} className="relative flex items-end gap-2 border-t border-zinc-100 bg-white p-3">
      {emojiOpen ? (
        <div className="absolute bottom-full right-3 z-20 mb-2 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl shadow-2xl">
          <Suspense fallback={<div className="grid h-[380px] w-[340px] place-items-center bg-white"><Spinner /></div>}>
            <EmojiPanel onPick={insertEmoji} />
          </Suspense>
        </div>
      ) : null}
      <Textarea
        ref={input}
        rows={1}
        className="max-h-40 min-h-10 resize-none py-2"
        placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
        value={text}
        onChange={(e) => setText(e.target.value)}
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
          className={cn('grid size-10 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-ink', emojiOpen && 'bg-zinc-100 text-ink')}
          title="Emojis"
          aria-label="Emojis"
          aria-expanded={emojiOpen}
        >
          <Smile className="size-5" />
        </button>
        <Button type="submit" loading={sending} disabled={!text.trim()} aria-label="Enviar" icon={<Send className="size-4" />} />
      </div>
    </form>
  );
}

const TYPE_LABEL: Record<string, string> = {
  image: 'imagem', video: 'vídeo', audio: 'áudio', document: 'documento', sticker: 'figurinha', location: 'localização', contact: 'contato', other: 'mídia',
};

function Bubble({ m }: { m: CrmMessage }) {
  const out = m.direction === 'out';
  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-xs', out ? 'bg-brand-50 text-ink' : 'bg-white text-ink')}>
        {m.type !== 'text' ? <div className="text-xs italic text-zinc-500">[{TYPE_LABEL[m.type] ?? m.type}]</div> : null}
        {m.body ? <div className="whitespace-pre-wrap break-words">{m.body}</div> : null}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-400">
          {out && m.sent_by_name ? <span>{m.sent_by_name} ·</span> : null}
          {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {out ? <StatusIcon status={m.status} /> : null}
        </div>
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
