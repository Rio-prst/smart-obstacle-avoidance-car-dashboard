import type { StatusPayload, TelemetryPayload } from '../mqtt/payload-schemas';
import { DeviceStateService } from './device-state.service';

function telemetry(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    seq: 1,
    ts: 0,
    mode: 'AUTO',
    dist_cm: 40,
    valid: true,
    state: 'MAJU',
    pwm: 180,
    avoid_count: 2,
    rssi: -60,
    ...overrides,
  };
}

describe('DeviceStateService', () => {
  it('returns null for unknown device', () => {
    expect(new DeviceStateService().get('car01')).toBeNull();
  });

  it('applies telemetry into snapshot', () => {
    const service = new DeviceStateService();
    const receivedAt = new Date('2026-11-11T08:00:00Z');

    service.applyTelemetry('car01', telemetry({ state: 'BELOK', avoid_count: 5 }), receivedAt);

    expect(service.get('car01')).toEqual({
      deviceId: 'car01',
      online: true,
      mode: 'AUTO',
      state: 'BELOK',
      fw: null,
      lastSeen: receivedAt,
      avoidCount: 5,
      latestTelemetry: telemetry({ state: 'BELOK', avoid_count: 5 }),
      lastTelemetryAt: receivedAt,
    });
  });

  it('applies online status with firmware', () => {
    const service = new DeviceStateService();
    const receivedAt = new Date('2026-11-11T08:00:00Z');
    const status: StatusPayload = { online: true, fw: 'v1.2.0' };

    service.applyStatus('car01', status, receivedAt);

    expect(service.get('car01')).toMatchObject({
      online: true,
      fw: 'v1.2.0',
      lastSeen: receivedAt,
    });
  });

  it('applies offline status keeping lastSeen', () => {
    const service = new DeviceStateService();
    const receivedAt = new Date('2026-11-11T08:00:00Z');

    service.applyStatus('car01', { online: true }, receivedAt);
    service.applyStatus('car01', { online: false }, new Date('2026-11-11T08:00:05Z'));

    expect(service.get('car01')).toMatchObject({
      online: false,
      lastSeen: receivedAt,
    });
  });

  it('marks known device offline', () => {
    const service = new DeviceStateService();
    service.applyStatus('car01', { online: true }, new Date());

    service.markOffline('car01');

    expect(service.get('car01')).toMatchObject({ online: false });
  });

  it('ignores markOffline for unknown device', () => {
    expect(() => new DeviceStateService().markOffline('car01')).not.toThrow();
  });

  it('keeps separate snapshots per device', () => {
    const service = new DeviceStateService();

    service.applyTelemetry('car01', telemetry(), new Date());
    service.applyTelemetry('car02', telemetry({ mode: 'MANUAL', state: 'STOP' }), new Date());

    expect(service.get('car01')).toMatchObject({ mode: 'AUTO', state: 'MAJU' });
    expect(service.get('car02')).toMatchObject({ mode: 'MANUAL', state: 'STOP' });
  });
});
