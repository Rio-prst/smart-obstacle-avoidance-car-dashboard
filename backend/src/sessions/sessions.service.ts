import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeviceConfigService } from '../device-config/device-config.service';
import { DeviceService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSessionDto, SessionType } from './dto/create-session.dto';
import type { CreateTrialDto } from './dto/create-trial.dto';
import type { SessionQueryDto } from './dto/session-query.dto';
import type { UpdateSessionDto } from './dto/update-session.dto';

export interface SessionItem {
  id: string;
  deviceId: string;
  type: SessionType;
  name: string;
  mode: string;
  status: 'running' | 'ended';
  startedAt: string;
  endedAt: string | null;
  obstacleType: string | null;
  obstacleSize: string | null;
  floorSurface: string | null;
  laneWidthCm: number | null;
  batteryLevel: string | null;
  pwmSetting: number | null;
  configSnapshot: Record<string, unknown>;
  notes: string | null;
}

export interface SessionListResult {
  data: SessionItem[];
  meta: {
    count: number;
    nextCursor: string | null;
  };
}

export interface TrialItem {
  id: string;
  sessionId: string;
  trialNo: number;
  ts: string;
  result: string | null;
  refDistanceCm: number | null;
  measuredCm: number | null;
  valid: boolean | null;
  pwm: number | null;
  stoppingDistanceCm: number | null;
  stopLatencyMs: number | null;
  note: string | null;
}

export interface SensorSummaryPoint {
  refCm: number;
  n: number;
  validN: number;
  invalidN: number;
  errorAvgCm: number | null;
  errorMaxCm: number | null;
}

export interface StopDistanceSummaryPoint {
  pwm: number;
  n: number;
  stoppingDistanceCm: { avg: number | null; max: number | null };
}

export type SessionSummary =
  | {
      type: 'PENGHINDARAN';
      mode: string;
      trials: number;
      success: number;
      collision: number;
      successRatePct: number | null;
      target: { success: number; trials: number; label: string };
    }
  | { type: 'SENSOR'; byPoint: SensorSummaryPoint[] }
  | { type: 'JARAK_BERHENTI'; byPwm: StopDistanceSummaryPoint[] }
  | { type: 'STOP'; latencyMs: { avg: number | null; max: number | null }; n: number }
  | {
      type: 'DAYA' | 'KONEKSI_PUTUS';
      trials: number;
      success: number;
      fail: number;
      bootEvents: number;
      outages: number;
      outageCount: number;
    };

interface SessionRow {
  id: bigint;
  deviceId: string;
  type: string;
  name: string;
  mode: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  obstacleType: string | null;
  obstacleSize: string | null;
  floorSurface: string | null;
  laneWidthCm: number | null;
  batteryLevel: string | null;
  pwmSetting: number | null;
  configSnapshot: Prisma.JsonValue;
  notes: string | null;
}

interface TrialRow {
  id: bigint;
  sessionId: bigint;
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

const DEFAULT_LIMIT = 20;
const SENSOR_MAX_AGE_MS = 3000;

const sessionSelect = {
  id: true,
  deviceId: true,
  type: true,
  name: true,
  mode: true,
  status: true,
  startedAt: true,
  endedAt: true,
  obstacleType: true,
  obstacleSize: true,
  floorSurface: true,
  laneWidthCm: true,
  batteryLevel: true,
  pwmSetting: true,
  configSnapshot: true,
  notes: true,
} as const;

const trialSelect = {
  id: true,
  sessionId: true,
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
} as const;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
    private readonly deviceConfig: DeviceConfigService,
  ) {}

  async create(deviceId: string, userId: string, body: CreateSessionDto): Promise<SessionItem> {
    await this.devices.ensureDevice(deviceId);

    const running = await this.prisma.testSession.findFirst({
      where: { deviceId, status: 'running' },
      select: { id: true },
    });

    if (running !== null) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `Device ${deviceId} already has a running session`,
      });
    }

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { mode: true },
    });

    const snapshot = await this.deviceConfig.getSnapshot(deviceId);

    try {
      const row = await this.prisma.testSession.create({
        data: {
          deviceId,
          createdBy: userId,
          type: body.type,
          name: body.name,
          mode: device?.mode ?? 'AUTO',
          obstacleType: body.obstacleType,
          obstacleSize: body.obstacleSize,
          floorSurface: body.floorSurface,
          laneWidthCm: body.laneWidthCm,
          batteryLevel: body.batteryLevel,
          pwmSetting: body.pwmSetting,
          configSnapshot: snapshot as Prisma.InputJsonValue,
          notes: body.notes,
        },
        select: sessionSelect,
      });

      return this.toItem(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'CONFLICT',
          message: `Device ${deviceId} already has a running session`,
        });
      }

      throw error;
    }
  }

  async list(deviceId: string, query: SessionQueryDto): Promise<SessionListResult> {
    await this.devices.ensureDevice(deviceId);

    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = query.cursor ? BigInt(query.cursor) : null;

    const rows = await this.prisma.testSession.findMany({
      where: {
        deviceId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(cursor !== null ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: limit,
      select: sessionSelect,
    });

    return {
      data: rows.map((row) => this.toItem(row)),
      meta: {
        count: rows.length,
        nextCursor: rows.length === limit ? rows[rows.length - 1].id.toString() : null,
      },
    };
  }

  async getDetail(sessionId: string): Promise<SessionItem> {
    const id = this.parseId(sessionId, 'Session');
    return this.toItem(await this.getSessionRow(id));
  }

  async update(sessionId: string, body: UpdateSessionDto): Promise<SessionItem> {
    const id = this.parseId(sessionId, 'Session');
    const existing = await this.getSessionRow(id);

    const data: Prisma.TestSessionUpdateInput = {
      ...(body.status === 'ended' && existing.status !== 'ended'
        ? { status: 'ended', endedAt: new Date() }
        : {}),
      ...(body.obstacleType !== undefined ? { obstacleType: body.obstacleType } : {}),
      ...(body.obstacleSize !== undefined ? { obstacleSize: body.obstacleSize } : {}),
      ...(body.floorSurface !== undefined ? { floorSurface: body.floorSurface } : {}),
      ...(body.laneWidthCm !== undefined ? { laneWidthCm: body.laneWidthCm } : {}),
      ...(body.batteryLevel !== undefined ? { batteryLevel: body.batteryLevel } : {}),
      ...(body.pwmSetting !== undefined ? { pwmSetting: body.pwmSetting } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };

    if (Object.keys(data).length === 0) {
      return this.toItem(existing);
    }

    const row = await this.prisma.testSession.update({
      where: { id },
      data,
      select: sessionSelect,
    });

    return this.toItem(row);
  }

  async createTrial(sessionId: string, body: CreateTrialDto): Promise<TrialItem> {
    const id = this.parseId(sessionId, 'Session');
    const session = await this.getSessionRow(id);

    if (session.status !== 'running') {
      throw new ConflictException({
        code: 'SESSION_ENDED',
        message: 'Session is already ended',
      });
    }

    this.validateTrialBody(session.type as SessionType, body);

    let measuredCm: number | null = null;
    let valid: boolean | null = null;

    if (session.type === 'SENSOR' && body.captureSensor === true) {
      const latest = await this.prisma.telemetry.findFirst({
        where: { deviceId: session.deviceId },
        orderBy: [{ ts: 'desc' }, { id: 'desc' }],
        select: { ts: true, distCm: true, valid: true },
      });

      if (latest === null || Date.now() - latest.ts.getTime() > SENSOR_MAX_AGE_MS) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Latest telemetry is missing or older than 3 seconds',
        });
      }

      measuredCm = latest.distCm;
      valid = latest.valid;
    }

    const last = await this.prisma.testTrial.findFirst({
      where: { sessionId: id },
      orderBy: { trialNo: 'desc' },
      select: { trialNo: true },
    });

    const row = await this.prisma.testTrial.create({
      data: {
        sessionId: id,
        trialNo: (last?.trialNo ?? 0) + 1,
        result: body.result ?? null,
        refDistanceCm: body.refDistanceCm ?? null,
        measuredCm,
        valid,
        pwm: body.pwm ?? null,
        stoppingDistanceCm: body.stoppingDistanceCm ?? null,
        stopLatencyMs: body.stopLatencyMs ?? null,
        note: body.note ?? null,
      },
      select: trialSelect,
    });

    return this.toTrialItem(row);
  }

  async listTrials(sessionId: string): Promise<TrialItem[]> {
    const id = this.parseId(sessionId, 'Session');
    await this.getSessionRow(id);

    const rows = await this.prisma.testTrial.findMany({
      where: { sessionId: id },
      orderBy: [{ trialNo: 'asc' }],
      select: trialSelect,
    });

    return rows.map((row) => this.toTrialItem(row));
  }

  async deleteTrial(sessionId: string, trialId: string): Promise<void> {
    const sid = this.parseId(sessionId, 'Session');
    const tid = this.parseId(trialId, 'Trial');

    const row = await this.prisma.testTrial.findUnique({
      where: { id: tid },
      select: { sessionId: true },
    });

    if (row === null || row.sessionId !== sid) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Trial ${trialId} not found in session ${sessionId}`,
      });
    }

    await this.prisma.testTrial.delete({ where: { id: tid } });
  }

  async summary(sessionId: string): Promise<SessionSummary> {
    const id = this.parseId(sessionId, 'Session');
    const session = await this.getSessionRow(id);

    switch (session.type) {
      case 'PENGHINDARAN':
        return this.avoidanceSummary(session);
      case 'SENSOR':
        return this.sensorSummary(id);
      case 'JARAK_BERHENTI':
        return this.stopDistanceSummary(id);
      case 'STOP':
        return this.stopLatencySummary(id);
      default:
        return this.powerSummary(session);
    }
  }

  private async avoidanceSummary(session: SessionRow): Promise<Extract<SessionSummary, { type: 'PENGHINDARAN' }>> {
    const groups = await this.prisma.testTrial.groupBy({
      by: ['result'],
      where: { sessionId: session.id, result: { not: null } },
      _count: { _all: true },
    });

    const count = (result: string): number =>
      groups.find((group) => group.result === result)?._count._all ?? 0;

    const success = count('SUCCESS');
    const collision = count('COLLISION');
    const trials = groups.reduce((total, group) => total + group._count._all, 0);

    return {
      type: 'PENGHINDARAN',
      mode: session.mode,
      trials,
      success,
      collision,
      successRatePct: trials > 0 ? Math.round((success / trials) * 1000) / 10 : null,
      target: { success: 18, trials: 20, label: 'initial target' },
    };
  }

  private async sensorSummary(sessionId: bigint): Promise<Extract<SessionSummary, { type: 'SENSOR' }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        refCm: number;
        n: bigint;
        validN: bigint;
        invalidN: bigint;
        errorAvgCm: number | null;
        errorMaxCm: number | null;
      }>
    >`
      SELECT ref_distance_cm AS "refCm",
             count(*) AS n,
             count(*) FILTER (WHERE valid) AS "validN",
             count(*) FILTER (WHERE valid = false) AS "invalidN",
             (avg(abs(measured_cm - ref_distance_cm)) FILTER (WHERE valid))::float8 AS "errorAvgCm",
             (max(abs(measured_cm - ref_distance_cm)) FILTER (WHERE valid))::float8 AS "errorMaxCm"
      FROM test_trials
      WHERE session_id = ${sessionId} AND ref_distance_cm IS NOT NULL
      GROUP BY ref_distance_cm
      ORDER BY ref_distance_cm
    `;

    return {
      type: 'SENSOR',
      byPoint: rows.map((row) => ({
        refCm: row.refCm,
        n: Number(row.n),
        validN: Number(row.validN),
        invalidN: Number(row.invalidN),
        errorAvgCm: row.errorAvgCm,
        errorMaxCm: row.errorMaxCm,
      })),
    };
  }

  private async stopDistanceSummary(
    sessionId: bigint,
  ): Promise<Extract<SessionSummary, { type: 'JARAK_BERHENTI' }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ pwm: number; n: bigint; avg: number | null; max: number | null }>
    >`
      SELECT pwm,
             count(*) AS n,
             avg(stopping_distance_cm)::float8 AS avg,
             max(stopping_distance_cm)::float8 AS max
      FROM test_trials
      WHERE session_id = ${sessionId} AND stopping_distance_cm IS NOT NULL
      GROUP BY pwm
      ORDER BY pwm
    `;

    return {
      type: 'JARAK_BERHENTI',
      byPwm: rows.map((row) => ({
        pwm: row.pwm,
        n: Number(row.n),
        stoppingDistanceCm: { avg: row.avg, max: row.max },
      })),
    };
  }

  private async stopLatencySummary(
    sessionId: bigint,
  ): Promise<Extract<SessionSummary, { type: 'STOP' }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ n: bigint; avg: number | null; max: number | null }>
    >`
      SELECT count(*) AS n,
             avg(stop_latency_ms)::float8 AS avg,
             max(stop_latency_ms)::float8 AS max
      FROM test_trials
      WHERE session_id = ${sessionId} AND stop_latency_ms IS NOT NULL
    `;

    const row = rows[0];

    return {
      type: 'STOP',
      latencyMs: { avg: row?.avg ?? null, max: row?.max ?? null },
      n: Number(row?.n ?? 0n),
    };
  }

  private async powerSummary(
    session: SessionRow,
  ): Promise<Extract<SessionSummary, { type: 'DAYA' | 'KONEKSI_PUTUS' }>> {
    const groups = await this.prisma.testTrial.groupBy({
      by: ['result'],
      where: { sessionId: session.id, result: { not: null } },
      _count: { _all: true },
    });

    const count = (result: string): number =>
      groups.find((group) => group.result === result)?._count._all ?? 0;

    const range = {
      gte: session.startedAt,
      ...(session.endedAt !== null ? { lte: session.endedAt } : {}),
    };

    const bootEvents = await this.prisma.event.count({
      where: { deviceId: session.deviceId, type: 'BOOT', ts: range },
    });

    const outages = await this.prisma.event.count({
      where: { deviceId: session.deviceId, type: 'DEVICE_OFFLINE', ts: range },
    });

    return {
      type: session.type as 'DAYA' | 'KONEKSI_PUTUS',
      trials: groups.reduce((total, group) => total + group._count._all, 0),
      success: count('SUCCESS'),
      fail: count('FAIL'),
      bootEvents,
      outages,
      outageCount: outages,
    };
  }

  private validateTrialBody(type: SessionType, body: CreateTrialDto): void {
    const problems: { field: string; issue: string }[] = [];

    switch (type) {
      case 'PENGHINDARAN':
        if (body.result !== 'SUCCESS' && body.result !== 'COLLISION') {
          problems.push({ field: 'result', issue: 'must be SUCCESS or COLLISION' });
        }
        break;
      case 'SENSOR':
        if (body.refDistanceCm === undefined) {
          problems.push({ field: 'refDistanceCm', issue: 'is required' });
        }
        if (body.captureSensor !== true) {
          problems.push({ field: 'captureSensor', issue: 'must be true' });
        }
        break;
      case 'JARAK_BERHENTI':
        if (body.pwm === undefined) {
          problems.push({ field: 'pwm', issue: 'is required' });
        }
        if (body.stoppingDistanceCm === undefined) {
          problems.push({ field: 'stoppingDistanceCm', issue: 'is required' });
        }
        break;
      case 'STOP':
        if (body.stopLatencyMs === undefined) {
          problems.push({ field: 'stopLatencyMs', issue: 'is required' });
        }
        break;
      case 'DAYA':
      case 'KONEKSI_PUTUS':
        if (body.result !== 'SUCCESS' && body.result !== 'FAIL') {
          problems.push({ field: 'result', issue: 'must be SUCCESS or FAIL' });
        }
        break;
    }

    if (problems.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${problems[0].field} ${problems[0].issue}`,
        details: problems.map((problem) => ({
          field: problem.field,
          issue: problem.issue,
        })),
      });
    }
  }

  private async getSessionRow(id: bigint): Promise<SessionRow> {
    const row = await this.prisma.testSession.findUnique({
      where: { id },
      select: sessionSelect,
    });

    if (row === null) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Session ${id.toString()} not found`,
      });
    }

    return row;
  }

  private parseId(value: string, label: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `${label} ${value} not found`,
      });
    }

    return BigInt(value);
  }

  private toItem(row: SessionRow): SessionItem {
    return {
      id: row.id.toString(),
      deviceId: row.deviceId,
      type: row.type as SessionType,
      name: row.name,
      mode: row.mode,
      status: row.status as SessionItem['status'],
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      obstacleType: row.obstacleType,
      obstacleSize: row.obstacleSize,
      floorSurface: row.floorSurface,
      laneWidthCm: row.laneWidthCm,
      batteryLevel: row.batteryLevel,
      pwmSetting: row.pwmSetting,
      configSnapshot: (row.configSnapshot ?? {}) as Record<string, unknown>,
      notes: row.notes,
    };
  }

  private toTrialItem(row: TrialRow): TrialItem {
    return {
      id: row.id.toString(),
      sessionId: row.sessionId.toString(),
      trialNo: row.trialNo,
      ts: row.ts.toISOString(),
      result: row.result,
      refDistanceCm: row.refDistanceCm,
      measuredCm: row.measuredCm,
      valid: row.valid,
      pwm: row.pwm,
      stoppingDistanceCm: row.stoppingDistanceCm,
      stopLatencyMs: row.stopLatencyMs,
      note: row.note,
    };
  }
}
