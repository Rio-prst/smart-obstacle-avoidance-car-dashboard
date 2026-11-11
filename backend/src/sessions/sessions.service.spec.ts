import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeviceConfigService } from '../device-config/device-config.service';
import { DeviceService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: {
    testSession: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    testTrial: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      groupBy: jest.Mock;
    };
    device: {
      findUnique: jest.Mock;
    };
    telemetry: {
      findFirst: jest.Mock;
    };
    event: {
      count: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };
  let devices: {
    ensureDevice: jest.Mock;
  };
  let deviceConfig: {
    getSnapshot: jest.Mock;
  };

  const sampleSessionRow = {
    id: 1n,
    deviceId: 'car01',
    type: 'PENGHINDARAN',
    name: 'Sesi Uji Hindar',
    mode: 'AUTO',
    status: 'running',
    startedAt: new Date('2026-11-11T10:00:00.000Z'),
    endedAt: null,
    obstacleType: 'balok',
    obstacleSize: '20x20',
    floorSurface: 'keramik',
    laneWidthCm: 60,
    batteryLevel: '8.0V',
    pwmSetting: 180,
    configSnapshot: { stopCm: 25, resumeCm: 30, maxPwm: 200, manualMaxPwm: 150 },
    notes: 'tes',
  };

  beforeEach(() => {
    prisma = {
      testSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      testTrial: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn(),
      },
      device: {
        findUnique: jest.fn(),
      },
      telemetry: {
        findFirst: jest.fn(),
      },
      event: {
        count: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    devices = {
      ensureDevice: jest.fn().mockResolvedValue(undefined),
    };

    deviceConfig = {
      getSnapshot: jest.fn().mockResolvedValue({
        ver: 1,
        stopCm: 25,
        resumeCm: 30,
        maxPwm: 200,
        manualMaxPwm: 150,
      }),
    };

    service = new SessionsService(
      prisma as unknown as PrismaService,
      devices as unknown as DeviceService,
      deviceConfig as unknown as DeviceConfigService,
    );
  });

  describe('create', () => {
    it('creates a session with snapshot config and device mode', async () => {
      prisma.testSession.findFirst.mockResolvedValue(null);
      prisma.device.findUnique.mockResolvedValue({ mode: 'AUTO' });
      prisma.testSession.create.mockResolvedValue(sampleSessionRow);

      const result = await service.create('car01', 'user-uuid-1', {
        type: 'PENGHINDARAN',
        name: 'Sesi Uji Hindar',
        obstacleType: 'balok',
      });

      expect(devices.ensureDevice).toHaveBeenCalledWith('car01');
      expect(prisma.testSession.findFirst).toHaveBeenCalledWith({
        where: { deviceId: 'car01', status: 'running' },
        select: { id: true },
      });
      expect(deviceConfig.getSnapshot).toHaveBeenCalledWith('car01');
      expect(prisma.testSession.create).toHaveBeenCalled();
      expect(result.id).toBe('1');
      expect(result.status).toBe('running');
    });

    it('throws ConflictException if running session already exists', async () => {
      prisma.testSession.findFirst.mockResolvedValue({ id: 10n });

      await expect(
        service.create('car01', 'user-uuid-1', {
          type: 'PENGHINDARAN',
          name: 'Sesi 2',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('handles Prisma P2002 unique constraint conflict gracefully', async () => {
      prisma.testSession.findFirst.mockResolvedValue(null);
      prisma.device.findUnique.mockResolvedValue({ mode: 'AUTO' });
      prisma.testSession.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );

      await expect(
        service.create('car01', 'user-uuid-1', {
          type: 'PENGHINDARAN',
          name: 'Sesi Race',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    it('returns filtered session items with cursor pagination', async () => {
      prisma.testSession.findMany.mockResolvedValue([sampleSessionRow]);

      const result = await service.list('car01', { limit: 10, type: 'PENGHINDARAN' });

      expect(prisma.testSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deviceId: 'car01', type: 'PENGHINDARAN' },
          take: 10,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('1');
    });
  });

  describe('getDetail', () => {
    it('returns session detail for valid id', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow);

      const result = await service.getDetail('1');

      expect(result.id).toBe('1');
      expect(result.type).toBe('PENGHINDARAN');
    });

    it('throws NotFoundException for non-numeric or missing id', async () => {
      await expect(service.getDetail('abc')).rejects.toThrow(NotFoundException);

      prisma.testSession.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('sets status to ended and fills endedAt when ending session', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow);
      prisma.testSession.update.mockResolvedValue({
        ...sampleSessionRow,
        status: 'ended',
        endedAt: new Date('2026-11-11T10:30:00.000Z'),
      });

      const result = await service.update('1', { status: 'ended' });

      expect(prisma.testSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1n },
          data: expect.objectContaining({ status: 'ended', endedAt: expect.any(Date) }),
        }),
      );
      expect(result.status).toBe('ended');
      expect(result.endedAt).not.toBeNull();
    });

    it('returns existing item if update body is empty', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow);

      const result = await service.update('1', {});

      expect(prisma.testSession.update).not.toHaveBeenCalled();
      expect(result.id).toBe('1');
    });
  });

  describe('createTrial', () => {
    it('throws ConflictException SESSION_ENDED if session is already ended', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        status: 'ended',
      });

      await expect(
        service.createTrial('1', { result: 'SUCCESS' }),
      ).rejects.toThrow(ConflictException);
    });

    it('validates required fields per session type', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow); // PENGHINDARAN

      // Invalid result for PENGHINDARAN
      await expect(
        service.createTrial('1', { result: 'FAIL' }),
      ).rejects.toThrow(BadRequestException);

      // SENSOR missing refDistanceCm or captureSensor
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'SENSOR',
      });
      await expect(
        service.createTrial('1', { refDistanceCm: 50, captureSensor: false }),
      ).rejects.toThrow(BadRequestException);

      // JARAK_BERHENTI missing stoppingDistanceCm
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'JARAK_BERHENTI',
      });
      await expect(service.createTrial('1', { pwm: 150 })).rejects.toThrow(
        BadRequestException,
      );

      // STOP missing stopLatencyMs
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'STOP',
      });
      await expect(service.createTrial('1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('captures sensor reading from latest telemetry (< 3s)', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'SENSOR',
      });
      prisma.telemetry.findFirst.mockResolvedValue({
        ts: new Date(),
        distCm: 49.2,
        valid: true,
      });
      prisma.testTrial.findFirst.mockResolvedValue(null);
      prisma.testTrial.create.mockResolvedValue({
        id: 101n,
        sessionId: 1n,
        trialNo: 1,
        ts: new Date(),
        result: null,
        refDistanceCm: 50,
        measuredCm: 49.2,
        valid: true,
        pwm: null,
        stoppingDistanceCm: null,
        stopLatencyMs: null,
        note: null,
      });

      const result = await service.createTrial('1', {
        refDistanceCm: 50,
        captureSensor: true,
      });

      expect(result.trialNo).toBe(1);
      expect(result.measuredCm).toBe(49.2);
      expect(result.valid).toBe(true);
    });

    it('throws ConflictException if telemetry is missing or older than 3 seconds', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'SENSOR',
      });
      prisma.telemetry.findFirst.mockResolvedValue({
        ts: new Date(Date.now() - 5000), // 5 seconds old
        distCm: 49.2,
        valid: true,
      });

      await expect(
        service.createTrial('1', { refDistanceCm: 50, captureSensor: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('auto-increments trialNo based on previous trial', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow);
      prisma.testTrial.findFirst.mockResolvedValue({ trialNo: 5 });
      prisma.testTrial.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 102n,
          sessionId: 1n,
          trialNo: data.trialNo,
          ts: new Date(),
          result: data.result,
          refDistanceCm: null,
          measuredCm: null,
          valid: null,
          pwm: null,
          stoppingDistanceCm: null,
          stopLatencyMs: null,
          note: null,
        }),
      );

      const result = await service.createTrial('1', { result: 'SUCCESS' });
      expect(result.trialNo).toBe(6);
    });
  });

  describe('listTrials & deleteTrial', () => {
    it('lists trials ordered by trialNo asc', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow);
      prisma.testTrial.findMany.mockResolvedValue([
        {
          id: 101n,
          sessionId: 1n,
          trialNo: 1,
          ts: new Date(),
          result: 'SUCCESS',
          refDistanceCm: null,
          measuredCm: null,
          valid: null,
          pwm: null,
          stoppingDistanceCm: null,
          stopLatencyMs: null,
          note: null,
        },
      ]);

      const result = await service.listTrials('1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('101');
    });

    it('deletes trial when it belongs to session', async () => {
      prisma.testTrial.findUnique.mockResolvedValue({ sessionId: 1n });
      prisma.testTrial.delete.mockResolvedValue({ id: 101n });

      await service.deleteTrial('1', '101');
      expect(prisma.testTrial.delete).toHaveBeenCalledWith({ where: { id: 101n } });
    });

    it('throws NotFoundException if trial belongs to another session or does not exist', async () => {
      prisma.testTrial.findUnique.mockResolvedValue({ sessionId: 2n });
      await expect(service.deleteTrial('1', '101')).rejects.toThrow(NotFoundException);

      prisma.testTrial.findUnique.mockResolvedValue(null);
      await expect(service.deleteTrial('1', '999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('summary', () => {
    it('computes PENGHINDARAN summary with successRatePct and target', async () => {
      prisma.testSession.findUnique.mockResolvedValue(sampleSessionRow);
      prisma.testTrial.groupBy.mockResolvedValue([
        { result: 'SUCCESS', _count: { _all: 18 } },
        { result: 'COLLISION', _count: { _all: 2 } },
      ]);

      const summary = await service.summary('1');

      expect(summary).toEqual({
        type: 'PENGHINDARAN',
        mode: 'AUTO',
        trials: 20,
        success: 18,
        collision: 2,
        successRatePct: 90.0,
        target: { success: 18, trials: 20, label: 'initial target' },
      });
    });

    it('computes SENSOR summary using raw SQL query', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'SENSOR',
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          refCm: 50,
          n: 10n,
          validN: 9n,
          invalidN: 1n,
          errorAvgCm: 0.8,
          errorMaxCm: 1.6,
        },
      ]);

      const summary = await service.summary('1');

      expect(summary).toEqual({
        type: 'SENSOR',
        byPoint: [
          {
            refCm: 50,
            n: 10,
            validN: 9,
            invalidN: 1,
            errorAvgCm: 0.8,
            errorMaxCm: 1.6,
          },
        ],
      });
    });

    it('computes JARAK_BERHENTI summary using raw SQL query', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'JARAK_BERHENTI',
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          pwm: 150,
          n: 5n,
          avg: 14.2,
          max: 17.0,
        },
      ]);

      const summary = await service.summary('1');

      expect(summary).toEqual({
        type: 'JARAK_BERHENTI',
        byPwm: [
          {
            pwm: 150,
            n: 5,
            stoppingDistanceCm: { avg: 14.2, max: 17.0 },
          },
        ],
      });
    });

    it('computes STOP summary using raw SQL query', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'STOP',
      });
      prisma.$queryRaw.mockResolvedValue([
        {
          n: 5n,
          avg: 310,
          max: 420,
        },
      ]);

      const summary = await service.summary('1');

      expect(summary).toEqual({
        type: 'STOP',
        latencyMs: { avg: 310, max: 420 },
        n: 5,
      });
    });

    it('computes DAYA & KONEKSI_PUTUS summary including BOOT and outages events', async () => {
      prisma.testSession.findUnique.mockResolvedValue({
        ...sampleSessionRow,
        type: 'DAYA',
        endedAt: new Date('2026-11-11T11:00:00.000Z'),
      });
      prisma.testTrial.groupBy.mockResolvedValue([
        { result: 'SUCCESS', _count: { _all: 9 } },
        { result: 'FAIL', _count: { _all: 1 } },
      ]);
      prisma.event.count
        .mockResolvedValueOnce(2) // bootEvents
        .mockResolvedValueOnce(1); // outages

      const summary = await service.summary('1');

      expect(summary).toEqual({
        type: 'DAYA',
        trials: 10,
        success: 9,
        fail: 1,
        bootEvents: 2,
        outages: 1,
        outageCount: 1,
      });
    });
  });
});
