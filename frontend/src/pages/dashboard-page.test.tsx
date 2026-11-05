import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './dashboard-page';

vi.mock('@/hooks/use-dashboard-data', () => {
  const snapshot = {
    device: {
      id: 'car01',
      name: 'Mobil 1',
      online: true,
      mode: 'AUTO',
      state: 'MAJU',
      lastSeen: '2026-11-04T08:00:00.000Z',
      fw: '0.1.0',
      avoidCount: 7,
    },
    config: {
      ver: 4,
      stopCm: 25,
      resumeCm: 30,
      maxPwm: 200,
      manualMaxPwm: 150,
      updatedAt: '2026-11-04T07:30:00.000Z',
    },
    latest: {
      ts: '2026-11-04T08:00:00.000Z',
      mode: 'AUTO',
      distCm: 38.5,
      valid: true,
      state: 'MAJU',
      pwm: 180,
      avoidCount: 7,
      rssi: -61,
    },
    telemetry: [
      {
        ts: '2026-11-04T07:59:52.000Z',
        mode: 'AUTO',
        distCm: 35.4,
        valid: true,
        state: 'MAJU',
        pwm: 178,
        avoidCount: 6,
        rssi: -62,
      },
      {
        ts: '2026-11-04T07:59:54.000Z',
        mode: 'AUTO',
        distCm: 36.8,
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 6,
        rssi: -61,
      },
      {
        ts: '2026-11-04T07:59:56.000Z',
        mode: 'AUTO',
        distCm: 37.2,
        valid: true,
        state: 'MAJU',
        pwm: 181,
        avoidCount: 6,
        rssi: -60,
      },
      {
        ts: '2026-11-04T08:00:00.000Z',
        mode: 'AUTO',
        distCm: 38.5,
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 7,
        rssi: -61,
      },
    ],
    events: [
      {
        id: '1008',
        ts: '2026-11-04T07:59:00.000Z',
        mode: 'AUTO',
        source: 'DEVICE',
        type: 'AVOID_DONE',
        detail: { avoid_count: 7 },
      },
    ],
    rttMs: 180,
    dataAgeSeconds: 2,
  };

  return {
    isMockDataEnabled: true,
    useDashboardSnapshot: () => ({
      data: snapshot,
      isError: false,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    }),
    useStartCommand: () => ({ mutate: vi.fn(), isPending: false }),
    useStopCommand: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

describe('DashboardPage', () => {
  it('renders the live summary and command controls', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Ringkasan Langsung')).toBeInTheDocument();
    expect(screen.getByText('Jarak Depan')).toBeInTheDocument();
    expect(screen.getByText('38,5 cm')).toBeInTheDocument();
    expect(screen.getByText('Penghindaran')).toBeInTheDocument();
    expect(screen.getByText('Event Terbaru')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'START' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /Buka kendali/i })).toHaveAttribute('href', '/control');
    expect(screen.queryByRole('button', { name: 'STOP' })).not.toBeInTheDocument();
  });
});
