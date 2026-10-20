import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { resetMockState } from '../api/mock/mock-api';
import { resetMarketCache } from '../components/MarketIndicators';

// jsdom no implementa ResizeObserver ni matchMedia (usados por Recharts y el tema).
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver ??= RO;
window.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false
})) as any;

// findBy*/waitFor esperan 1 s por omisión; con la máquina ocupada (suite completa en paralelo) no alcanza.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  resetMockState();
  resetMarketCache();
});
afterEach(() => cleanup());
