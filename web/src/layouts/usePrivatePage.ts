import { useEffect } from 'react';

/** Marca las páginas privadas (login, portal, administración) para que los buscadores no las indexen. */
export function usePrivatePage(title = 'Pimex Fortex Capital · Portal de inversionistas') {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
    return () => {
      meta?.remove();
    };
  }, [title]);
}
