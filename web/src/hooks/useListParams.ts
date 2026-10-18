import { useSearchParams } from 'react-router-dom';

/** Filtros y página en la URL (se pueden compartir y sobreviven al botón "atrás"). */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const page = Math.max(1, Number(params.get('pagina') ?? 1) || 1);

  const set = (next: Partial<Record<K | 'pagina', string>>, resetPage = true) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next) as Array<[string, string]>) (v ? p.set(k, v) : p.delete(k));
    if (resetPage && !('pagina' in next)) p.delete('pagina');
    setParams(p, { replace: true });
  };

  return { values, page, set, setPage: (n: number) => set({ pagina: String(n) } as Partial<Record<K | 'pagina', string>>, false) };
}
