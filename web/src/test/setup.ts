import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetMockState } from '../api/mock/mock-api';

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

beforeEach(() => resetMockState());
afterEach(() => cleanup());
