import { useEffect, useState } from 'react';

const VARS = ['--series-1', '--series-2', '--series-3', '--chart-grid', '--chart-axis'] as const;

export interface ChartTheme {
  paid: string;
  pending: string;
  reinvested: string;
  capital: string;
  grid: string;
  axis: string;
  surface: string;
}

function read(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  const surface = s.getPropertyValue('--surface').trim();
  return {
    // Orden categórico fijo: azul (1) → naranja (2) → aqua (3); validado en ambos modos.
    capital: v(VARS[0], '#2a78d6'),
    paid: v(VARS[0], '#2a78d6'),
    pending: v(VARS[1], '#eb6834'),
    reinvested: v(VARS[2], '#1baf7a'),
    grid: v(VARS[3], '#e1e0d9'),
    axis: v(VARS[4], '#898781'),
    surface: surface ? `rgb(${surface})` : '#ffffff'
  };
}

/** Lee los tokens de color del tema actual (claro/oscuro) y se actualiza al cambiar el modo del sistema. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(read);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(read());
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);
  return theme;
}
