import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Env } from '../config/env.validation';
import { DeviceService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';

function roundOne(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function roundTwo(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

export interface AnalyticsMeta {
  from: string;
  to: string;
  mode: string | null;
  sessionId: string | null;
}

@Injectable()
export class AnalyticsService {
  private readonly defaultStopMarginCm: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.defaultStopMarginCm = this.config.get<number>(
      'ANALYTICS_STOP_MARGIN_CM',
      { infer: true },
    );
  }

  async getSensor(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown>; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const modeFilter = query.mode
      ? Prisma.sql`AND mode = ${query.mode}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        total: number;
        valid: number;
        invalidCount: number;
        avgDist: number | null;
        minDist: number | null;
        maxDist: number | null;
      }>
    >`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE valid)::int AS valid,
        count(*) FILTER (WHERE NOT valid)::int AS "invalidCount",
        avg(dist_cm) FILTER (WHERE valid)::float8 AS "avgDist",
        min(dist_cm) FILTER (WHERE valid)::float8 AS "minDist",
        max(dist_cm) FILTER (WHERE valid)::float8 AS "maxDist"
      FROM telemetry
      WHERE device_id = ${deviceId}
        AND ts >= ${fromDate}
        AND ts <= ${toDate}
        ${modeFilter}
    `;

    const row = rows[0] ?? {
      total: 0,
      valid: 0,
      invalidCount: 0,
      avgDist: null,
      minDist: null,
      maxDist: null,
    };

    const invalidPct =
      row.total > 0
        ? roundTwo((row.invalidCount / row.total) * 100) ?? 0
        : 0;

    return {
      data: {
        total: row.total,
        valid: row.valid,
        invalidCount: row.invalidCount,
        invalidPct,
        distCm: {
          avg: roundOne(row.avgDist),
          min: roundOne(row.minDist),
          max: roundOne(row.maxDist),
        },
      },
      meta,
    };
  }

  async getStateDistribution(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown>; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const windowSeconds = Math.max(
      1,
      Math.round((toDate.getTime() - fromDate.getTime()) / 1000),
    );

    const modeFilter = query.mode
      ? Prisma.sql`AND (mode = ${query.mode} OR mode IS NULL)`
      : Prisma.empty;

    const events = await this.prisma.$queryRaw<
      Array<{ ts: Date; type: string; mode: string | null }>
    >`
      SELECT ts, type, mode
      FROM events
      WHERE device_id = ${deviceId}
        AND ts >= ${fromDate}
        AND ts <= ${toDate}
        AND type IN ('MAJU', 'STOP', 'PINDAI', 'BELOK', 'DEVICE_OFFLINE', 'DEVICE_ONLINE')
        ${modeFilter}
      ORDER BY ts ASC
    `;

    const stateSeconds: Record<string, number> = {
      MAJU: 0,
      STOP: 0,
      PINDAI: 0,
      BELOK: 0,
    };
    let excludedOfflineSeconds = 0;

    let currentState = 'STOP';
    let isOffline = false;
    let lastTs = fromDate.getTime();

    for (const ev of events) {
      const evTs = ev.ts.getTime();
      const durationSec = Math.max(0, Math.round((evTs - lastTs) / 1000));

      if (isOffline) {
        excludedOfflineSeconds += durationSec;
      } else if (stateSeconds[currentState] !== undefined) {
        stateSeconds[currentState] += durationSec;
      }

      if (ev.type === 'DEVICE_OFFLINE') {
        isOffline = true;
      } else if (ev.type === 'DEVICE_ONLINE') {
        isOffline = false;
      } else if (['MAJU', 'STOP', 'PINDAI', 'BELOK'].includes(ev.type)) {
        currentState = ev.type;
      }

      lastTs = evTs;
    }

    const remainingSec = Math.max(
      0,
      Math.round((toDate.getTime() - lastTs) / 1000),
    );
    if (isOffline) {
      excludedOfflineSeconds += remainingSec;
    } else if (stateSeconds[currentState] !== undefined) {
      stateSeconds[currentState] += remainingSec;
    }

    const observedSeconds = Math.max(
      0,
      windowSeconds - excludedOfflineSeconds,
    );

    const byState = ['MAJU', 'STOP', 'PINDAI', 'BELOK'].map((st) => {
      const sec = stateSeconds[st] ?? 0;
      const pct =
        observedSeconds > 0 ? roundOne((sec / observedSeconds) * 100) ?? 0 : 0;
      return {
        state: st,
        seconds: sec,
        pct,
      };
    });

    return {
      data: {
        windowSeconds,
        observedSeconds,
        excludedOfflineSeconds,
        byState,
      },
      meta,
    };
  }

  async getAvoidance(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown>; meta: AnalyticsMeta }> {
    if (query.mode === 'MANUAL') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Avoidance analytics only applies to AUTO mode',
      });
    }

    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const events = await this.prisma.event.findMany({
      where: {
        deviceId,
        ts: { gte: fromDate, lte: toDate },
        type: { in: ['STOP', 'AVOID_DONE'] },
      },
      orderBy: { ts: 'asc' },
      select: {
        ts: true,
        type: true,
        detail: true,
      },
    });

    let permanentStops = 0;
    const cycleDurations: number[] = [];
    const triggerDists: number[] = [];

    let lastObstacleStopTs: Date | null = null;

    for (const ev of events) {
      const detail = (ev.detail ?? {}) as Record<string, unknown>;
      if (ev.type === 'STOP') {
        if (detail.reason === 'OBSTACLE') {
          lastObstacleStopTs = ev.ts;
          if (typeof detail.dist_cm === 'number') {
            triggerDists.push(detail.dist_cm);
          }
        } else if (detail.reason === 'NO_PATH') {
          permanentStops++;
          lastObstacleStopTs = null;
        }
      } else if (ev.type === 'AVOID_DONE') {
        if (lastObstacleStopTs !== null) {
          const duration =
            (ev.ts.getTime() - lastObstacleStopTs.getTime()) / 1000;
          if (duration >= 0) {
            cycleDurations.push(duration);
          }
          lastObstacleStopTs = null;
        }
      }
    }

    const calcStats = (vals: number[]) => {
      if (vals.length === 0) {
        return { avg: null, min: null, max: null };
      }
      const sum = vals.reduce((a, b) => a + b, 0);
      return {
        avg: roundOne(sum / vals.length),
        min: roundOne(Math.min(...vals)),
        max: roundOne(Math.max(...vals)),
      };
    };

    return {
      data: {
        cycles: cycleDurations.length,
        permanentStops,
        cycleDurationSec: calcStats(cycleDurations),
        stopTriggerDistCm: calcStats(triggerDists),
      },
      meta,
    };
  }

  async getCommands(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown>; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const statsRows = await this.prisma.$queryRaw<
      Array<{
        acked: number;
        rejected: number;
        expired: number;
        startCmd: number;
        stopCmd: number;
        setModeCmd: number;
        avgLat: number | null;
        p95Lat: number | null;
        maxLat: number | null;
      }>
    >`
      SELECT
        count(*) FILTER (WHERE status = 'acked')::int AS acked,
        count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        count(*) FILTER (WHERE status = 'expired')::int AS expired,
        count(*) FILTER (WHERE cmd = 'START')::int AS "startCmd",
        count(*) FILTER (WHERE cmd = 'STOP')::int AS "stopCmd",
        count(*) FILTER (WHERE cmd = 'SET_MODE')::int AS "setModeCmd",
        avg(EXTRACT(EPOCH FROM (acked_at - created_at)) * 1000) FILTER (WHERE status = 'acked' AND acked_at IS NOT NULL)::float8 AS "avgLat",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (acked_at - created_at)) * 1000) FILTER (WHERE status = 'acked' AND acked_at IS NOT NULL)::float8 AS "p95Lat",
        max(EXTRACT(EPOCH FROM (acked_at - created_at)) * 1000) FILTER (WHERE status = 'acked' AND acked_at IS NOT NULL)::float8 AS "maxLat"
      FROM commands
      WHERE device_id = ${deviceId}
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
    `;

    const row = statsRows[0] ?? {
      acked: 0,
      rejected: 0,
      expired: 0,
      startCmd: 0,
      stopCmd: 0,
      setModeCmd: 0,
      avgLat: null,
      p95Lat: null,
      maxLat: null,
    };

    const reasonRows = await this.prisma.$queryRaw<
      Array<{ reason: string; count: number }>
    >`
      SELECT reason, count(*)::int AS count
      FROM commands
      WHERE device_id = ${deviceId}
        AND created_at >= ${fromDate}
        AND created_at <= ${toDate}
        AND reason IS NOT NULL
      GROUP BY reason
    `;

    const rejectReasons: Record<string, number> = {};
    for (const r of reasonRows) {
      rejectReasons[r.reason] = r.count;
    }

    return {
      data: {
        byStatus: {
          acked: row.acked,
          rejected: row.rejected,
          expired: row.expired,
        },
        byCmd: {
          START: row.startCmd,
          STOP: row.stopCmd,
          SET_MODE: row.setModeCmd,
        },
        latencyMs: {
          avg: row.avgLat !== null ? Math.round(row.avgLat) : null,
          p95: row.p95Lat !== null ? Math.round(row.p95Lat) : null,
          max: row.maxLat !== null ? Math.round(row.maxLat) : null,
        },
        rejectReasons,
      },
      meta,
    };
  }

  async getConnectivity(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown>; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const events = await this.prisma.event.findMany({
      where: {
        deviceId,
        ts: { gte: fromDate, lte: toDate },
        type: { in: ['DEVICE_OFFLINE', 'DEVICE_ONLINE'] },
      },
      orderBy: { ts: 'asc' },
      select: {
        ts: true,
        type: true,
        detail: true,
      },
    });

    interface OutageItem {
      from: string;
      to: string;
      durationSec: number;
      source: string;
      rssiBefore: number | null;
    }

    const outages: OutageItem[] = [];
    let currentOffline: { ts: Date; detail: Record<string, unknown> } | null =
      null;

    for (const ev of events) {
      if (ev.type === 'DEVICE_OFFLINE') {
        currentOffline = {
          ts: ev.ts,
          detail: (ev.detail ?? {}) as Record<string, unknown>,
        };
      } else if (ev.type === 'DEVICE_ONLINE' && currentOffline !== null) {
        const durationSec = Math.max(
          1,
          Math.round((ev.ts.getTime() - currentOffline.ts.getTime()) / 1000),
        );
        outages.push({
          from: currentOffline.ts.toISOString(),
          to: ev.ts.toISOString(),
          durationSec,
          source: String(currentOffline.detail.source ?? 'TIMEOUT'),
          rssiBefore:
            typeof currentOffline.detail.rssi === 'number'
              ? currentOffline.detail.rssi
              : null,
        });
        currentOffline = null;
      }
    }

    if (currentOffline !== null) {
      const durationSec = Math.max(
        1,
        Math.round((toDate.getTime() - currentOffline.ts.getTime()) / 1000),
      );
      outages.push({
        from: currentOffline.ts.toISOString(),
        to: toDate.toISOString(),
        durationSec,
        source: String(currentOffline.detail.source ?? 'TIMEOUT'),
        rssiBefore:
          typeof currentOffline.detail.rssi === 'number'
            ? currentOffline.detail.rssi
            : null,
      });
    }

    const windowSeconds = Math.max(
      1,
      Math.round((toDate.getTime() - fromDate.getTime()) / 1000),
    );
    const totalOfflineSec = outages.reduce((acc, o) => acc + o.durationSec, 0);
    const uptimePct = Math.max(
      0,
      roundOne(100 - (totalOfflineSec / windowSeconds) * 100) ?? 100,
    );

    const rssiStats = await this.prisma.$queryRaw<
      Array<{ avgRssi: number | null; minRssi: number | null; maxRssi: number | null }>
    >`
      SELECT
        avg(rssi)::float8 AS "avgRssi",
        min(rssi)::int AS "minRssi",
        max(rssi)::int AS "maxRssi"
      FROM telemetry
      WHERE device_id = ${deviceId}
        AND ts >= ${fromDate}
        AND ts <= ${toDate}
        AND rssi IS NOT NULL
    `;

    const r = rssiStats[0] ?? { avgRssi: null, minRssi: null, maxRssi: null };

    return {
      data: {
        uptimePct,
        disconnectCount: outages.length,
        outages,
        rssi: {
          avg: r.avgRssi !== null ? Math.round(r.avgRssi) : null,
          min: r.minRssi,
          max: r.maxRssi,
        },
      },
      meta,
    };
  }

  async getStopDistance(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown> | null; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const marginCm = query.marginCm ?? this.defaultStopMarginCm;

    const rows = await this.prisma.$queryRaw<
      Array<{
        pwm: number;
        trials: number;
        avgDist: number | null;
        maxDist: number | null;
      }>
    >`
      SELECT
        t.pwm,
        count(*)::int AS trials,
        avg(t.stopping_distance_cm)::float8 AS "avgDist",
        max(t.stopping_distance_cm)::float8 AS "maxDist"
      FROM test_trials t
      JOIN test_sessions s ON t.session_id = s.id
      WHERE s.device_id = ${deviceId}
        AND s.type = 'JARAK_BERHENTI'
        AND t.stopping_distance_cm IS NOT NULL
        AND s.started_at >= ${fromDate}
        AND s.started_at <= ${toDate}
        ${query.sessionId ? Prisma.sql`AND s.id = ${BigInt(query.sessionId)}` : Prisma.empty}
      GROUP BY t.pwm
      ORDER BY t.pwm
    `;

    if (rows.length === 0) {
      return { data: null, meta };
    }

    const byPwm = rows.map((row) => ({
      pwm: row.pwm,
      trials: row.trials,
      stoppingDistanceCm: {
        avg: roundOne(row.avgDist),
        max: roundOne(row.maxDist),
      },
    }));

    const maxDistances = rows.flatMap((r) =>
      r.maxDist !== null ? [r.maxDist] : [],
    );
    const worstStoppingDistanceCm =
      maxDistances.length > 0 ? roundOne(Math.max(...maxDistances)) : 0;
    const recommendedStopCm = Math.ceil((worstStoppingDistanceCm ?? 0) + marginCm);

    return {
      data: {
        byPwm,
        worstStoppingDistanceCm,
        marginCm,
        recommendedStopCm,
        note: 'Suggestion from test data, not applied automatically.',
      },
      meta,
    };
  }

  async getConfigComparison(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Array<Record<string, unknown>>; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    const rows = await this.prisma.$queryRaw<
      Array<{
        stopCm: number;
        resumeCm: number;
        maxPwm: number;
        sessions: number;
        trials: number;
        success: number;
      }>
    >`
      SELECT
        (s.config_snapshot->>'stopCm')::int AS "stopCm",
        (s.config_snapshot->>'resumeCm')::int AS "resumeCm",
        (s.config_snapshot->>'maxPwm')::int AS "maxPwm",
        count(DISTINCT s.id)::int AS sessions,
        count(t.id)::int AS trials,
        count(t.id) FILTER (WHERE t.result = 'SUCCESS')::int AS success
      FROM test_sessions s
      LEFT JOIN test_trials t ON t.session_id = s.id
      WHERE s.device_id = ${deviceId}
        AND s.type = 'PENGHINDARAN'
        AND s.mode = 'AUTO'
        AND s.status = 'ended'
        AND (s.config_snapshot->>'stopCm') IS NOT NULL
        AND s.started_at >= ${fromDate}
        AND s.started_at <= ${toDate}
        ${query.sessionId ? Prisma.sql`AND s.id = ${BigInt(query.sessionId)}` : Prisma.empty}
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3
    `;

    const data = rows.map((r) => {
      const successRatePct =
        r.trials > 0 ? roundOne((r.success / r.trials) * 100) : 0;
      return {
        stopCm: r.stopCm,
        resumeCm: r.resumeCm,
        maxPwm: r.maxPwm,
        sessions: r.sessions,
        trials: r.trials,
        success: r.success,
        successRatePct,
      };
    });

    return { data, meta };
  }

  async getOverview(
    deviceId: string,
    query: AnalyticsQueryDto,
  ): Promise<{ data: Record<string, unknown>; meta: AnalyticsMeta }> {
    await this.devices.ensureDevice(deviceId);
    const { fromDate, toDate, meta } = await this.resolveDateRange(
      query,
      deviceId,
    );

    // Telemetry samples per mode
    const sampleRows = await this.prisma.$queryRaw<
      Array<{ mode: string; count: number }>
    >`
      SELECT mode, count(*)::int AS count
      FROM telemetry
      WHERE device_id = ${deviceId}
        AND ts >= ${fromDate}
        AND ts <= ${toDate}
      GROUP BY mode
    `;

    // Events count per mode & type
    const eventRows = await this.prisma.$queryRaw<
      Array<{ mode: string | null; type: string; count: number }>
    >`
      SELECT mode, type, count(*)::int AS count
      FROM events
      WHERE device_id = ${deviceId}
        AND ts >= ${fromDate}
        AND ts <= ${toDate}
      GROUP BY mode, type
    `;

    const formatModeData = (targetMode: 'AUTO' | 'MANUAL') => {
      const samples =
        sampleRows.find((r) => r.mode === targetMode)?.count ?? 0;

      const events: Record<string, number> = {};
      for (const ev of eventRows) {
        if (ev.mode === targetMode) {
          events[ev.type] = ev.count;
        }
      }

      return {
        samples,
        events,
        stateSeconds: {
          MAJU: 0,
          STOP: 0,
        },
      };
    };

    return {
      data: {
        AUTO: formatModeData('AUTO'),
        MANUAL: formatModeData('MANUAL'),
      },
      meta,
    };
  }

  private async resolveDateRange(
    query: AnalyticsQueryDto,
    deviceId: string,
  ): Promise<{ fromDate: Date; toDate: Date; meta: AnalyticsMeta }> {
    let fromDate: Date;
    let toDate: Date;

    if (query.sessionId) {
      if (!/^\d+$/.test(query.sessionId)) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: `Session ${query.sessionId} not found`,
        });
      }

      const session = await this.prisma.testSession.findUnique({
        where: { id: BigInt(query.sessionId) },
      });

      if (!session || session.deviceId !== deviceId) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: `Session ${query.sessionId} not found`,
        });
      }

      fromDate = session.startedAt;
      toDate = session.endedAt ?? new Date();
    } else {
      toDate = query.to ? new Date(query.to) : new Date();
      fromDate = query.from
        ? new Date(query.from)
        : new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

      if (fromDate.getTime() > toDate.getTime()) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'from date cannot be after to date',
        });
      }
    }

    return {
      fromDate,
      toDate,
      meta: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        mode: query.mode ?? null,
        sessionId: query.sessionId ?? null,
      },
    };
  }
}
