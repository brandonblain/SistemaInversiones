/** @type {import('tailwindcss').Config} */
// Los colores se leen de variables CSS definidas en src/index.css (tokens de marca reemplazables).
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: token('brand'), strong: token('brand-strong'), soft: token('brand-soft'), ink: token('brand-ink') },
        nav: { DEFAULT: token('nav'), hover: token('nav-hover'), active: token('nav-active'), ink: token('nav-ink') },
        page: token('page'),
        surface: token('surface'),
        sunken: token('sunken'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), muted: token('ink-muted') },
        line: token('line'),
        ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        bad: { DEFAULT: token('bad'), soft: token('bad-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif']
      },
      borderRadius: { card: '0.75rem' }
    }
  },
  plugins: []
};
