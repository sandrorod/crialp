import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Briefcase, Building2, CalendarClock, ExternalLink, Globe, Landmark, Mail, MapPin, Phone, Smartphone, User, X } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatPrice } from '@/lib/utils';
import { crmService, dateTime, phone } from '@/services/crm';
import type { CrmConversation } from '@/types/crm';
import { cn } from '@/lib/utils';
import { Avatar, TONES, ToneIcon } from './CrmTheme';
import { WhatsAppIcon } from './WhatsAppIcon';

// Bolinha colorida no título de cada seção, na cor da aba correspondente
const DOTS = { blue: 'bg-blue-400', emerald: 'bg-emerald-400', violet: 'bg-violet-400', amber: 'bg-amber-400', sky: 'bg-sky-400', zinc: 'bg-zinc-300' };

function Section({ title, dot = 'zinc', children }: { title: string; dot?: keyof typeof DOTS; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-100 px-4 py-3 first:border-0">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className={cn('size-1.5 rounded-full', DOTS[dot])} />
        {title}
      </h3>
      <div className="space-y-1 text-sm text-zinc-700">{children}</div>
    </section>
  );
}

/** Informação com ícone no lugar do rótulo; o rótulo fica no "title" (passar o mouse) e para leitores de tela. */
function Line({ icon, label, className, children }: { icon: ReactNode; label: string; className?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2" title={label}>
      <span aria-hidden className={cn('mt-0.5 flex-none text-zinc-400', className)}>
        {icon}
      </span>
      <span className="min-w-0 break-words">
        <span className="sr-only">{label}: </span>
        {children}
      </span>
    </div>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

/** "https://instagram.com/padaria/" → "@padaria" */
const instagramHandle = (v: string) => {
  const m = /instagram\.com\/([^/?#]+)/i.exec(v);
  return `@${(m ? m[1] : v).replace(/^@/, '')}`;
};
const instagramUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`);

/**
 * Coluna com os dados da empresa da conversa (WhatsApp do CRM): contato, endereço, vendedor, Landing Page,
 * negócios, tarefas abertas e contatos. `onClose`: no modo sobreposto (telas menores), o botão de fechar.
 */
export function CompanyInfoPanel({ conversation, onClose }: { conversation: CrmConversation | null; onClose?: () => void }) {
  const companyId = conversation?.company_id ?? null;
  const { data, error, loading } = useAsync(() => (companyId ? crmService.company(companyId) : Promise.resolve(null)), [companyId]);
  const c = data?.company;
  const openTasks = data?.tasks.filter((t) => !t.done) ?? [];
  const address = c
    ? [[c.address, c.number].filter(Boolean).join(', '), c.neighborhood, [c.city, c.state].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className={cn('flex items-center gap-2 border-b px-4 py-3', TONES.blue.bar)}>
        <ToneIcon tone="blue" className="size-7">
          <Building2 className="size-4" />
        </ToneIcon>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">Empresa</span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-ink"
            aria-label="Fechar dados da empresa"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!conversation ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">Selecione uma conversa para ver os dados da empresa.</p>
        ) : !companyId ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            Esta conversa ainda não está ligada a uma empresa. Use “Vincular a uma empresa” no topo da conversa.
          </p>
        ) : loading && !data ? (
          <div className="grid place-items-center py-8">
            <Spinner />
          </div>
        ) : error || !c ? (
          <p className="px-4 py-6 text-center text-sm text-red-600">{error ?? 'Empresa não encontrada.'}</p>
        ) : (
          <>
            <Section title="Empresa" dot="blue">
              <Link to={`/crm/empresas/${c.id}`} className="flex items-center gap-2 font-semibold text-ink hover:text-blue-700 hover:underline">
                <Avatar name={c.name} size="sm" />
                <span className="min-w-0">{c.name}</span>
              </Link>
              {c.legal_name && c.legal_name !== c.name ? (
                <Line icon={<Landmark className="size-3.5" />} label="Razão social">
                  {c.legal_name}
                </Line>
              ) : null}
              {c.segment ? (
                <Line icon={<Briefcase className="size-3.5" />} label="Segmento">
                  {c.segment}
                </Line>
              ) : null}
              {c.seller_names ? (
                <Line icon={<User className="size-3.5" />} label="Vendedor">
                  {c.seller_names}
                </Line>
              ) : null}
            </Section>
            <Section title="Contato" dot="emerald">
              {c.whatsapp ? (
                <Line icon={<WhatsAppIcon className="size-3.5" />} label="WhatsApp" className="text-[#128c7e]">
                  {phone(c.whatsapp)}
                </Line>
              ) : null}
              {c.mobile && c.mobile !== c.whatsapp ? (
                <Line icon={<Smartphone className="size-3.5" />} label="Celular">
                  {phone(c.mobile)}
                </Line>
              ) : null}
              {c.phone ? (
                <Line icon={<Phone className="size-3.5" />} label="Telefone">
                  {phone(c.phone)}
                </Line>
              ) : null}
              {c.email ? (
                <Line icon={<Mail className="size-3.5" />} label="E-mail">
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                </Line>
              ) : null}
              {c.website ? (
                <Line icon={<Globe className="size-3.5" />} label="Site">
                  <a href={c.website} target="_blank" rel="noreferrer" className="hover:underline">
                    {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                </Line>
              ) : null}
              {c.instagram ? (
                <Line icon={<InstagramIcon className="size-3.5" />} label="Instagram" className="text-pink-500">
                  <a href={instagramUrl(c.instagram)} target="_blank" rel="noreferrer" className="hover:underline">
                    {instagramHandle(c.instagram)}
                  </a>
                </Line>
              ) : null}
              {!c.whatsapp && !c.mobile && !c.phone && !c.email && !c.website && !c.instagram ? (
                <span className="text-zinc-400">Sem contato cadastrado.</span>
              ) : null}
            </Section>
            {address ? (
              <Section title="Endereço">
                <Line icon={<MapPin className="size-3.5" />} label="Endereço">
                  {address}
                </Line>
              </Section>
            ) : null}
            {c.lp_slug ? (
              <Section title="Landing Page" dot="sky">
                <a href={`/lp/${c.lp_slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink hover:underline">
                  /lp/{c.lp_slug} <ExternalLink className="size-3.5" />
                </a>
              </Section>
            ) : null}
            <Section title={`Negócios (${data.deals.length})`} dot="violet">
              {data.deals.length ? (
                data.deals.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <span className="size-2 flex-none rounded-full" style={{ background: d.stage_color ?? '#a1a1aa' }} />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className="text-xs text-zinc-500">{Number(d.value) ? formatPrice(Number(d.value)) : (d.stage_name ?? '')}</span>
                  </div>
                ))
              ) : (
                <span className="text-zinc-400">Nenhum negócio.</span>
              )}
            </Section>
            <Section title={`Tarefas abertas (${openTasks.length})`} dot="amber">
              {openTasks.length ? (
                openTasks.map((t) => (
                  <div key={t.id}>
                    <div className="truncate">{t.title}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
                      {t.due_at ? (
                        <span className="flex items-center gap-1" title="Prazo">
                          <CalendarClock aria-hidden className="size-3" />
                          <span className="sr-only">Prazo: </span>
                          {dateTime(t.due_at)}
                        </span>
                      ) : null}
                      {t.assignee_name ? (
                        <span className="flex items-center gap-1" title="Responsável">
                          <User aria-hidden className="size-3" />
                          <span className="sr-only">Responsável: </span>
                          {t.assignee_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-zinc-400">Nenhuma tarefa aberta.</span>
              )}
            </Section>
            <Section title={`Contatos (${data.contacts.length})`} dot="sky">
              {data.contacts.length ? (
                data.contacts.map((ct) => (
                  <div key={ct.id}>
                    <div className="truncate">
                      {ct.name}
                      {ct.job_title ? <span className="text-zinc-500"> · {ct.job_title}</span> : null}
                    </div>
                    {ct.whatsapp || ct.phone ? (
                      <div className="flex items-center gap-1 text-xs text-zinc-500" title={ct.whatsapp ? 'WhatsApp' : 'Telefone'}>
                        {ct.whatsapp ? <WhatsAppIcon className="size-3 text-[#128c7e]" /> : <Phone aria-hidden className="size-3" />}
                        <span className="sr-only">{ct.whatsapp ? 'WhatsApp' : 'Telefone'}: </span>
                        {phone(ct.whatsapp ?? ct.phone ?? '')}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <span className="text-zinc-400">Nenhum contato.</span>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
