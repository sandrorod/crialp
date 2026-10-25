import { Link } from 'react-router';
import { ExternalLink, PanelsTopLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Card, EmptyState, ErrorBlock, Input, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services';

/** Conta de cliente com mais de um site (mesmo e-mail em várias LPs): escolhe qual editar. */
export function MySitesPage() {
  const { user } = useAuth();
  const seller = user?.role === 'seller';
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useAsync(() => authService.mySites(), []);
  const term = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter((s) => !term || s.title.toLowerCase().includes(term));

  return (
    <div>
      <PageHeader
        title={seller ? 'Minhas Landing Pages' : 'Meus sites'}
        description={
          seller ? 'As Landing Pages atribuídas a você (de empresas em prospecção). Escolha qual quer editar.' : 'Escolha qual site você quer editar.'
        }
      />
      {seller && (data?.items.length ?? 0) > 6 ? (
        <Input className="mb-4 max-w-sm" placeholder="Buscar pelo nome da empresa…" value={search} onChange={(e) => setSearch(e.target.value)} />
      ) : null}
      {error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingBlock rows={3} />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={<PanelsTopLeft className="size-5" />}
            title={term ? 'Nada encontrado' : seller ? 'Nenhuma Landing Page atribuída' : 'Nenhum site'}
            description={
              term
                ? 'Ajuste a busca.'
                : seller
                  ? 'As Landing Pages atribuídas a você, de empresas em prospecção, aparecem aqui.'
                  : 'Esta conta não está ligada a nenhum site. Fale com o administrador.'
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 font-semibold leading-snug">{s.title}</h3>
                <StatusBadge status={s.status} />
              </div>
              <a
                href={s.public_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex min-w-0 items-center gap-1 break-all text-xs text-brand-600 hover:underline"
              >
                {s.public_url.replace(/^https?:\/\//, '')} <ExternalLink className="size-3 flex-none" />
              </a>
              <p className="mt-1 text-xs text-zinc-500">Atualizado {formatDate(s.updated_at, true)}</p>
              <Link
                to={`/landing-pages/${s.id}`}
                className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <Pencil className="size-4" /> {seller ? 'Editar' : 'Editar este site'}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
