import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.validation';
import { DeviceStateService } from '../device-state/device-state.service';
import { DeviceService } from '../devices/devices.service';
import type { TelemetryReceivedEvent } from '../mqtt/mqtt.constants';
import type { TelemetryPayload } from '../mqtt/payload-schemas';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryService } from './telemetry.service';
import type { TelemetryQueryDto } from './dto/telemetry-query.dto';

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function payload(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    seq: 1,
    ts: 0,
    mode: 'AUTO',
    dist_cm: 40,
    valid: true,
    state: 'MAJU',
    pwm: 180,
    avoid_count: 0,
    rssi: -60,
    ...overrides,
  };
}

function event(overrides: Partial<TelemetryReceivedEvent> = {}): TelemetryReceivedEvent {
  return {
    deviceId: 'car01',
    payload: payload(),
    receivedAt: new Date('2026-11-11T08:00:00Z'),
    ...overrides,
  };
}

describe('TelemetryService', () => {
  const createTelemetry = jest.fn();
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const queryRaw = jest.fn();
  const applyTelemetry = jest.fn();
  const markSeen = jest.fn();

  function createService(sampleIntervalSeconds = 2): TelemetryService {
    const prisma = {
      telemetry: { create: createTelemetry, findFirst, findMany },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;
    const config = {
      get: (key: string): number =>
        key === 'TELEMETRY_SAMPLE_INTERVAL_SECONDS' ? sampleIntervalSeconds : 0,
    } as unknown as ConfigService<Env, true>;
    const deviceState = { applyTelemetry } as unknown as DeviceStateService;
    const devices = { markSeenFromTelemetry: markSeen } as unknown as DeviceService;

    return new TelemetryService(prisma, config, deviceState, devices);
  }

  beforeEach(() => {
    createTelemetry.mockReset();
    findFirst.mockReset();
    findMany.mockReset();
    queryRaw.mockReset();
    applyTelemetry.mockReset();
    markSeen.mockReset().mockResolvedValue(true);
  });

  describe('handleTelemetry', () => {
    it('persists first telemetry for known device', async () => {
      createService().handleTelemetry(event());
      await flush();

      expect(createTelemetry).toHaveBeenCalledTimes(1);
      expect(createTelemetry.mock.calls[0][0]).toEqual({
        data: {
          deviceId: 'car01',
          ts: new Date('2026-11-11T08:00:00Z'),
          mode: 'AUTO',
          distCm: 40,
          valid: true,
          state: 'MAJU',
          pwm: 180,
          avoidCount: 0,
          rssi: -60,
        },
      });
    });

    it('skips persisting unchanged telemetry within sample interval', async () => {
      const service = createService();
      service.handleTelemetry(event());
      await flush();

      service.handleTelemetry(event({ receivedAt: new Date('2026-11-11T08:00:01Z') }));
      await flush();

      expect(createTelemetry).toHaveBeenCalledTimes(1);
      expect(markSeen).toHaveBeenCalledTimes(2);
    });

    it('persists telemetry again after sample interval elapsed', async () => {
      const service = createService();
      service.handleTelemetry(event());
      await flush();

      service.handleTelemetry(event({ receivedAt: new Date('2026-11-11T08:00:03Z') }));
      await flush();

      expect(createTelemetry).toHaveBeenCalledTimes(2);
    });

    it('persists immediately when state changes', async () => {
      const service = createService();
      service.handleTelemetry(event());
      await flush();

      service.handleTelemetry(
        event({ payload: payload({ state: 'BELOK' }), receivedAt: new Date('2026-11-11T08:00:01Z') }),
      );
      await flush();

      expect(createTelemetry).toHaveBeenCalledTimes(2);
    });

    it('persists immediately when mode changes', async () => {
      const service = createService();
      service.handleTelemetry(event());
      await flush();

      service.handleTelemetry(
        event({
          payload: payload({ mode: 'MANUAL', state: 'STOP' }),
          receivedAt: new Date('2026-11-11T08:00:01Z'),
        }),
      );
      await flush();

      expect(createTelemetry).toHaveBeenCalledTimes(2);
    });

    it('does not persist unknown device', async () => {
      markSeen.mockResolvedValueOnce(false);

      createService().handleTelemetry(event());
      await flush();

      expect(createTelemetry).not.toHaveBeenCalled();
    });

    it('uses payload timestamp when set', async () => {
      createService().handleTelemetry(event({ payload: payload({ ts: 1770000000 }) }));
      await flush();

      expect(createTelemetry.mock.calls[0][0].data.ts).toEqual(new Date(1770000000000));
    });

    it('updates in-memory state for every telemetry', async () => {
      createService().handleTelemetry(event());
      await flush();

      expect(applyTelemetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('latest', () => {
    it('returns null when no telemetry exists', async () => {
      findFirst.mockResolvedValueOnce(null);

      await expect(createService().latest('car01')).resolves.toBeNull();
    });

    it('maps the newest row', async () => {
      findFirst.mockResolvedValueOnce({
        ts: new Date('2026-11-11T08:00:00Z'),
        mode: 'AUTO',
        distCm: 40,
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 3,
        rssi: -60,
      });

      await expect(createService().latest('car01')).resolves.toEqual({
        ts: '2026-11-11T08:00:00.000Z',
        mode: 'AUTO',
        distCm: 40,
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 3,
        rssi: -60,
      });
    });

    it('nullifies distance for invalid rows', async () => {
      findFirst.mockResolvedValueOnce({
        ts: new Date('2026-11-11T08:00:00Z'),
        mode: 'AUTO',
        distCm: 0,
        valid: false,
        state: 'STOP',
        pwm: 0,
        avoidCount: 0,
        rssi: null,
      });

      await expect(createService().latest('car01')).resolves.toMatchObject({
        distCm: null,
        valid: false,
      });
    });
  });

  describe('history', () => {
    const baseRow = {
      ts: new Date('2026-11-11T08:00:00Z'),
      mode: 'AUTO',
      distCm: 40,
      valid: true,
      state: 'MAJU',
      pwm: 180,
      avoidCount: 0,
      rssi: -60,
    };

    it('rejects from after to', async () => {
      const query: TelemetryQueryDto = {
        from: '2026-11-11T08:00:10Z',
        to: '2026-11-11T08:00:00Z',
      };

      await expect(createService().history('car01', query)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns raw rows in ascending order with meta', async () => {
      findMany.mockResolvedValueOnce([
        { ...baseRow, ts: new Date('2026-11-11T08:00:02Z') },
        baseRow,
      ]);

      const result = await createService().history('car01', {
        from: '2026-11-11T08:00:00Z',
        to: '2026-11-11T08:00:10Z',
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].ts).toBe('2026-11-11T08:00:00.000Z');
      expect(result.data[1].ts).toBe('2026-11-11T08:00:02.000Z');
      expect(result.meta).toEqual({
        count: 2,
        from: '2026-11-11T08:00:00.000Z',
        to: '2026-11-11T08:00:10.000Z',
        mode: null,
      });
      expect(findMany.mock.calls[0][0]).toMatchObject({
        where: {
          deviceId: 'car01',
          ts: {
            gte: new Date('2026-11-11T08:00:00Z'),
            lte: new Date('2026-11-11T08:00:10Z'),
          },
        },
        take: 500,
      });
    });

    it('filters history by mode', async () => {
      findMany.mockResolvedValueOnce([]);

      await createService().history('car01', { mode: 'MANUAL' });

      expect(findMany.mock.calls[0][0].where).toMatchObject({ deviceId: 'car01', mode: 'MANUAL' });
    });

    it('returns aggregated rows when interval set', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          bucket: new Date('2026-11-11T08:00:05Z'),
          mode: 'AUTO',
          state: 'MAJU',
          valid: true,
          dist_cm: 30,
          pwm: 180,
          avoid_count: 2,
          rssi: -60,
        },
      ]);

      const result = await createService().history('car01', { interval: '5s' });

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual([
        {
          ts: '2026-11-11T08:00:05.000Z',
          mode: 'AUTO',
          distCm: 30,
          valid: true,
          state: 'MAJU',
          pwm: 180,
          avoidCount: 2,
          rssi: -60,
        },
      ]);
      expect(result.meta.count).toBe(1);
    });

    it('nullifies distance for invalid aggregated buckets', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          bucket: new Date('2026-11-11T08:00:05Z'),
          mode: 'AUTO',
          state: 'STOP',
          valid: false,
          dist_cm: 30,
          pwm: null,
          avoid_count: 0,
          rssi: null,
        },
      ]);

      const result = await createService().history('car01', { interval: '30s' });

      expect(result.data[0]).toMatchObject({ distCm: null, pwm: 0, valid: false });
    });
  });
});
