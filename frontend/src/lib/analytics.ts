import type {
  AvoidanceAnalytics,
  CommandAnalytics,
  ConfigComparisonRow,
  ConnectivityAnalytics,
  DeviceEvent,
  DeviceMode,
  DeviceState,
  ModeOverview,
  Outage,
  SensorAnalytics,
  StateDistribution,
  StopDistanceAnalytics,
  Telemetry,
  TestSession,
  TestTrial,
} from '@/types/api';

const stateOrder: DeviceState[] = ['MAJU', 'STOP', 'PINDAI', 'BELOK'];

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function minimum(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function maximum(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function stateSeconds(telemetry: Telemetry[]): Record<DeviceState, number> {
  const result: Record<DeviceState, number> = {
    MAJU: 0,
    STOP: 0,
    PINDAI: 0,
    BELOK: 0,
  };

  for (let index = 0; index < telemetry.length; index += 1) {
    const point = telemetry[index];
    const next = telemetry[index + 1];
    const duration = next
      ? Math.max(0, (new Date(next.ts).getTime() - new Date(point.ts).getTime()) / 1000)
      : 0;
    result[point.state] += duration;
  }

  return result;
}

export function buildSensorAnalytics(telemetry: Telemetry[]): SensorAnalytics {
  const distances = telemetry
    .flatMap((point) => (point.valid && point.distCm !== null ? [point.distCm] : []));
  const invalidCount = telemetry.length - distances.length;
  const rounded = distances.map(roundOne);

  return {
    total: telemetry.length,
    valid: distances.length,
    invalidCount,
    invalidPct: telemetry.length === 0 ? 0 : roundOne((invalidCount / telemetry.length) * 100),
    distCm: {
      avg: average(rounded) === null ? null : roundOne(average(rounded) as number),
      min: minimum(rounded),
      max: maximum(rounded),
    },
  };
}

export function buildStateDistribution(
  telemetry: Telemetry[],
  windowSeconds: number,
  excludedOfflineSeconds = 0,
): StateDistribution {
  const secondsByState = stateSeconds(telemetry);
  const observedSeconds = roundOne(
    Object.values(secondsByState).reduce((total, seconds) => total + seconds, 0),
  );

  return {
    windowSeconds,
    observedSeconds,
    excludedOfflineSeconds,
    byState: stateOrder.map((state) => ({
      state,
      seconds: roundOne(secondsByState[state]),
      pct:
        observedSeconds === 0
          ? 0
          : roundOne((secondsByState[state] / observedSeconds) * 100),
    })),
  };
}

function eventNumber(event: DeviceEvent, key: string): number | null {
  const value = event.detail[key];
  return typeof value === 'number' ? value : null;
}

export function buildAvoidanceAnalytics(events: DeviceEvent[]): AvoidanceAnalytics {
  const sorted = [...events].sort((first, second) => first.ts.localeCompare(second.ts));
  const stopEvents = sorted.filter(
    (event) => event.type === 'STOP' && event.detail.reason === 'OBSTACLE',
  );
  const noPathEvents = sorted.filter(
    (event) => event.type === 'STOP' && event.detail.reason === 'NO_PATH',
  );
  const avoidEvents = sorted.filter((event) => event.type === 'AVOID_DONE');
  const durations: number[] = [];
  const triggerDistances: number[] = [];

  for (const avoidEvent of avoidEvents) {
    const avoidTime = new Date(avoidEvent.ts).getTime();
    const previousStop = [...stopEvents]
      .reverse()
      .find((event) => new Date(event.ts).getTime() <= avoidTime);

    if (previousStop) {
      durations.push(Math.max(0, (avoidTime - new Date(previousStop.ts).getTime()) / 1000));
      const distance = eventNumber(previousStop, 'dist_cm');
      if (distance !== null) {
        triggerDistances.push(distance);
      }
    }
  }

  return {
    cycles: avoidEvents.length,
    permanentStops: noPathEvents.length,
    cycleDurationSec: {
      avg: average(durations) === null ? null : roundOne(average(durations) as number),
      min: minimum(durations) === null ? null : roundOne(minimum(durations) as number),
      max: maximum(durations) === null ? null : roundOne(maximum(durations) as number),
    },
    stopTriggerDistCm: {
      avg:
        average(triggerDistances) === null
          ? null
          : roundOne(average(triggerDistances) as number),
      min: minimum(triggerDistances),
      max: maximum(triggerDistances),
    },
  };
}

export function buildCommandAnalytics(
  commands: { status: string; cmd: string; latencyMs: number | null; reason: string | null }[],
): CommandAnalytics {
  const byStatus: CommandAnalytics['byStatus'] = {
    pending: 0,
    acked: 0,
    rejected: 0,
    expired: 0,
  };
  const byCmd: Record<string, number> = {};
  const rejectReasons: Record<string, number> = {};
  const latencies: number[] = [];

  for (const command of commands) {
    if (command.status in byStatus) {
      byStatus[command.status as keyof CommandAnalytics['byStatus']] += 1;
    }
    byCmd[command.cmd] = (byCmd[command.cmd] ?? 0) + 1;
    if (command.latencyMs !== null) {
      latencies.push(command.latencyMs);
    }
    if (command.reason !== null) {
      rejectReasons[command.reason] = (rejectReasons[command.reason] ?? 0) + 1;
    }
  }

  return {
    byStatus,
    byCmd,
    latencyMs: {
      avg: average(latencies) === null ? null : roundOne(average(latencies) as number),
      p95: percentile(latencies, 95) === null ? null : roundOne(percentile(latencies, 95) as number),
      max: maximum(latencies),
    },
    rejectReasons,
  };
}

export function buildConnectivityAnalytics(
  outages: Outage[],
  telemetry: Telemetry[],
  windowSeconds: number,
): ConnectivityAnalytics {
  const outageSeconds = outages.reduce((total, outage) => total + outage.durationSec, 0);
  const rssiValues = telemetry.flatMap((point) => (point.rssi !== null ? [point.rssi] : []));

  return {
    uptimePct:
      windowSeconds <= 0
        ? 0
        : roundOne(Math.max(0, Math.min(100, 100 - (outageSeconds / windowSeconds) * 100))),
    disconnectCount: outages.length,
    outages: [...outages].sort((first, second) => second.from.localeCompare(first.from)),
    rssi: {
      avg: average(rssiValues) === null ? null : roundOne(average(rssiValues) as number),
      min: minimum(rssiValues),
      max: maximum(rssiValues),
    },
  };
}

export function buildStopDistanceAnalytics(
  trials: TestTrial[],
  marginCm = 10,
): StopDistanceAnalytics {
  const groups = new Map<number, number[]>();

  for (const trial of trials) {
    if (trial.pwm === null || trial.stoppingDistanceCm === null) {
      continue;
    }
    const values = groups.get(trial.pwm) ?? [];
    values.push(trial.stoppingDistanceCm);
    groups.set(trial.pwm, values);
  }

  const byPwm = [...groups.entries()]
    .sort((first, second) => first[0] - second[0])
    .map(([pwm, values]) => ({
      pwm,
      trials: values.length,
      avgCm: roundOne(average(values) as number),
      maxCm: roundOne(maximum(values) as number),
    }));
  const worst = byPwm.length === 0 ? null : maximum(byPwm.map((point) => point.maxCm));

  return {
    byPwm,
    worstStoppingDistanceCm: worst,
    marginCm,
    recommendedStopCm:
      worst === null ? null : Math.min(100, Math.max(15, Math.ceil(worst + marginCm))),
    note: 'Suggestion from test data, not applied automatically.',
  };
}

export function buildConfigComparison(
  sessions: TestSession[],
  trials: TestTrial[],
): ConfigComparisonRow[] {
  const groups = new Map<string, ConfigComparisonRow>();

  for (const session of sessions) {
    if (session.type !== 'PENGHINDARAN' || session.mode !== 'AUTO' || session.status !== 'ended') {
      continue;
    }
    const key = [
      session.configSnapshot.stopCm,
      session.configSnapshot.resumeCm,
      session.configSnapshot.maxPwm,
      session.configSnapshot.manualMaxPwm,
    ].join(':');
    const sessionTrials = trials.filter((trial) => trial.sessionId === session.id);
    const success = sessionTrials.filter((trial) => trial.result === 'SUCCESS').length;
    const existing = groups.get(key);

    if (existing) {
      existing.sessions += 1;
      existing.trials += sessionTrials.length;
      existing.success += success;
    } else {
      groups.set(key, {
        stopCm: session.configSnapshot.stopCm,
        resumeCm: session.configSnapshot.resumeCm,
        maxPwm: session.configSnapshot.maxPwm,
        manualMaxPwm: session.configSnapshot.manualMaxPwm,
        sessions: 1,
        trials: sessionTrials.length,
        success,
        successRatePct: null,
      });
    }
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      successRatePct: row.trials === 0 ? null : roundOne((row.success / row.trials) * 100),
    }))
    .sort((first, second) => (second.successRatePct ?? 0) - (first.successRatePct ?? 0));
}

function buildModeOverview(
  telemetry: Telemetry[],
  events: DeviceEvent[],
  mode: DeviceMode,
): ModeOverview {
  const modeTelemetry = telemetry.filter((point) => point.mode === mode);
  const modeEvents = events.filter((event) => event.mode === mode);
  const eventCounts: Record<string, number> = {};

  for (const event of modeEvents) {
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  }

  return {
    samples: modeTelemetry.length,
    events: eventCounts,
    stateSeconds: stateSeconds(modeTelemetry),
  };
}

export function buildOverview(
  telemetry: Telemetry[],
  events: DeviceEvent[],
): Record<DeviceMode, ModeOverview> {
  return {
    AUTO: buildModeOverview(telemetry, events, 'AUTO'),
    MANUAL: buildModeOverview(telemetry, events, 'MANUAL'),
  };
}

export function buildAvoidanceSuccessRate(rows: ConfigComparisonRow[]): number | null {
  const trials = rows.reduce((total, row) => total + row.trials, 0);
  const success = rows.reduce((total, row) => total + row.success, 0);
  return trials === 0 ? null : roundOne((success / trials) * 100);
}
