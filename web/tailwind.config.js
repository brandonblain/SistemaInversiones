/** @type {import('tailwindcss').Config} */
// Los colores se leen de variables CSS OKLCH definidas en src/index.css (tokens de marca, ver .impeccable.md).
const token = (name) => `oklch(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: token('brand'), strong: token('brand-strong'), soft: token('brand-soft'), ink: token('brand-ink') },
        nav: { DEFAULT: token('nav'), hover: token('nav-hover'), active: token('nav-active'), ink: token('nav-ink') },
        accent: { DEFAULT: token('accent'), soft: token('accent-soft'), ink: token('accent-ink') },
        dist: { paid: token('dist-paid'), reinvested: token('dist-reinvested'), pending: token('dist-pending') },
        page: token('page'),
        surface: token('surface'),
        sunken: token('sunken'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), muted: token('ink-muted') },
        line: token('line'),
        ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        bad: { DEFAULT: token('bad'), soft: token('bad-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        // Franjas azul marino del sitio público: texto "on-band" siempre claro, en ambos modos
        band: { DEFAULT: token('band'), raised: token('band-raised'), line: token('band-line') },
        'on-band': { DEFAULT: token('on-band'), 2: token('on-band-2'), accent: token('on-band-accent') }
      },
      fontFamily: {
        sans: ['"Figtree Variable"', 'Figtree', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif']
      },
      borderRadius: { card: '0.875rem' },
      transitionTimingFunction: { out: 'var(--ease-out)', 'in-out-strong': 'var(--ease-in-out)' }
    }
  },
  plugins: []
};
