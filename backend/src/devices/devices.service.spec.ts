import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Env } from '../config/env.validation';
import { DeviceStateService } from '../device-state/device-state.service';
import { EventsService } from '../events/events.service';
import type { StatusReceivedEvent } from '../mqtt/mqtt.constants';
import type { TelemetryPayload } from '../mqtt/payload-schemas';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceService } from './devices.service';

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function telemetry(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
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

function statusEvent(overrides: Partial<StatusReceivedEvent> = {}): StatusReceivedEvent {
  return {
    deviceId: 'car01',
    payload: { online: true },
    receivedAt: new Date('2026-11-11T08:00:00Z'),
    ...overrides,
  };
}

describe('DeviceService', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const applyStatus = jest.fn();
  const markOffline = jest.fn();
  const recordServerEvent = jest.fn();
  const emitter = new EventEmitter2();
  const emitterSpy = jest.spyOn(emitter, 'emit');

  function createService(offlineAfterSeconds = 15): DeviceService {
    const prisma = {
      device: { findUnique, update, findMany },
      telemetry: { findFirst },
    } as unknown as PrismaService;
    const config = {
      get: (key: string): number =>
        key === 'DEVICE_OFFLINE_AFTER_SECONDS' ? offlineAfterSeconds : 0,
    } as unknown as ConfigService<Env, true>;
    const deviceState = { applyStatus, markOffline } as unknown as DeviceStateService;
    const events = { recordServerEvent } as unknown as EventsService;

    return new DeviceService(prisma, config, deviceState, events, emitter);
  }

  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset().mockResolvedValue({});
    findMany.mockReset();
    findFirst.mockReset();
    applyStatus.mockReset();
    markOffline.mockReset();
    recordServerEvent.mockReset().mockResolvedValue(undefined);
    emitterSpy.mockClear();
  });

  describe('handleStatus', () => {
    it('updates in-memory state and database', async () => {
      findUnique.mockResolvedValueOnce({ online: false });
      const receivedAt = new Date('2026-11-11T08:00:00Z');

      createService().handleStatus(
        statusEvent({ payload: { online: true, fw: 'v1.2.0' }, receivedAt }),
      );
      await flush();

      expect(applyStatus).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'car01' },
        data: {
          online: true,
          lastSeen: receivedAt,
          fw: 'v1.2.0',
        },
      });
      expect(emitterSpy).toHaveBeenCalledWith('app.device.status', {
        deviceId: 'car01',
        online: true,
        lastSeen: '2026-11-11T08:00:00.000Z',
      });
    });

    it('records online event when device was offline', async () => {
      findUnique.mockResolvedValueOnce({ online: false });

      createService().handleStatus(statusEvent({ payload: { online: true } }));
      await flush();

      expect(recordServerEvent).toHaveBeenCalledWith('car01', 'DEVICE_ONLINE', {});
    });

    it('records offline LWT event when device was online', async () => {
      findUnique.mockResolvedValueOnce({ online: true });

      createService().handleStatus(statusEvent({ payload: { online: false } }));
      await flush();

      expect(recordServerEvent).toHaveBeenCalledWith('car01', 'DEVICE_OFFLINE', { source: 'LWT' });
      expect(emitterSpy).toHaveBeenCalledWith('app.device.status', {
        deviceId: 'car01',
        online: false,
        lastSeen: '2026-11-11T08:00:00.000Z',
      });
    });

    it('does not record events when state unchanged', async () => {
      findUnique.mockResolvedValueOnce({ online: true });

      createService().handleStatus(statusEvent({ payload: { online: true } }));
      await flush();

      expect(recordServerEvent).not.toHaveBeenCalled();
      expect(emitterSpy).not.toHaveBeenCalled();
    });

    it('ignores unknown device', async () => {
      findUnique.mockResolvedValueOnce(null);

      createService().handleStatus(statusEvent());
      await flush();

      expect(update).not.toHaveBeenCalled();
      expect(recordServerEvent).not.toHaveBeenCalled();
    });
  });

  describe('detectOfflineDevices', () => {
    it('marks stale devices offline with timeout event', async () => {
      const lastSeen = new Date('2026-11-11T07:59:00Z');
      findMany.mockResolvedValueOnce([
        { id: 'car01', lastSeen },
        { id: 'car02', lastSeen: null },
      ]);

      await createService(15).detectOfflineDevices();

      expect(findMany.mock.calls[0][0].where).toMatchObject({ online: true });
      expect(findMany.mock.calls[0][0].where.lastSeen.lt).toBeInstanceOf(Date);
      expect(update).toHaveBeenCalledTimes(2);
      expect(markOffline).toHaveBeenCalledWith('car01');
      expect(markOffline).toHaveBeenCalledWith('car02');
      expect(recordServerEvent).toHaveBeenCalledWith('car01', 'DEVICE_OFFLINE', {
        source: 'TIMEOUT',
      });
      expect(emitterSpy).toHaveBeenCalledWith('app.device.status', {
        deviceId: 'car01',
        online: false,
        lastSeen: '2026-11-11T07:59:00.000Z',
      });
      expect(emitterSpy).toHaveBeenCalledWith('app.device.status', {
        deviceId: 'car02',
        online: false,
        lastSeen: null,
      });
    });

    it('does nothing when no stale devices', async () => {
      findMany.mockResolvedValueOnce([]);

      await createService().detectOfflineDevices();

      expect(update).not.toHaveBeenCalled();
      expect(recordServerEvent).not.toHaveBeenCalled();
      expect(emitterSpy).not.toHaveBeenCalled();
    });
  });

  describe('markSeenFromTelemetry', () => {
    it('returns false for unknown device', async () => {
      findUnique.mockResolvedValueOnce(null);

      await expect(
        createService().markSeenFromTelemetry('car99', telemetry(), new Date()),
      ).resolves.toBe(false);

      expect(update).not.toHaveBeenCalled();
    });

    it('updates device fields and records online event for offline device', async () => {
      findUnique.mockResolvedValueOnce({ online: false });
      const receivedAt = new Date('2026-11-11T08:00:00Z');

      await expect(
        createService().markSeenFromTelemetry('car01', telemetry({ state: 'BELOK' }), receivedAt),
      ).resolves.toBe(true);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'car01' },
        data: {
          online: true,
          mode: 'AUTO',
          state: 'BELOK',
          lastSeen: receivedAt,
        },
      });
      expect(recordServerEvent).toHaveBeenCalledWith('car01', 'DEVICE_ONLINE', {});
      expect(emitterSpy).toHaveBeenCalledWith('app.device.status', {
        deviceId: 'car01',
        online: true,
        lastSeen: '2026-11-11T08:00:00.000Z',
      });
    });

    it('skips online event when device already online', async () => {
      findUnique.mockResolvedValueOnce({ online: true });

      await createService().markSeenFromTelemetry('car01', telemetry(), new Date());

      expect(recordServerEvent).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('maps devices to list items', async () => {
      findMany.mockResolvedValueOnce([
        {
          id: 'car01',
          name: 'Car 01',
          online: true,
          mode: 'AUTO',
          state: 'MAJU',
          lastSeen: new Date('2026-11-11T08:00:00Z'),
          fw: 'v1.2.0',
        },
      ]);

      await expect(createService().list()).resolves.toEqual([
        {
          id: 'car01',
          name: 'Car 01',
          online: true,
          mode: 'AUTO',
          state: 'MAJU',
          lastSeen: '2026-11-11T08:00:00.000Z',
          fw: 'v1.2.0',
        },
      ]);
    });
  });

  describe('get', () => {
    it('throws for unknown device', async () => {
      findUnique.mockResolvedValueOnce(null);

      await expect(createService().get('car99')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns detail with avoid count and controller info', async () => {
      findUnique.mockResolvedValueOnce({
        id: 'car01',
        name: 'Car 01',
        online: true,
        mode: 'MANUAL',
        state: 'STOP',
        lastSeen: new Date('2026-11-11T08:00:00Z'),
        fw: 'v1.2.0',
        controlUserId: 1,
        controlUser: { username: 'admin' },
        controlUntil: new Date('2026-11-11T08:05:00Z'),
      });
      findFirst.mockResolvedValueOnce({ avoidCount: 7 });

      await expect(createService().get('car01')).resolves.toEqual({
        id: 'car01',
        name: 'Car 01',
        online: true,
        mode: 'MANUAL',
        state: 'STOP',
        lastSeen: '2026-11-11T08:00:00.000Z',
        fw: 'v1.2.0',
        avoidCount: 7,
        controller: { username: 'admin', until: '2026-11-11T08:05:00.000Z' },
      });
    });
  });

  describe('ensureDevice', () => {
    it('passes for existing device', async () => {
      findUnique.mockResolvedValueOnce({ id: 'car01' });

      await expect(createService().ensureDevice('car01')).resolves.toBeUndefined();
    });

    it('throws for unknown device', async () => {
      findUnique.mockResolvedValueOnce(null);

      await expect(createService().ensureDevice('car99')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
