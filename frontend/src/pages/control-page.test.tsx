import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlSnapshot } from '@/types/api';
import { ControlPage } from './control-page';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  drive: vi.fn(),
  startPending: false,
  stopPending: false,
}));

let snapshot: ControlSnapshot;

vi.mock('@/hooks/use-control-data', () => ({
  useControlSnapshot: () => ({
    data: snapshot,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSetMode: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useAcquireControl: () => ({ mutate: vi.fn(), isPending: false }),
  useReleaseControl: () => ({ mutate: vi.fn(), isPending: false }),
  useDriveControl: () => ({ mutate: mocks.drive }),
}));

vi.mock('@/hooks/use-dashboard-data', () => ({
  useStartCommand: () => ({ mutate: mocks.start, isPending: mocks.startPending }),
  useStopCommand: () => ({ mutate: mocks.stop, isPending: mocks.stopPending }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startPending = false;
  mocks.stopPending = false;
  snapshot = {
    device: {
      id: 'car01',
      name: 'Mobil 1',
      online: true,
      mode: 'AUTO',
      state: 'STOP',
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
      state: 'STOP',
      pwm: 0,
      avoidCount: 7,
      rssi: -61,
    },
    controller: null,
    sid: null,
    rttMs: 180,
    dataAgeSeconds: 2,
    commands: [],
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ControlPage commands', () => {
  it('offers START for an online AUTO device at STOP', () => {
    render(<ControlPage />);

    expect(screen.getByText('Perintah', { exact: true })).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'START' });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(mocks.start).toHaveBeenCalledWith(undefined, expect.any(Object));
    expect(screen.queryByRole('button', { name: /mundur/i })).not.toBeInTheDocument();
  });

  it.each([
    { online: false, mode: 'AUTO' as const, state: 'STOP' as const, reason: 'Perangkat offline.' },
    { online: true, mode: 'MANUAL' as const, state: 'STOP' as const, reason: 'Mode MANUAL tidak menerima START.' },
    { online: true, mode: 'AUTO' as const, state: 'MAJU' as const, reason: 'Perangkat harus STOP sebelum START.' },
  ])('disables START with an explanation for $mode/$state, online=$online', ({ reason, ...device }) => {
    Object.assign(snapshot.device, device);
    render(<ControlPage />);

    const start = screen.getByRole('button', { name: 'START' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(reason);
    fireEvent.click(start);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('prevents duplicate START while a request is pending without disabling STOP', () => {
    mocks.startPending = true;
    mocks.stopPending = true;
    render(<ControlPage />);

    expect(screen.getByRole('button', { name: 'Mengirim START…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'STOP' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Berhenti' })).toBeEnabled();
  });

  it.each([
    { mode: 'AUTO' as const, online: true },
    { mode: 'AUTO' as const, online: false },
    { mode: 'MANUAL' as const, online: true },
    { mode: 'MANUAL' as const, online: false },
  ])('keeps both STOP controls usable without a lock in $mode, online=$online', (device) => {
    Object.assign(snapshot.device, device);
    render(<ControlPage />);

    expect(screen.getByRole('button', { name: 'Maju' })).toBeDisabled();
    const stopButtons = [
      screen.getByRole('button', { name: 'STOP' }),
      screen.getByRole('button', { name: 'Berhenti' }),
    ];
    for (const stop of stopButtons) {
      expect(stop).toBeEnabled();
      fireEvent.click(stop);
    }
    expect(mocks.stop).toHaveBeenCalledTimes(2);
    expect(mocks.stop).toHaveBeenCalledWith(undefined, expect.any(Object));
    expect(mocks.drive).not.toHaveBeenCalled();
  });

  it.each(['STOP', 'Berhenti'])('cancels held movement when %s is pressed', (name) => {
    vi.useFakeTimers();
    snapshot.device.mode = 'MANUAL';
    snapshot.controller = { username: 'admin', until: '2026-11-04T08:00:30.000Z' };
    render(<ControlPage />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Maju' }));
    expect(mocks.drive).toHaveBeenCalledWith({ direction: 'F', speed: 60 });
    vi.advanceTimersByTime(300);
    expect(mocks.drive).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name }));
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(900);
    expect(mocks.drive).toHaveBeenCalledTimes(2);
  });
});
