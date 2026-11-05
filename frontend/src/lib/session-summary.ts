import type {
  SensorPointSummary,
  SessionSummary,
  StopDistancePointSummary,
  TestSession,
  TestTrial,
} from '@/types/api';

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundOne(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function buildSensorPoints(trials: TestTrial[]): SensorPointSummary[] {
  const groups = new Map<number, TestTrial[]>();

  for (const trial of trials) {
    if (trial.refDistanceCm === null) {
      continue;
    }
    const group = groups.get(trial.refDistanceCm) ?? [];
    group.push(trial);
    groups.set(trial.refDistanceCm, group);
  }

  return [...groups.entries()]
    .sort((first, second) => first[0] - second[0])
    .map(([refCm, group]) => {
      const errors = group.flatMap((trial) =>
        trial.valid !== false && trial.measuredCm !== null
          ? [Math.abs(trial.measuredCm - refCm)]
          : [],
      );
      const validN = errors.length;

      return {
        refCm,
        n: group.length,
        validN,
        invalidN: group.length - validN,
        errorAvgCm: roundOne(average(errors)),
        errorMaxCm: errors.length === 0 ? null : roundOne(Math.max(...errors)),
      };
    });
}

function buildStopDistancePoints(trials: TestTrial[]): StopDistancePointSummary[] {
  const groups = new Map<number, number[]>();

  for (const trial of trials) {
    if (trial.pwm === null || trial.stoppingDistanceCm === null) {
      continue;
    }
    const group = groups.get(trial.pwm) ?? [];
    group.push(trial.stoppingDistanceCm);
    groups.set(trial.pwm, group);
  }

  return [...groups.entries()]
    .sort((first, second) => first[0] - second[0])
    .map(([pwm, values]) => ({
      pwm,
      n: values.length,
      avgCm: roundOne(average(values)),
      maxCm: roundOne(Math.max(...values)),
    }));
}

export function summarizeSession(session: TestSession, trials: TestTrial[]): SessionSummary {
  const success = trials.filter((trial) => trial.result === 'SUCCESS').length;
  const collision = trials.filter((trial) => trial.result === 'COLLISION').length;
  const fail = trials.filter((trial) => trial.result === 'FAIL').length;
  const withResult = success + collision + fail;
  const successRatePct = withResult === 0 ? null : roundOne((success / withResult) * 100);
  const base: SessionSummary = {
    type: session.type,
    mode: session.mode,
    trials: trials.length,
    success: null,
    collision: null,
    fail: null,
    successRatePct: null,
    target: null,
    byPoint: null,
    byPwm: null,
    latencyMs: null,
    byResult: null,
    bootEvents: 0,
    outageCount: 0,
  };

  if (session.type === 'PENGHINDARAN') {
    return {
      ...base,
      success,
      collision,
      fail,
      successRatePct,
      target: { success: 18, trials: 20, label: 'target awal' },
    };
  }

  if (session.type === 'SENSOR') {
    return { ...base, byPoint: buildSensorPoints(trials) };
  }

  if (session.type === 'JARAK_BERHENTI') {
    return { ...base, byPwm: buildStopDistancePoints(trials) };
  }

  if (session.type === 'STOP') {
    const latencies = trials.flatMap((trial) =>
      trial.stopLatencyMs === null ? [] : [trial.stopLatencyMs],
    );

    return {
      ...base,
      latencyMs: {
        avg: roundOne(average(latencies)),
        max: latencies.length === 0 ? null : Math.max(...latencies),
        n: latencies.length,
      },
    };
  }

  const byResult: Record<string, number> = {};
  for (const trial of trials) {
    const key = trial.result ?? 'UNKNOWN';
    byResult[key] = (byResult[key] ?? 0) + 1;
  }

  return {
    ...base,
    success,
    fail,
    successRatePct,
    byResult,
  };
}

export function successRateForSession(session: TestSession, trials: TestTrial[]): number | null {
  if (session.type !== 'PENGHINDARAN' && session.type !== 'DAYA' && session.type !== 'KONEKSI_PUTUS') {
    return null;
  }
  const withResult = trials.filter((trial) => trial.result !== null);
  const success = withResult.filter((trial) => trial.result === 'SUCCESS').length;
  return withResult.length === 0 ? null : roundOne((success / withResult.length) * 100);
}
