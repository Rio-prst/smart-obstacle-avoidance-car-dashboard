import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import type { EventQueryDto } from './dto/event-query.dto';

describe('EventsService', () => {
  const createEvent = jest.fn();
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const emitter = new EventEmitter2();
  const emitterSpy = jest.spyOn(emitter, 'emit');

  function createService(): EventsService {
    const prisma = {
      event: { create: createEvent, findMany },
      device: { findUnique },
    } as unknown as PrismaService;

    return new EventsService(prisma, emitter);
  }

  beforeEach(() => {
    createEvent.mockReset();
    findMany.mockReset();
    findUnique.mockReset();
    emitterSpy.mockClear();
  });

  describe('recordDeviceEvent', () => {
    it('stores device event with payload timestamp and emits realtime payload', async () => {
      createEvent.mockResolvedValueOnce({
        id: 5n,
        ts: new Date(1770000000000),
        mode: 'AUTO',
        source: 'DEVICE',
        type: 'AVOID_DONE',
        detail: { dist_cm: 12, from: 'MAJU', to: 'BELOK' },
      });

      await createService().recordDeviceEvent({
        deviceId: 'car01',
        payload: {
          seq: 1,
          ts: 1770000000,
          type: 'AVOID_DONE',
          mode: 'AUTO',
          detail: { dist_cm: 12, from: 'MAJU', to: 'BELOK' },
        },
        receivedAt: new Date('2026-11-11T09:00:00Z'),
      });

      expect(createEvent).toHaveBeenCalledWith({
        data: {
          deviceId: 'car01',
          ts: new Date(1770000000000),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
          detail: { dist_cm: 12, from: 'MAJU', to: 'BELOK' },
        },
        select: {
          id: true,
          ts: true,
          mode: true,
          source: true,
          type: true,
          detail: true,
        },
      });
      expect(emitterSpy).toHaveBeenCalledWith('app.event.recorded', {
        deviceId: 'car01',
        event: {
          id: '5',
          ts: new Date(1770000000000).toISOString(),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
          detail: { dist_cm: 12, from: 'MAJU', to: 'BELOK' },
        },
      });
    });

    it('falls back to received timestamp when payload ts is zero', async () => {
      createEvent.mockResolvedValueOnce({
        id: 6n,
        ts: new Date('2026-11-11T09:00:00Z'),
        mode: 'MANUAL',
        source: 'DEVICE',
        type: 'MODE_CHANGE',
        detail: {},
      });
      const receivedAt = new Date('2026-11-11T09:00:00Z');

      await createService().recordDeviceEvent({
        deviceId: 'car01',
        payload: { seq: 2, ts: 0, type: 'MODE_CHANGE', mode: 'MANUAL', detail: {} },
        receivedAt,
      });

      expect(createEvent.mock.calls[0][0].data.ts).toBe(receivedAt);
      expect(createEvent.mock.calls[0][0].data.detail).toEqual({});
      expect(emitterSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordServerEvent', () => {
    it('stores server event without mode and emits realtime payload', async () => {
      createEvent.mockResolvedValueOnce({
        id: 7n,
        ts: new Date('2026-11-11T09:00:00Z'),
        mode: null,
        source: 'SERVER',
        type: 'DEVICE_ONLINE',
        detail: {},
      });

      await createService().recordServerEvent('car01', 'DEVICE_ONLINE', {});

      expect(createEvent).toHaveBeenCalledWith({
        data: {
          deviceId: 'car01',
          ts: expect.any(Date),
          mode: null,
          source: 'SERVER',
          type: 'DEVICE_ONLINE',
          detail: {},
        },
        select: {
          id: true,
          ts: true,
          mode: true,
          source: true,
          type: true,
          detail: true,
        },
      });
      expect(emitterSpy).toHaveBeenCalledWith('app.event.recorded', {
        deviceId: 'car01',
        event: {
          id: '7',
          ts: new Date('2026-11-11T09:00:00Z').toISOString(),
          mode: null,
          source: 'SERVER',
          type: 'DEVICE_ONLINE',
          detail: {},
        },
      });
    });
  });

  describe('list', () => {
    beforeEach(() => {
      findUnique.mockResolvedValue({ id: 'car01' });
    });

    it('maps rows and returns pagination meta', async () => {
      findMany.mockResolvedValueOnce([
        {
          id: 20n,
          ts: new Date('2026-11-11T09:00:02Z'),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
          detail: { dist_cm: 12 },
        },
        {
          id: 10n,
          ts: new Date('2026-11-11T09:00:01Z'),
          mode: null,
          source: 'SERVER',
          type: 'DEVICE_ONLINE',
          detail: {},
        },
      ]);

      const result = await createService().list('car01', {});

      expect(result.data).toEqual([
        {
          id: '20',
          ts: '2026-11-11T09:00:02.000Z',
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
          detail: { dist_cm: 12 },
        },
        {
          id: '10',
          ts: '2026-11-11T09:00:01.000Z',
          mode: null,
          source: 'SERVER',
          type: 'DEVICE_ONLINE',
          detail: {},
        },
      ]);
      expect(result.meta).toEqual({
        count: 2,
        from: null,
        to: null,
        type: null,
        nextCursor: null,
      });
    });

    it('returns next cursor when page is full', async () => {
      findMany.mockResolvedValueOnce([
        {
          id: 30n,
          ts: new Date('2026-11-11T09:00:03Z'),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'MODE_CHANGE',
          detail: {},
        },
        {
          id: 20n,
          ts: new Date('2026-11-11T09:00:02Z'),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'MODE_CHANGE',
          detail: {},
        },
      ]);

      const query: EventQueryDto = { limit: 2 };
      const result = await createService().list('car01', query);

      expect(result.meta.nextCursor).toBe('20');
      expect(findMany.mock.calls[0][0].take).toBe(2);
    });

    it('applies type, mode, time range, and cursor filters', async () => {
      findMany.mockResolvedValueOnce([]);
      const query: EventQueryDto = {
        type: 'AVOID_DONE',
        mode: 'AUTO',
        from: '2026-11-11T09:00:00Z',
        to: '2026-11-11T09:01:00Z',
        cursor: '20',
        limit: 10,
      };

      await createService().list('car01', query);

      expect(findMany.mock.calls[0][0].where).toEqual({
        deviceId: 'car01',
        type: 'AVOID_DONE',
        mode: 'AUTO',
        ts: {
          gte: new Date('2026-11-11T09:00:00Z'),
          lte: new Date('2026-11-11T09:01:00Z'),
        },
        id: { lt: 20n },
      });
    });

    it('rejects unknown device', async () => {
      findUnique.mockResolvedValueOnce(null);

      await expect(createService().list('car99', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
