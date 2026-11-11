import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeviceService } from '../devices/devices.service';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceConfigService } from './device-config.service';

function configRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ver: 1,
    stopCm: 25,
    resumeCm: 30,
    maxPwm: 200,
    manualMaxPwm: 150,
    updatedAt: new Date('2026-11-11T08:00:00Z'),
    ...overrides,
  };
}

function updateBody(overrides: Record<string, number> = {}): Record<string, number> {
  return {
    stopCm: 30,
    resumeCm: 35,
    maxPwm: 220,
    manualMaxPwm: 160,
    ...overrides,
  };
}

describe('DeviceConfigService', () => {
  const findUnique = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const ensureDevice = jest.fn();
  const mqttPublish = jest.fn();
  const emitter = new EventEmitter2();
  const emitterSpy = jest.spyOn(emitter, 'emit');

  function createService(): DeviceConfigService {
    const prisma = {
      deviceConfig: { findUnique, create, update },
    } as unknown as PrismaService;
    const devices = { ensureDevice } as unknown as DeviceService;
    const mqtt = { publish: mqttPublish } as unknown as MqttService;

    return new DeviceConfigService(prisma, devices, mqtt, emitter);
  }

  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
    update.mockReset();
    ensureDevice.mockReset().mockResolvedValue(undefined);
    mqttPublish.mockReset().mockReturnValue(true);
    emitterSpy.mockClear();
  });

  describe('get', () => {
    it('returns existing config', async () => {
      findUnique.mockResolvedValueOnce(configRow());

      await expect(createService().get('car01')).resolves.toEqual({
        ver: 1,
        stopCm: 25,
        resumeCm: 30,
        maxPwm: 200,
        manualMaxPwm: 150,
        updatedAt: '2026-11-11T08:00:00.000Z',
      });

      expect(create).not.toHaveBeenCalled();
    });

    it('creates default config when missing', async () => {
      findUnique.mockResolvedValueOnce(null);
      create.mockResolvedValueOnce(configRow());

      await expect(createService().get('car01')).resolves.toMatchObject({ ver: 1, stopCm: 25 });

      expect(create).toHaveBeenCalledWith({
        data: { deviceId: 'car01' },
        select: expect.any(Object),
      });
    });

    it('retries after concurrent create loses race', async () => {
      findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(configRow({ ver: 2, stopCm: 40 }));
      create.mockRejectedValueOnce(new Error('unique constraint violated'));

      await expect(createService().get('car01')).resolves.toMatchObject({ ver: 2, stopCm: 40 });
    });
  });

  describe('update', () => {
    it('bumps ver, publishes retained config, and emits update', async () => {
      findUnique.mockResolvedValueOnce(configRow());
      update.mockResolvedValueOnce(
        configRow({
          ver: 2,
          stopCm: 30,
          resumeCm: 35,
          maxPwm: 220,
          manualMaxPwm: 160,
          updatedAt: new Date('2026-11-11T08:01:00Z'),
        }),
      );

      const result = await createService().update('car01', updateBody() as never);

      expect(update).toHaveBeenCalledWith({
        where: { deviceId: 'car01' },
        data: { ver: 2, stopCm: 30, resumeCm: 35, maxPwm: 220, manualMaxPwm: 160 },
        select: expect.any(Object),
      });
      expect(mqttPublish).toHaveBeenCalledWith(
        'car/car01/config',
        { ver: 2, stopCm: 30, resumeCm: 35, maxPwm: 220, manualMaxPwm: 160 },
        { qos: 1, retain: true },
      );
      expect(emitterSpy).toHaveBeenCalledWith('app.config.updated', {
        deviceId: 'car01',
        config: { ver: 2, stopCm: 30, resumeCm: 35, maxPwm: 220, manualMaxPwm: 160 },
      });
      expect(result.updatedAt).toBe('2026-11-11T08:01:00.000Z');
    });

    it('creates default config before first update', async () => {
      findUnique.mockResolvedValueOnce(null);
      create.mockResolvedValueOnce(configRow());
      update.mockResolvedValueOnce(configRow({ ver: 2 }));

      await createService().update('car01', updateBody() as never);

      expect(create).toHaveBeenCalledWith({
        data: { deviceId: 'car01' },
        select: expect.any(Object),
      });
      expect(update.mock.calls[0][0].data.ver).toBe(2);
    });

    it('rejects resume_cm below stop_cm + 3 without touching database', async () => {
      const error = await createService()
        .update('car01', updateBody({ stopCm: 25, resumeCm: 27 }) as never)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'resume_cm', issue: 'min 28' }],
      });
      expect(findUnique).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects manual_max_pwm above max_pwm', async () => {
      const error = await createService()
        .update('car01', updateBody({ manualMaxPwm: 210, maxPwm: 200 }) as never)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'manual_max_pwm', issue: 'max 200' }],
      });
    });
  });
});
