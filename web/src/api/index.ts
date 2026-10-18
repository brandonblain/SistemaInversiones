import { httpApi } from './http';
import { mockApi } from './mock/mock-api';
import type { PortalApi } from './portal-api';

/** true cuando la app corre con datos FICTICIOS (VITE_USE_MOCKS=true). Vite elimina el mock del build real. */
export const USING_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export const api: PortalApi = USING_MOCKS ? mockApi : httpApi;

export { ApiError } from './client';
export type { PortalApi } from './portal-api';
