import { PrismaService } from '../prisma/prisma.service';
import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  let service: RetentionService;
  let prisma: {
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn(),
    };

    service = new RetentionService(prisma as unknown as PrismaService);
  });

  describe('runRetention', () => {
    it('executes deletion queries for telemetry, events, and commands with default cutoffs', async () => {
      // Return 0 deleted for all to terminate the batch loops immediately
      prisma.$executeRaw.mockResolvedValue(0);

      const report = await service.runRetention();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
      expect(report).toEqual({
        telemetryDeleted: 0,
        eventsDeleted: 0,
        commandsDeleted: 0,
      });
    });

    it('loops in batches when deleted count equals batch size', async () => {
      // Telemetry: 10000 on first call, then 500 on second call -> total 10500
      // Events: 50 on first call
      // Commands: 20 on first call
      prisma.$executeRaw
        .mockResolvedValueOnce(10000)
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(20);

      const report = await service.runRetention();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(4);
      expect(report).toEqual({
        telemetryDeleted: 10500,
        eventsDeleted: 50,
        commandsDeleted: 20,
      });
    });

    it('respects custom cutoffs and custom batch size', async () => {
      prisma.$executeRaw.mockResolvedValue(5);

      const customCutoff = new Date('2026-11-01T00:00:00.000Z');
      const report = await service.runRetention({
        telemetryCutoff: customCutoff,
        eventsCutoff: customCutoff,
        commandsCutoff: customCutoff,
        batchSize: 100,
      });

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
      expect(report).toEqual({
        telemetryDeleted: 5,
        eventsDeleted: 5,
        commandsDeleted: 5,
      });
    });
  });

  describe('handleCron', () => {
    it('triggers runRetention and logs output', async () => {
      prisma.$executeRaw.mockResolvedValue(0);
      const spy = jest.spyOn(service, 'runRetention');

      await service.handleCron();

      expect(spy).toHaveBeenCalled();
    });
  });
});
