import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { DeviceService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import {
  escapeCsv,
  parseAndValidateRange,
} from './export.constants';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;
  let prisma: {
    telemetry: { findMany: jest.Mock };
    event: { findMany: jest.Mock };
    command: { findMany: jest.Mock };
    testTrial: { findMany: jest.Mock };
  };
  let devices: { ensureDevice: jest.Mock };
  let sessions: { getDetail: jest.Mock; summary: jest.Mock };

  function mockResponse(): Response & {
    written: string[];
    headers: Record<string, string>;
    ended: boolean;
  } {
    const written: string[] = [];
    const headers: Record<string, string> = {};
    let ended = false;

    const res = {
      written,
      headers,
      get ended() {
        return ended;
      },
      setHeader: jest.fn((key: string, val: string) => {
        headers[key] = val;
      }),
      write: jest.fn((chunk: string) => {
        written.push(chunk);
        return true;
      }),
      end: jest.fn(() => {
        ended = true;
      }),
    };

    return res as unknown as Response & {
      written: string[];
      headers: Record<string, string>;
      ended: boolean;
    };
  }

  beforeEach(() => {
    prisma = {
      telemetry: { findMany: jest.fn() },
      event: { findMany: jest.fn() },
      command: { findMany: jest.fn() },
      testTrial: { findMany: jest.fn() },
    };

    devices = {
      ensureDevice: jest.fn().mockResolvedValue(undefined),
    };

    sessions = {
      getDetail: jest.fn(),
      summary: jest.fn(),
    };

    service = new ExportService(
      prisma as unknown as PrismaService,
      devices as unknown as DeviceService,
      sessions as unknown as SessionsService,
    );
  });

  describe('escapeCsv helper', () => {
    it('handles null, undefined, booleans, and dates', () => {
      expect(escapeCsv(null)).toBe('');
      expect(escapeCsv(undefined)).toBe('');
      expect(escapeCsv(true)).toBe('true');
      expect(escapeCsv(false)).toBe('false');

      const d = new Date('2026-11-11T12:00:00.000Z');
      expect(escapeCsv(d)).toBe('2026-11-11T12:00:00.000Z');
    });

    it('escapes strings containing commas, quotes, and newlines', () => {
      expect(escapeCsv('normal')).toBe('normal');
      expect(escapeCsv('hello,world')).toBe('"hello,world"');
      expect(escapeCsv('hello "quoted" world')).toBe('"hello ""quoted"" world"');
      expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
    });

    it('escapes objects and JSON', () => {
      expect(escapeCsv({ reason: 'OBSTACLE', dist: 25 })).toBe(
        '"{""reason"":""OBSTACLE"",""dist"":25}"',
      );
    });
  });

  describe('parseAndValidateRange helper', () => {
    it('defaults to 24 hours if from and to are not provided', () => {
      const { fromDate, toDate } = parseAndValidateRange();
      const diff = toDate.getTime() - fromDate.getTime();
      expect(diff).toBeCloseTo(24 * 60 * 60 * 1000, -3);
    });

    it('validates ISO dates correctly', () => {
      const from = '2026-11-10T00:00:00.000Z';
      const to = '2026-11-11T00:00:00.000Z';
      const { fromDate, toDate } = parseAndValidateRange(from, to);
      expect(fromDate.toISOString()).toBe(from);
      expect(toDate.toISOString()).toBe(to);
    });

    it('rejects invalid date strings with 400 VALIDATION_ERROR', () => {
      expect(() => parseAndValidateRange('invalid-date')).toThrow(
        BadRequestException,
      );
      expect(() => parseAndValidateRange('2026-11-10', 'invalid-date')).toThrow(
        BadRequestException,
      );
    });

    it('rejects if from date is after to date', () => {
      expect(() =>
        parseAndValidateRange(
          '2026-11-12T00:00:00.000Z',
          '2026-11-10T00:00:00.000Z',
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects date range exceeding 7 days', () => {
      const from = '2026-11-01T00:00:00.000Z';
      const to = '2026-11-09T00:00:00.000Z'; // 8 days
      expect(() => parseAndValidateRange(from, to)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('exportTelemetry', () => {
    it('sets response headers and streams telemetry rows', async () => {
      const res = mockResponse();
      prisma.telemetry.findMany
        .mockResolvedValueOnce([
          {
            id: 1n,
            deviceId: 'car01',
            ts: new Date('2026-11-11T10:00:00.000Z'),
            mode: 'AUTO',
            distCm: 25.5,
            valid: true,
            state: 'MAJU',
            pwm: 180,
            avoidCount: 5,
            rssi: -65,
          },
        ])
        .mockResolvedValueOnce([]);

      await service.exportTelemetry('car01', {}, res);

      expect(devices.ensureDevice).toHaveBeenCalledWith('car01');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="telemetry-car01.csv"',
      );
      expect(res.write).toHaveBeenCalledWith(
        'id,deviceId,ts,mode,distCm,valid,state,pwm,avoidCount,rssi\r\n',
      );
      expect(res.written[1]).toBe(
        '1,car01,2026-11-11T10:00:00.000Z,AUTO,25.5,true,MAJU,180,5,-65\r\n',
      );
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('exportEvents', () => {
    it('sets response headers and streams event rows with escaped detail', async () => {
      const res = mockResponse();
      prisma.event.findMany.mockResolvedValueOnce([
        {
          id: 10n,
          deviceId: 'car01',
          ts: new Date('2026-11-11T10:00:00.000Z'),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'STOP',
          detail: { reason: 'OBSTACLE', dist_cm: 20 },
        },
      ]);

      await service.exportEvents('car01', {}, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="events-car01.csv"',
      );
      expect(res.write).toHaveBeenCalledWith(
        'id,deviceId,ts,mode,source,type,detail\r\n',
      );
      expect(res.written[1]).toContain(
        '10,car01,2026-11-11T10:00:00.000Z,AUTO,DEVICE,STOP,"{""reason"":""OBSTACLE"",""dist_cm"":20}"\r\n',
      );
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('exportCommands', () => {
    it('sets response headers and streams command rows with latencyMs', async () => {
      const res = mockResponse();
      const createdAt = new Date('2026-11-11T10:00:00.000Z');
      const ackedAt = new Date('2026-11-11T10:00:00.250Z');

      prisma.command.findMany.mockResolvedValueOnce([
        {
          id: 100n,
          deviceId: 'car01',
          seq: 1,
          cmd: 'START',
          payload: null,
          status: 'acked',
          reason: null,
          exp: new Date('2026-11-11T10:00:30.000Z'),
          createdAt,
          ackedAt,
        },
      ]);

      await service.exportCommands('car01', {}, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="commands-car01.csv"',
      );
      expect(res.written[1]).toBe(
        '100,car01,1,START,,acked,,2026-11-11T10:00:30.000Z,2026-11-11T10:00:00.000Z,2026-11-11T10:00:00.250Z,250\r\n',
      );
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('exportSession', () => {
    it('streams session metadata, trials, and summary for PENGHINDARAN', async () => {
      const res = mockResponse();
      sessions.getDetail.mockResolvedValue({
        id: '1',
        deviceId: 'car01',
        type: 'PENGHINDARAN',
        name: 'Uji Rintangan',
        mode: 'AUTO',
        status: 'ended',
        startedAt: '2026-11-11T10:00:00.000Z',
        endedAt: '2026-11-11T10:30:00.000Z',
        obstacleType: 'balok',
        obstacleSize: '20cm',
        floorSurface: 'keramik',
        laneWidthCm: 60,
        batteryLevel: '8V',
        pwmSetting: 180,
        configSnapshot: {},
        notes: 'catatan',
      });

      prisma.testTrial.findMany.mockResolvedValueOnce([
        {
          id: 501n,
          trialNo: 1,
          ts: new Date('2026-11-11T10:05:00.000Z'),
          result: 'SUCCESS',
          refDistanceCm: null,
          measuredCm: null,
          valid: null,
          pwm: 180,
          stoppingDistanceCm: null,
          stopLatencyMs: null,
          note: null,
        },
      ]);

      sessions.summary.mockResolvedValue({
        type: 'PENGHINDARAN',
        mode: 'AUTO',
        trials: 1,
        success: 1,
        collision: 0,
        successRatePct: 100.0,
        target: { success: 18, trials: 20, label: 'initial target' },
      });

      await service.exportSession('1', res);

      const allWritten = res.written.join('');
      expect(allWritten).toContain('# Session Metadata');
      expect(allWritten).toContain('Uji Rintangan');
      expect(allWritten).toContain('# Trials');
      expect(allWritten).toContain('1,2026-11-11T10:05:00.000Z,SUCCESS,,,,180,,,');
      expect(allWritten).toContain('# Summary');
      expect(allWritten).toContain('type,PENGHINDARAN');
      expect(allWritten).toContain('successRatePct,100');
      expect(res.end).toHaveBeenCalled();
    });

    it('streams summary for SENSOR session', async () => {
      const res = mockResponse();
      sessions.getDetail.mockResolvedValue({
        id: '2',
        deviceId: 'car01',
        type: 'SENSOR',
        name: 'Uji Sensor',
        mode: 'AUTO',
        status: 'ended',
        startedAt: '2026-11-11T10:00:00.000Z',
        endedAt: '2026-11-11T10:30:00.000Z',
        obstacleType: null,
        obstacleSize: null,
        floorSurface: null,
        laneWidthCm: null,
        batteryLevel: null,
        pwmSetting: null,
        configSnapshot: {},
        notes: null,
      });

      prisma.testTrial.findMany.mockResolvedValueOnce([]);

      sessions.summary.mockResolvedValue({
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

      await service.exportSession('2', res);
      const allWritten = res.written.join('');
      expect(allWritten).toContain('refCm,n,validN,invalidN,errorAvgCm,errorMaxCm');
      expect(allWritten).toContain('50,10,9,1,0.8,1.6');
    });
  });
});
