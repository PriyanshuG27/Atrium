import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Dashboard from '../pages/Dashboard';
import { AuthProvider, useAuth } from '../context/AuthContext';

function SeedAuth({ user, children }) {
  const { login } = useAuth();
  React.useEffect(() => {
    if (user) login(user);
  }, [user]);
  return children;
}

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 42, chat_id: '99999' }),
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  it('renders dashboard with user chat ID and animation node texts', async () => {
    render(
      <AuthProvider>
        <SeedAuth user={{ id: 42, chat_id: '99999' }}>
          <Dashboard />
        </SeedAuth>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome to Recall')).toBeInTheDocument();
      expect(screen.getByText('99999')).toBeInTheDocument();
      expect(screen.getByText(/Your knowledge constellation is ready/)).toBeInTheDocument();
    });
  });
});
