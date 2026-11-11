import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { DeviceService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import type {
  ExportCommandsQueryDto,
  ExportEventsQueryDto,
  ExportTelemetryQueryDto,
} from './dto/export-query.dto';
import {
  escapeCsv,
  EXPORT_BATCH_SIZE,
  parseAndValidateRange,
} from './export.constants';

interface ExportTelemetryRow {
  id: bigint;
  deviceId: string;
  ts: Date;
  mode: string;
  distCm: number | null;
  valid: boolean;
  state: string;
  pwm: number;
  avoidCount: number;
  rssi: number | null;
}

interface ExportEventRow {
  id: bigint;
  deviceId: string;
  ts: Date;
  mode: string | null;
  source: string;
  type: string;
  detail: Prisma.JsonValue;
}

interface ExportCommandRow {
  id: bigint;
  deviceId: string;
  seq: number;
  cmd: string;
  payload: Prisma.JsonValue | null;
  status: string;
  reason: string | null;
  exp: Date;
  createdAt: Date;
  ackedAt: Date | null;
}

interface ExportTrialRow {
  id: bigint;
  trialNo: number;
  ts: Date;
  result: string | null;
  refDistanceCm: number | null;
  measuredCm: number | null;
  valid: boolean | null;
  pwm: number | null;
  stoppingDistanceCm: number | null;
  stopLatencyMs: number | null;
  note: string | null;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
    private readonly sessions: SessionsService,
  ) {}

  async exportTelemetry(
    deviceId: string,
    query: ExportTelemetryQueryDto,
    res: Response,
  ): Promise<void> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate } = parseAndValidateRange(query.from, query.to);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="telemetry-${deviceId}.csv"`,
    );

    res.write('id,deviceId,ts,mode,distCm,valid,state,pwm,avoidCount,rssi\r\n');

    let cursor: bigint | null = null;
    while (true) {
      const rows: ExportTelemetryRow[] = await this.prisma.telemetry.findMany({
        where: {
          deviceId,
          ts: { gte: fromDate, lte: toDate },
          ...(query.mode ? { mode: query.mode } : {}),
          ...(cursor !== null ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
        select: {
          id: true,
          deviceId: true,
          ts: true,
          mode: true,
          distCm: true,
          valid: true,
          state: true,
          pwm: true,
          avoidCount: true,
          rssi: true,
        },
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const line = [
          row.id.toString(),
          escapeCsv(row.deviceId),
          row.ts.toISOString(),
          escapeCsv(row.mode),
          row.distCm !== null ? row.distCm.toString() : '',
          row.valid ? 'true' : 'false',
          escapeCsv(row.state),
          row.pwm.toString(),
          row.avoidCount.toString(),
          row.rssi !== null ? row.rssi.toString() : '',
        ].join(',');

        res.write(line + '\r\n');
      }

      cursor = rows[rows.length - 1].id;
      if (rows.length < EXPORT_BATCH_SIZE) {
        break;
      }
    }

    res.end();
  }

  async exportEvents(
    deviceId: string,
    query: ExportEventsQueryDto,
    res: Response,
  ): Promise<void> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate } = parseAndValidateRange(query.from, query.to);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="events-${deviceId}.csv"`,
    );

    res.write('id,deviceId,ts,mode,source,type,detail\r\n');

    let cursor: bigint | null = null;
    while (true) {
      const rows: ExportEventRow[] = await this.prisma.event.findMany({
        where: {
          deviceId,
          ts: { gte: fromDate, lte: toDate },
          ...(query.type ? { type: query.type } : {}),
          ...(cursor !== null ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
        select: {
          id: true,
          deviceId: true,
          ts: true,
          mode: true,
          source: true,
          type: true,
          detail: true,
        },
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const line = [
          row.id.toString(),
          escapeCsv(row.deviceId),
          row.ts.toISOString(),
          escapeCsv(row.mode),
          escapeCsv(row.source),
          escapeCsv(row.type),
          escapeCsv(row.detail),
        ].join(',');

        res.write(line + '\r\n');
      }

      cursor = rows[rows.length - 1].id;
      if (rows.length < EXPORT_BATCH_SIZE) {
        break;
      }
    }

    res.end();
  }

  async exportCommands(
    deviceId: string,
    query: ExportCommandsQueryDto,
    res: Response,
  ): Promise<void> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate } = parseAndValidateRange(query.from, query.to);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="commands-${deviceId}.csv"`,
    );

    res.write('id,deviceId,seq,cmd,payload,status,reason,exp,createdAt,ackedAt,latencyMs\r\n');

    let cursor: bigint | null = null;
    while (true) {
      const rows: ExportCommandRow[] = await this.prisma.command.findMany({
        where: {
          deviceId,
          createdAt: { gte: fromDate, lte: toDate },
          ...(cursor !== null ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
        select: {
          id: true,
          deviceId: true,
          seq: true,
          cmd: true,
          payload: true,
          status: true,
          reason: true,
          exp: true,
          createdAt: true,
          ackedAt: true,
        },
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const latencyMs =
          row.ackedAt !== null
            ? (row.ackedAt.getTime() - row.createdAt.getTime()).toString()
            : '';

        const line = [
          row.id.toString(),
          escapeCsv(row.deviceId),
          row.seq.toString(),
          escapeCsv(row.cmd),
          escapeCsv(row.payload),
          escapeCsv(row.status),
          escapeCsv(row.reason),
          row.exp.toISOString(),
          row.createdAt.toISOString(),
          row.ackedAt?.toISOString() ?? '',
          latencyMs,
        ].join(',');

        res.write(line + '\r\n');
      }

      cursor = rows[rows.length - 1].id;
      if (rows.length < EXPORT_BATCH_SIZE) {
        break;
      }
    }

    res.end();
  }

  async exportSession(sessionId: string, res: Response): Promise<void> {
    const session = await this.sessions.getDetail(sessionId);
    const summary = await this.sessions.summary(sessionId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="session-${sessionId}.csv"`,
    );

    // Section 1: Session Metadata
    res.write('# Session Metadata\r\n');
    res.write(
      'id,deviceId,type,name,mode,status,startedAt,endedAt,obstacleType,obstacleSize,floorSurface,laneWidthCm,batteryLevel,pwmSetting,notes\r\n',
    );
    res.write(
      [
        escapeCsv(session.id),
        escapeCsv(session.deviceId),
        escapeCsv(session.type),
        escapeCsv(session.name),
        escapeCsv(session.mode),
        escapeCsv(session.status),
        escapeCsv(session.startedAt),
        escapeCsv(session.endedAt),
        escapeCsv(session.obstacleType),
        escapeCsv(session.obstacleSize),
        escapeCsv(session.floorSurface),
        escapeCsv(session.laneWidthCm),
        escapeCsv(session.batteryLevel),
        escapeCsv(session.pwmSetting),
        escapeCsv(session.notes),
      ].join(',') + '\r\n\r\n',
    );

    // Section 2: Trials Table
    res.write('# Trials\r\n');
    res.write(
      'trialNo,ts,result,refDistanceCm,measuredCm,valid,pwm,stoppingDistanceCm,stopLatencyMs,note\r\n',
    );

    if (!/^\d+$/.test(sessionId)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Session ${sessionId} not found`,
      });
    }

    const sId = BigInt(sessionId);
    let cursor: bigint | null = null;
    while (true) {
      const trials: ExportTrialRow[] = await this.prisma.testTrial.findMany({
        where: {
          sessionId: sId,
          ...(cursor !== null ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
        select: {
          id: true,
          trialNo: true,
          ts: true,
          result: true,
          refDistanceCm: true,
          measuredCm: true,
          valid: true,
          pwm: true,
          stoppingDistanceCm: true,
          stopLatencyMs: true,
          note: true,
        },
      });

      if (trials.length === 0) {
        break;
      }

      for (const trial of trials) {
        const line = [
          trial.trialNo.toString(),
          trial.ts.toISOString(),
          escapeCsv(trial.result),
          trial.refDistanceCm !== null ? trial.refDistanceCm.toString() : '',
          trial.measuredCm !== null ? trial.measuredCm.toString() : '',
          trial.valid !== null ? (trial.valid ? 'true' : 'false') : '',
          trial.pwm !== null ? trial.pwm.toString() : '',
          trial.stoppingDistanceCm !== null
            ? trial.stoppingDistanceCm.toString()
            : '',
          trial.stopLatencyMs !== null ? trial.stopLatencyMs.toString() : '',
          escapeCsv(trial.note),
        ].join(',');

        res.write(line + '\r\n');
      }

      cursor = trials[trials.length - 1].id;
      if (trials.length < EXPORT_BATCH_SIZE) {
        break;
      }
    }

    res.write('\r\n# Summary\r\n');

    switch (summary.type) {
      case 'PENGHINDARAN':
        res.write('metric,value\r\n');
        res.write(`type,${escapeCsv(summary.type)}\r\n`);
        res.write(`mode,${escapeCsv(summary.mode)}\r\n`);
        res.write(`trials,${summary.trials}\r\n`);
        res.write(`success,${summary.success}\r\n`);
        res.write(`collision,${summary.collision}\r\n`);
        res.write(`successRatePct,${summary.successRatePct ?? ''}\r\n`);
        res.write(`targetSuccess,${summary.target?.success ?? ''}\r\n`);
        res.write(`targetTrials,${summary.target?.trials ?? ''}\r\n`);
        res.write(`targetLabel,${escapeCsv(summary.target?.label)}\r\n`);
        break;

      case 'SENSOR':
        res.write('refCm,n,validN,invalidN,errorAvgCm,errorMaxCm\r\n');
        for (const point of summary.byPoint) {
          res.write(
            [
              point.refCm,
              point.n,
              point.validN,
              point.invalidN,
              point.errorAvgCm ?? '',
              point.errorMaxCm ?? '',
            ].join(',') + '\r\n',
          );
        }
        break;

      case 'JARAK_BERHENTI':
        res.write('pwm,n,stoppingDistanceAvgCm,stoppingDistanceMaxCm\r\n');
        for (const point of summary.byPwm) {
          res.write(
            [
              point.pwm,
              point.n,
              point.stoppingDistanceCm.avg ?? '',
              point.stoppingDistanceCm.max ?? '',
            ].join(',') + '\r\n',
          );
        }
        break;

      case 'STOP':
        res.write('metric,value\r\n');
        res.write(`latencyAvgMs,${summary.latencyMs.avg ?? ''}\r\n`);
        res.write(`latencyMaxMs,${summary.latencyMs.max ?? ''}\r\n`);
        res.write(`n,${summary.n}\r\n`);
        break;

      case 'DAYA':
      case 'KONEKSI_PUTUS':
        res.write('metric,value\r\n');
        res.write(`type,${escapeCsv(summary.type)}\r\n`);
        res.write(`trials,${summary.trials}\r\n`);
        res.write(`success,${summary.success}\r\n`);
        res.write(`fail,${summary.fail}\r\n`);
        res.write(`bootEvents,${summary.bootEvents}\r\n`);
        res.write(`outages,${summary.outages}\r\n`);
        break;
    }

    res.end();
  }
}
