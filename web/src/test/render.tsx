import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { resetMockState } from '../api/mock/mock-api';
import { AuthProvider } from '../auth/AuthContext';

export const INVESTOR_ID = 'usr_fict_01';
export const INVESTOR_2_ID = 'usr_fict_02';
export const ADMIN_ID = 'usr_fict_admin';

/** Monta la app completa sobre los mocks FICTICIOS, opcionalmente con una sesión ya iniciada. */
export function renderApp(path: string, opts: { loginAs?: string } = {}) {
  resetMockState({ loginAs: opts.loginAs });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}
