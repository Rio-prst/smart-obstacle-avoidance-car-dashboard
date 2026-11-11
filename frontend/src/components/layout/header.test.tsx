import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './header';

const mocks = vi.hoisted(() => ({
  stop: vi.fn(),
  online: true,
  dataAgeSeconds: 2,
}));

vi.mock('@/hooks/use-dashboard-data', () => ({
  isMockDataEnabled: true,
  useDashboardSnapshot: () => ({
    data: {
      device: { online: mocks.online, state: 'STOP' },
      dataAgeSeconds: mocks.dataAgeSeconds,
    },
  }),
  useStopCommand: () => ({ mutate: mocks.stop, isPending: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.online = true;
  mocks.dataAgeSeconds = 2;
});

afterEach(cleanup);

describe('Header', () => {
  it('offers global STOP but no START and keeps the menu usable', () => {
    const openMenu = vi.fn();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header onOpenMenu={openMenu} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'START' })).not.toBeInTheDocument();
    const stop = screen.getByRole('button', { name: 'STOP' });
    expect(stop).toBeEnabled();
    fireEvent.click(stop);
    expect(mocks.stop).toHaveBeenCalledWith(undefined, expect.any(Object));
    fireEvent.click(screen.getByRole('button', { name: 'Buka menu' }));
    expect(openMenu).toHaveBeenCalledTimes(1);
  });

  it.each([
    { online: true, dataAgeSeconds: 2 },
    { online: false, dataAgeSeconds: 20 },
    { online: true, dataAgeSeconds: 10 },
  ])(
    'provides an accessible connection indicator, online=$online, age=$dataAgeSeconds',
    (connection) => {
      Object.assign(mocks, connection);
      render(
        <MemoryRouter>
          <Header onOpenMenu={vi.fn()} />
        </MemoryRouter>,
      );

      const indicator = screen.getByRole('status');
      expect(indicator).toHaveTextContent(/^Koneksi: /);
      expect(indicator).toHaveAttribute('title', indicator.textContent);
      expect(indicator).not.toHaveClass('hidden');
      expect(screen.getByRole('button', { name: 'STOP' })).toBeEnabled();
    },
  );
});
