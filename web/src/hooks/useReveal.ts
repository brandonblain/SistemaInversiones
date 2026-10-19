import { useEffect, type RefObject } from 'react';

/**
 * Revela una sola vez los elementos [data-reveal] dentro del contenedor cuando entran a la vista.
 * Sin IntersectionObserver (navegadores viejos, pruebas) se muestran de inmediato.
 */
export function useReveal(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (typeof IntersectionObserver === 'undefined') {
      items.forEach((el) => (el.dataset.visible = 'true'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.visible = 'true';
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -80px 0px', threshold: 0.05 }
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref]);
}
