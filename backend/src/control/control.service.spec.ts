import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeviceService } from '../devices/devices.service';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { ControlService } from './control.service';

describe('ControlService', () => {
  let service: ControlService;
  let prisma: {
    device: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    telemetry: {
      findFirst: jest.Mock;
    };
  };
  let devices: {
    ensureDevice: jest.Mock;
  };
  let mqtt: {
    publish: jest.Mock;
  };
  let config: {
    get: jest.Mock;
  };
  let emitter: {
    emit: jest.Mock;
  };

  const sampleDevice = {
    id: 'car01',
    name: 'Car 01',
    online: true,
    mode: 'MANUAL',
    state: 'STOP',
    controlEpoch: 3,
    controlUserId: null,
    controlUntil: null,
    controlUser: null,
  };

  beforeEach(() => {
    prisma = {
      device: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      telemetry: {
        findFirst: jest.fn(),
      },
    };

    devices = {
      ensureDevice: jest.fn().mockResolvedValue({ id: 'car01', online: true }),
    };

    mqtt = {
      publish: jest.fn(),
    };

    config = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'CONTROL_LOCK_TTL_SECONDS':
            return 10;
          case 'MANUAL_MAX_RTT_MS':
            return 500;
          case 'DRIVE_RATE_LIMIT_PER_SEC':
            return 10;
          case 'DRIVE_TTL_MS':
            return 500;
          case 'TELEMETRY_MAX_AGE_SECONDS':
            return 5;
          default:
            return 0;
        }
      }),
    };

    emitter = {
      emit: jest.fn(),
    };

    service = new ControlService(
      prisma as unknown as PrismaService,
      devices as unknown as DeviceService,
      mqtt as unknown as MqttService,
      config as unknown as ConfigService<Record<string, unknown>, true>,
      emitter as unknown as EventEmitter2,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('getControl', () => {
    it('returns controller null when no lock is active', async () => {
      prisma.device.findUnique.mockResolvedValue(sampleDevice);

      const result = await service.getControl('car01');

      expect(result.controller).toBeNull();
      expect(result.sid).toBe(3);
      expect(result.mode).toBe('MANUAL');
      expect(result.state).toBe('STOP');
    });

    it('returns controller details when actively locked', async () => {
      const until = new Date(Date.now() + 8000);
      prisma.device.findUnique.mockResolvedValue({
        ...sampleDevice,
        controlUserId: 'user-1',
        controlUntil: until,
        controlUser: { username: 'admin' },
      });

      const result = await service.getControl('car01');

      expect(result.controller).toEqual({
        username: 'admin',
        until: until.toISOString(),
      });
    });
  });

  describe('acquire', () => {
    it('throws ConflictException if device is offline', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...sampleDevice,
        online: false,
      });

      await expect(service.acquire('car01', 'user-1', 'admin')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException CONTROL_TAKEN if lock is held by another user', async () => {
      const until = new Date(Date.now() + 5000);
      prisma.device.findUnique.mockResolvedValue({
        ...sampleDevice,
        controlUserId: 'user-other',
        controlUntil: until,
        controlUser: { username: 'operator' },
      });

      await expect(service.acquire('car01', 'user-1', 'admin')).rejects.toThrow(
        ConflictException,
      );
    });

    it('acquires lock, increments sid, and emits controlUpdated', async () => {
      prisma.device.findUnique.mockResolvedValue(sampleDevice);
      prisma.device.update.mockResolvedValue({});

      const result = await service.acquire('car01', 'user-1', 'admin');

      expect(result.sid).toBe(4);
      expect(prisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'car01' },
          data: expect.objectContaining({
            controlUserId: 'user-1',
            controlEpoch: 4,
          }),
        }),
      );
      expect(emitter.emit).toHaveBeenCalledWith(
        'app.control.updated',
        expect.objectContaining({
          deviceId: 'car01',
          sid: 4,
          controller: expect.objectContaining({ username: 'admin' }),
        }),
      );
    });
  });

  describe('release', () => {
    it('clears lock in DB and publishes best-effort drive S', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...sampleDevice,
        controlUserId: 'user-1',
        controlEpoch: 4,
      });

      await service.release('car01', 'user-1');

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'car01' },
        data: { controlUserId: null, controlUntil: null },
      });
      expect(mqtt.publish).toHaveBeenCalledWith(
        'car/car01/drive',
        expect.objectContaining({
          sid: 4,
          dir: 'S',
          spd: 0,
        }),
        { qos: 0, retain: false },
      );
      expect(emitter.emit).toHaveBeenCalledWith('app.control.updated', {
        deviceId: 'car01',
        controller: null,
        sid: 4,
      });
    });

    it('does nothing if user is not holder', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...sampleDevice,
        controlUserId: 'user-2',
      });

      await service.release('car01', 'user-1');

      expect(prisma.device.update).not.toHaveBeenCalled();
      expect(mqtt.publish).not.toHaveBeenCalled();
    });
  });

  describe('handleDrive', () => {
    const activeLock = {
      ...sampleDevice,
      online: true,
      mode: 'MANUAL',
      controlUserId: 'user-1',
      controlUntil: new Date(Date.now() + 5000),
      controlEpoch: 4,
    };

    it('rejects NOT_HOLDER when lock is not held by user', async () => {
      prisma.device.findUnique.mockResolvedValue(sampleDevice);

      const result = await service.handleDrive('car01', 'user-1', 'F', 60);
      expect(result).toEqual({ ok: false, reason: 'NOT_HOLDER' });
    });

    it('rejects DEVICE_OFFLINE when device is offline', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...activeLock,
        online: false,
      });

      const result = await service.handleDrive('car01', 'user-1', 'F', 60);
      expect(result).toEqual({ ok: false, reason: 'DEVICE_OFFLINE' });
    });

    it('rejects NOT_MANUAL when device mode is AUTO', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...activeLock,
        mode: 'AUTO',
      });

      const result = await service.handleDrive('car01', 'user-1', 'F', 60);
      expect(result).toEqual({ ok: false, reason: 'NOT_MANUAL' });
    });

    it('rejects STALE_DATA when latest telemetry is missing or > 5s', async () => {
      prisma.device.findUnique.mockResolvedValue(activeLock);
      prisma.telemetry.findFirst.mockResolvedValue({
        ts: new Date(Date.now() - 6000), // 6 seconds old
      });

      const result = await service.handleDrive('car01', 'user-1', 'F', 60);
      expect(result).toEqual({ ok: false, reason: 'STALE_DATA' });
    });

    it('accepts valid drive message and publishes to MQTT', async () => {
      prisma.device.findUnique.mockResolvedValue(activeLock);
      prisma.telemetry.findFirst.mockResolvedValue({
        ts: new Date(),
      });
      prisma.device.update.mockResolvedValue({});

      const result = await service.handleDrive('car01', 'user-1', 'F', 60);

      expect(result).toEqual({ ok: true });
      expect(mqtt.publish).toHaveBeenCalledWith(
        'car/car01/drive',
        expect.objectContaining({
          sid: 4,
          dir: 'F',
          spd: 60,
          ttl_ms: 500,
        }),
        { qos: 0, retain: false },
      );
    });

    it('rejects RATE_LIMITED when exceeding driveRateLimitPerSec', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...activeLock,
        controlUserId: 'user-rate',
      });
      prisma.telemetry.findFirst.mockResolvedValue({ ts: new Date() });
      prisma.device.update.mockResolvedValue({});

      // Send 10 drives (should succeed)
      for (let i = 0; i < 10; i++) {
        const res = await service.handleDrive('car01', 'user-rate', 'F', 50);
        expect(res.ok).toBe(true);
      }

      // 11th drive within same second must be rate-limited
      const res11 = await service.handleDrive('car01', 'user-rate', 'F', 50);
      expect(res11).toEqual({ ok: false, reason: 'RATE_LIMITED' });
    });
  });

  describe('handlePong & RTT', () => {
    it('computes RTT and emits rttMeasured event', () => {
      const sendTime = Date.now() - 120;
      service.handlePong({
        deviceId: 'car01',
        payload: { seq: 1, t: sendTime },
        receivedAt: new Date(),
      });

      expect(emitter.emit).toHaveBeenCalledWith(
        'app.control.rtt',
        expect.objectContaining({
          deviceId: 'car01',
          rttMs: expect.any(Number),
        }),
      );
    });
  });
});
