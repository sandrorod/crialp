import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Building2, ExternalLink, Globe, Mail, MapPin, Phone, User, X } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatPrice } from '@/lib/utils';
import { crmService, dateTime, phone } from '@/services/crm';
import type { CrmConversation } from '@/types/crm';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-100 px-4 py-3 first:border-0">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      <div className="space-y-1 text-sm text-zinc-700">{children}</div>
    </section>
  );
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-none text-zinc-400">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

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
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <Building2 className="size-4 text-zinc-400" />
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
            <Section title="Empresa">
              <Link to={`/crm/empresas/${c.id}`} className="block font-semibold text-ink hover:underline">
                {c.name}
              </Link>
              {c.legal_name && c.legal_name !== c.name ? <div className="text-xs text-zinc-500">{c.legal_name}</div> : null}
              {c.segment ? <div className="text-xs text-zinc-500">{c.segment}</div> : null}
              {c.seller_names ? <Line icon={<User className="size-3.5" />}>Vendedor: {c.seller_names}</Line> : null}
            </Section>
            <Section title="Contato">
              {c.whatsapp ? <Line icon={<Phone className="size-3.5" />}>WhatsApp {phone(c.whatsapp)}</Line> : null}
              {c.mobile && c.mobile !== c.whatsapp ? <Line icon={<Phone className="size-3.5" />}>Celular {phone(c.mobile)}</Line> : null}
              {c.phone ? <Line icon={<Phone className="size-3.5" />}>Telefone {phone(c.phone)}</Line> : null}
              {c.email ? (
                <Line icon={<Mail className="size-3.5" />}>
                  <a href={`mailto:${c.email}`} className="hover:underline">
                    {c.email}
                  </a>
                </Line>
              ) : null}
              {c.website ? (
                <Line icon={<Globe className="size-3.5" />}>
                  <a href={c.website} target="_blank" rel="noreferrer" className="hover:underline">
                    {c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                </Line>
              ) : null}
              {c.instagram ? <Line icon={<Globe className="size-3.5" />}>Instagram {c.instagram}</Line> : null}
              {!c.whatsapp && !c.mobile && !c.phone && !c.email && !c.website && !c.instagram ? (
                <span className="text-zinc-400">Sem contato cadastrado.</span>
              ) : null}
            </Section>
            {address ? (
              <Section title="Endereço">
                <Line icon={<MapPin className="size-3.5" />}>{address}</Line>
              </Section>
            ) : null}
            {c.lp_slug ? (
              <Section title="Landing Page">
                <a href={`/lp/${c.lp_slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink hover:underline">
                  /lp/{c.lp_slug} <ExternalLink className="size-3.5" />
                </a>
              </Section>
            ) : null}
            <Section title={`Negócios (${data.deals.length})`}>
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
            <Section title={`Tarefas abertas (${openTasks.length})`}>
              {openTasks.length ? (
                openTasks.map((t) => (
                  <div key={t.id}>
                    <div className="truncate">{t.title}</div>
                    <div className="text-xs text-zinc-500">{[t.due_at ? `Até ${dateTime(t.due_at)}` : null, t.assignee_name].filter(Boolean).join(' · ')}</div>
                  </div>
                ))
              ) : (
                <span className="text-zinc-400">Nenhuma tarefa aberta.</span>
              )}
            </Section>
            <Section title={`Contatos (${data.contacts.length})`}>
              {data.contacts.length ? (
                data.contacts.map((ct) => (
                  <div key={ct.id}>
                    <div className="truncate">
                      {ct.name}
                      {ct.job_title ? <span className="text-zinc-500"> · {ct.job_title}</span> : null}
                    </div>
                    {ct.whatsapp || ct.phone ? <div className="text-xs text-zinc-500">{phone(ct.whatsapp ?? ct.phone ?? '')}</div> : null}
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
