import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    $queryRaw: jest.Mock;
    event: { findMany: jest.Mock };
    testSession: { findUnique: jest.Mock };
  };
  let devices: { ensureDevice: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      event: { findMany: jest.fn() },
      testSession: { findUnique: jest.fn() },
    };

    devices = {
      ensureDevice: jest.fn().mockResolvedValue(undefined),
    };

    config = {
      get: jest.fn((key: string) => {
        if (key === 'ANALYTICS_STOP_MARGIN_CM') return 10;
        return 0;
      }),
    };

    service = new AnalyticsService(
      prisma as unknown as PrismaService,
      devices as unknown as DeviceService,
      config as unknown as ConfigService<Record<string, unknown>, true>,
    );
  });

  describe('Date range & sessionId resolution', () => {
    it('throws BadRequestException if from > to', async () => {
      await expect(
        service.getSensor('car01', {
          from: '2026-11-10T12:00:00.000Z',
          to: '2026-11-09T12:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves range from sessionId', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        id: 1n,
        deviceId: 'car01',
        startedAt: new Date('2026-11-01T10:00:00.000Z'),
        endedAt: new Date('2026-11-01T10:30:00.000Z'),
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          total: 100,
          valid: 95,
          invalidCount: 5,
          avgDist: 25.4,
          minDist: 5.0,
          maxDist: 100.0,
        },
      ]);

      const result = await service.getSensor('car01', { sessionId: '1' });

      expect(prisma.testSession.findUnique).toHaveBeenCalledWith({
        where: { id: 1n },
      });
      expect(result.meta.from).toBe('2026-11-01T10:00:00.000Z');
      expect(result.meta.to).toBe('2026-11-01T10:30:00.000Z');
      expect(result.meta.sessionId).toBe('1');
    });

    it('throws NotFoundException if session does not exist or deviceId mismatches', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        id: 2n,
        deviceId: 'car02', // different device
        startedAt: new Date(),
        endedAt: null,
      });

      await expect(
        service.getSensor('car01', { sessionId: '2' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSensor', () => {
    it('returns aggregated sensor metrics', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          total: 1200,
          valid: 1150,
          invalidCount: 50,
          avgDist: 42.34,
          minDist: 5.1,
          maxDist: 212.0,
        },
      ]);

      const result = await service.getSensor('car01', {});

      expect(result.data).toEqual({
        total: 1200,
        valid: 1150,
        invalidCount: 50,
        invalidPct: 4.17,
        distCm: {
          avg: 42.3,
          min: 5.1,
          max: 212.0,
        },
      });
    });
  });

  describe('getStateDistribution', () => {
    it('calculates duration per state and excludes offline period', async () => {
      const from = new Date('2026-11-11T10:00:00.000Z');
      const to = new Date('2026-11-11T11:00:00.000Z'); // 3600 seconds

      prisma.$queryRaw.mockResolvedValue([
        { ts: new Date('2026-11-11T10:10:00.000Z'), type: 'MAJU', mode: 'AUTO' },
        { ts: new Date('2026-11-11T10:30:00.000Z'), type: 'DEVICE_OFFLINE', mode: null },
        { ts: new Date('2026-11-11T10:35:00.000Z'), type: 'DEVICE_ONLINE', mode: null },
        { ts: new Date('2026-11-11T10:45:00.000Z'), type: 'STOP', mode: 'AUTO' },
      ]);

      const result = await service.getStateDistribution('car01', {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(result.data.windowSeconds).toBe(3600);
      expect(result.data.excludedOfflineSeconds).toBe(300); // 5 mins offline
      expect(result.data.observedSeconds).toBe(3300);
      expect((result.data.byState as Array<unknown>).length).toBe(4);
    });
  });

  describe('getAvoidance', () => {
    it('throws BadRequestException if mode is MANUAL', async () => {
      await expect(
        service.getAvoidance('car01', { mode: 'MANUAL' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calculates cycle durations, permanentStops, and trigger distances', async () => {
      prisma.event.findMany.mockResolvedValue([
        {
          ts: new Date('2026-11-11T10:00:00.000Z'),
          type: 'STOP',
          detail: { reason: 'OBSTACLE', dist_cm: 24.5 },
        },
        {
          ts: new Date('2026-11-11T10:00:04.200Z'),
          type: 'AVOID_DONE',
          detail: {},
        },
        {
          ts: new Date('2026-11-11T10:01:00.000Z'),
          type: 'STOP',
          detail: { reason: 'NO_PATH' },
        },
      ]);

      const result = await service.getAvoidance('car01', {});

      expect(result.data.cycles).toBe(1);
      expect(result.data.permanentStops).toBe(1);
      expect(result.data.cycleDurationSec).toEqual({
        avg: 4.2,
        min: 4.2,
        max: 4.2,
      });
      expect(result.data.stopTriggerDistCm).toEqual({
        avg: 24.5,
        min: 24.5,
        max: 24.5,
      });
    });
  });

  describe('getCommands', () => {
    it('aggregates status, cmd counts, and latency percentiles', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            acked: 40,
            rejected: 3,
            expired: 2,
            startCmd: 20,
            stopCmd: 18,
            setModeCmd: 7,
            avgLat: 180.2,
            p95Lat: 420.0,
            maxLat: 610.0,
          },
        ])
        .mockResolvedValueOnce([
          { reason: 'WRONG_MODE', count: 2 },
          { reason: 'EXPIRED', count: 1 },
        ]);

      const result = await service.getCommands('car01', {});

      expect(result.data.byStatus).toEqual({
        acked: 40,
        rejected: 3,
        expired: 2,
      });
      expect(result.data.byCmd).toEqual({
        START: 20,
        STOP: 18,
        SET_MODE: 7,
      });
      expect(result.data.latencyMs).toEqual({
        avg: 180,
        p95: 420,
        max: 610,
      });
      expect(result.data.rejectReasons).toEqual({
        WRONG_MODE: 2,
        EXPIRED: 1,
      });
    });
  });

  describe('getConnectivity', () => {
    it('calculates uptimePct and outages list', async () => {
      const from = new Date('2026-11-11T10:00:00.000Z');
      const to = new Date('2026-11-11T11:00:00.000Z');

      prisma.event.findMany.mockResolvedValue([
        {
          ts: new Date('2026-11-11T10:10:00.000Z'),
          type: 'DEVICE_OFFLINE',
          detail: { source: 'TIMEOUT', rssi: -78 },
        },
        {
          ts: new Date('2026-11-11T10:10:42.000Z'),
          type: 'DEVICE_ONLINE',
          detail: {},
        },
      ]);

      prisma.$queryRaw.mockResolvedValue([
        { avgRssi: -62.3, minRssi: -80, maxRssi: -48 },
      ]);

      const result = await service.getConnectivity('car01', {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(result.data.disconnectCount).toBe(1);
      expect((result.data.outages as Array<{ durationSec: number }>)[0].durationSec).toBe(42);
      expect(result.data.rssi).toEqual({
        avg: -62,
        min: -80,
        max: -48,
      });
    });
  });

  describe('getStopDistance', () => {
    it('returns data null when no stopping distance test data exists', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getStopDistance('car01', {});
      expect(result.data).toBeNull();
    });

    it('calculates worst stopping distance and recommended stop cm', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { pwm: 150, trials: 5, avgDist: 14.2, maxDist: 17.0 },
        { pwm: 180, trials: 5, avgDist: 18.1, maxDist: 19.5 },
      ]);

      const result = await service.getStopDistance('car01', { marginCm: 10 });

      expect(result.data?.worstStoppingDistanceCm).toBe(19.5);
      expect(result.data?.marginCm).toBe(10);
      expect(result.data?.recommendedStopCm).toBe(30); // ceil(19.5 + 10) = 30
      expect((result.data?.byPwm as Array<unknown>).length).toBe(2);
    });
  });

  describe('getConfigComparison', () => {
    it('groups ended sessions by config snapshot', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          stopCm: 25,
          resumeCm: 30,
          maxPwm: 200,
          sessions: 2,
          trials: 40,
          success: 37,
        },
      ]);

      const result = await service.getConfigComparison('car01', {});

      expect(result.data[0]).toEqual({
        stopCm: 25,
        resumeCm: 30,
        maxPwm: 200,
        sessions: 2,
        trials: 40,
        success: 37,
        successRatePct: 92.5,
      });
    });
  });

  describe('getOverview', () => {
    it('summarizes samples and events per mode', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { mode: 'AUTO', count: 900 },
          { mode: 'MANUAL', count: 300 },
        ])
        .mockResolvedValueOnce([
          { mode: 'AUTO', type: 'STOP', count: 30 },
          { mode: 'AUTO', type: 'AVOID_DONE', count: 18 },
          { mode: 'MANUAL', type: 'MANUAL_BLOCKED', count: 4 },
        ]);

      const result = await service.getOverview('car01', {});

      const autoData = result.data.AUTO as {
        samples: number;
        events: Record<string, number>;
      };
      expect(autoData.samples).toBe(900);
      expect(autoData.events).toEqual({
        STOP: 30,
        AVOID_DONE: 18,
      });
      const manualData = result.data.MANUAL as {
        samples: number;
        events: Record<string, number>;
      };
      expect(manualData.samples).toBe(300);
      expect(manualData.events).toEqual({
        MANUAL_BLOCKED: 4,
      });
    });
  });
});
