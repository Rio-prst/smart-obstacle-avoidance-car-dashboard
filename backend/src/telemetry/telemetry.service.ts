import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { Env } from '../config/env.validation';
import { DeviceStateService } from '../device-state/device-state.service';
import { DeviceService } from '../devices/devices.service';
import { MQTT_EVENTS, type TelemetryReceivedEvent } from '../mqtt/mqtt.constants';
import { PrismaService } from '../prisma/prisma.service';
import type { TelemetryQueryDto } from './dto/telemetry-query.dto';

export interface TelemetryItem {
  ts: string;
  mode: 'AUTO' | 'MANUAL';
  distCm: number | null;
  valid: boolean;
  state: 'STOP' | 'MAJU' | 'PINDAI' | 'BELOK';
  pwm: number;
  avoidCount: number;
  rssi: number | null;
}

export interface TelemetryHistoryResult {
  data: TelemetryItem[];
  meta: {
    count: number;
    from: string | null;
    to: string | null;
    mode: 'AUTO' | 'MANUAL' | null;
  };
}

interface AggregatedRow {
  bucket: Date;
  mode: 'AUTO' | 'MANUAL';
  state: 'STOP' | 'MAJU' | 'PINDAI' | 'BELOK';
  valid: boolean;
  dist_cm: number | null;
  pwm: number | null;
  avoid_count: number;
  rssi: number | null;
}

interface SampledMarker {
  at: number;
  mode: 'AUTO' | 'MANUAL';
  state: 'STOP' | 'MAJU' | 'PINDAI' | 'BELOK';
  valid: boolean;
}

const DEFAULT_LIMIT = 500;

const bucketIntervals: Record<NonNullable<TelemetryQueryDto['interval']>, string> = {
  '1s': '1 second',
  '5s': '5 seconds',
  '30s': '30 seconds',
  '1m': '1 minute',
};

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly sampled = new Map<string, SampledMarker>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly deviceState: DeviceStateService,
    private readonly devices: DeviceService,
  ) {}

  @OnEvent(MQTT_EVENTS.telemetry)
  handleTelemetry(event: TelemetryReceivedEvent): void {
    this.deviceState.applyTelemetry(event.deviceId, event.payload, event.receivedAt);

    if (!this.shouldSample(event)) {
      void this.devices
        .markSeenFromTelemetry(event.deviceId, event.payload, event.receivedAt)
        .catch((error: unknown) => this.logPersistFailure(event.deviceId, error));
      return;
    }

    this.markSampled(event);

    void (async () => {
      const known = await this.devices.markSeenFromTelemetry(
        event.deviceId,
        event.payload,
        event.receivedAt,
      );

      if (!known) {
        return;
      }

      await this.prisma.telemetry.create({
        data: {
          deviceId: event.deviceId,
          ts: this.resolveTs(event),
          mode: event.payload.mode,
          distCm: event.payload.dist_cm,
          valid: event.payload.valid,
          state: event.payload.state,
          pwm: event.payload.pwm,
          avoidCount: event.payload.avoid_count,
          rssi: event.payload.rssi,
        },
      });
    })().catch((error: unknown) => this.logPersistFailure(event.deviceId, error));
  }

  async latest(deviceId: string): Promise<TelemetryItem | null> {
    const row = await this.prisma.telemetry.findFirst({
      where: { deviceId },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
    });

    return row ? this.toItem(row) : null;
  }

  async history(deviceId: string, query: TelemetryQueryDto): Promise<TelemetryHistoryResult> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'from must be before to',
      });
    }

    const limit = query.limit ?? DEFAULT_LIMIT;
    const data = query.interval
      ? await this.historyAggregated(deviceId, query, from, to, limit)
      : await this.historyRaw(deviceId, query, from, to, limit);

    return {
      data,
      meta: {
        count: data.length,
        from: from?.toISOString() ?? data[0]?.ts ?? null,
        to: to?.toISOString() ?? data[data.length - 1]?.ts ?? null,
        mode: query.mode ?? null,
      },
    };
  }

  private async historyRaw(
    deviceId: string,
    query: TelemetryQueryDto,
    from: Date | null,
    to: Date | null,
    limit: number,
  ): Promise<TelemetryItem[]> {
    const rows = await this.prisma.telemetry.findMany({
      where: {
        deviceId,
        ...(query.mode ? { mode: query.mode } : {}),
        ...(from || to
          ? {
              ts: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.reverse().map((row) => this.toItem(row));
  }

  private async historyAggregated(
    deviceId: string,
    query: TelemetryQueryDto,
    from: Date | null,
    to: Date | null,
    limit: number,
  ): Promise<TelemetryItem[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`device_id = ${deviceId}`];

    if (from) {
      conditions.push(Prisma.sql`ts >= ${from}`);
    }
    if (to) {
      conditions.push(Prisma.sql`ts <= ${to}`);
    }
    if (query.mode) {
      conditions.push(Prisma.sql`mode = ${query.mode}`);
    }

    const bucket = bucketIntervals[query.interval ?? '1s'];

    const rows = await this.prisma.$queryRaw<AggregatedRow[]>(Prisma.sql`
      SELECT
        date_bin(${bucket}::interval, ts, TIMESTAMPTZ '2000-01-01') AS bucket,
        mode,
        state,
        bool_and(valid) AS valid,
        avg(dist_cm)::float8 AS dist_cm,
        round(avg(pwm))::int AS pwm,
        max(avoid_count) AS avoid_count,
        round(avg(rssi))::int AS rssi
      FROM telemetry
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY bucket, mode, state
      ORDER BY bucket DESC, mode DESC, state DESC
      LIMIT ${limit}
    `);

    return rows.reverse().map((row) => ({
      ts: row.bucket.toISOString(),
      mode: row.mode,
      distCm: row.valid ? row.dist_cm : null,
      valid: row.valid,
      state: row.state,
      pwm: row.pwm ?? 0,
      avoidCount: row.avoid_count,
      rssi: row.rssi,
    }));
  }

  private shouldSample(event: TelemetryReceivedEvent): boolean {
    const previous = this.sampled.get(event.deviceId);

    if (!previous) {
      return true;
    }

    const changed =
      previous.mode !== event.payload.mode ||
      previous.state !== event.payload.state ||
      previous.valid !== event.payload.valid;

    if (changed) {
      return true;
    }

    const intervalMs = this.config.get('TELEMETRY_SAMPLE_INTERVAL_SECONDS', { infer: true }) * 1000;

    return event.receivedAt.getTime() - previous.at >= intervalMs;
  }

  private markSampled(event: TelemetryReceivedEvent): void {
    this.sampled.set(event.deviceId, {
      at: event.receivedAt.getTime(),
      mode: event.payload.mode,
      state: event.payload.state,
      valid: event.payload.valid,
    });
  }

  private resolveTs(event: TelemetryReceivedEvent): Date {
    return event.payload.ts > 0 ? new Date(event.payload.ts * 1000) : event.receivedAt;
  }

  private toItem(row: {
    ts: Date;
    mode: string;
    distCm: number | null;
    valid: boolean;
    state: string;
    pwm: number;
    avoidCount: number;
    rssi: number | null;
  }): TelemetryItem {
    return {
      ts: row.ts.toISOString(),
      mode: row.mode as TelemetryItem['mode'],
      distCm: row.valid ? row.distCm : null,
      valid: row.valid,
      state: row.state as TelemetryItem['state'],
      pwm: row.pwm,
      avoidCount: row.avoidCount,
      rssi: row.rssi,
    };
  }

  private logPersistFailure(deviceId: string, error: unknown): void {
    this.logger.warn(
      `Failed to persist telemetry for ${deviceId}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
