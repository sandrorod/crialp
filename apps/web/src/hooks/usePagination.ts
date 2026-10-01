import { useEffect, useState } from 'react';

/** Paginação na tela: volta para a primeira página quando os filtros (`resetKey`) mudam. */
export function usePagination<T>(items: T[] | undefined, pageSize = 10, resetKey = '') {
  const [page, setPage] = useState(1);
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => setPage(1), [resetKey]);
  // Itens excluídos na última página: não fica numa página vazia
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const current = Math.min(page, pages);
  return {
    page: current,
    pages,
    total,
    pageSize,
    setPage,
    items: (items ?? []).slice((current - 1) * pageSize, current * pageSize),
  };
}
