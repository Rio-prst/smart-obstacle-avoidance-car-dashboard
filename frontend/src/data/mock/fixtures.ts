import type {
  Command,
  CommandStatus,
  DeviceConfig,
  DeviceEvent,
  DeviceMode,
  DeviceState,
  Outage,
  SessionType,
  Telemetry,
  TestSession,
  TestTrial,
  TrialResult,
} from '@/types/api';

export const MOCK_DEVICE_ID = 'car01';
export const MOCK_DEVICE_NAME = 'Mobil 1';
export const MOCK_HISTORY_MS = 24 * 60 * 60 * 1000;
export const MOCK_TELEMETRY_INTERVAL_MS = 5000;

export const mockConfig: DeviceConfig = {
  ver: 4,
  stopCm: 25,
  resumeCm: 30,
  maxPwm: 200,
  manualMaxPwm: 150,
  updatedAt: '2026-11-04T07:30:00.000Z',
};

export const configSnapshots: DeviceConfig[] = [
  { ...mockConfig, ver: 2, stopCm: 22, resumeCm: 27, maxPwm: 180, manualMaxPwm: 140 },
  { ...mockConfig, ver: 3, stopCm: 30, resumeCm: 35, maxPwm: 200, manualMaxPwm: 150 },
  { ...mockConfig, ver: 4, stopCm: 25, resumeCm: 30, maxPwm: 200, manualMaxPwm: 150 },
];

export function createSeededRandom(seed: number): () => number {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isoAgo(now: Date, milliseconds: number): string {
  return new Date(now.getTime() - milliseconds).toISOString();
}

function seedStateForPhase(phase: number, mode: DeviceMode): DeviceState {
  if (mode === 'MANUAL') {
    if (phase < 18) {
      return 'STOP';
    }
    if (phase < 28) {
      return 'BELOK';
    }
    return 'MAJU';
  }

  if (phase < 86) {
    return 'MAJU';
  }
  if (phase < 90) {
    return 'STOP';
  }
  if (phase < 95) {
    return 'PINDAI';
  }
  if (phase < 100) {
    return 'BELOK';
  }
  return 'MAJU';
}

function seedPwmForState(state: DeviceState, mode: DeviceMode, config: DeviceConfig): number {
  if (state === 'STOP' || state === 'PINDAI') {
    return 0;
  }
  if (mode === 'MANUAL') {
    return state === 'BELOK' ? Math.round(config.manualMaxPwm * 0.6) : config.manualMaxPwm;
  }
  return state === 'BELOK' ? Math.round(config.maxPwm * 0.75) : config.maxPwm - 20;
}

function seedDistanceForState(
  state: DeviceState,
  mode: DeviceMode,
  config: DeviceConfig,
  random: () => number,
): number {
  if (state === 'STOP') {
    return roundOne(config.stopCm - 2 - random() * 5);
  }
  if (state === 'PINDAI') {
    return roundOne(config.stopCm + random() * 8);
  }
  if (state === 'BELOK') {
    return roundOne(config.resumeCm + 3 + random() * 14);
  }
  if (mode === 'MANUAL') {
    return roundOne(42 + random() * 38);
  }
  return roundOne(48 + random() * 42);
}

export function createSeedTelemetry(
  now: Date,
  random: () => number = createSeededRandom(42),
): Telemetry[] {
  const total = Math.floor(MOCK_HISTORY_MS / MOCK_TELEMETRY_INTERVAL_MS);
  const manualStart = Math.floor(total * 0.58);
  const manualEnd = Math.floor(total * 0.64);
  const points: Telemetry[] = [];
  let avoidCount = 0;

  for (let index = 0; index < total; index += 1) {
    const mode: DeviceMode =
      index >= manualStart && index < manualEnd ? 'MANUAL' : 'AUTO';
    const phase = index % 140;
    const state = seedStateForPhase(phase, mode);

    if (mode === 'AUTO' && phase === 0 && index > 0) {
      avoidCount += 1;
    }

    const valid = index % 997 !== 0;
    const distance = seedDistanceForState(state, mode, mockConfig, random);
    const pwm = seedPwmForState(state, mode, mockConfig);

    points.push({
      ts: new Date(now.getTime() - (total - 1 - index) * MOCK_TELEMETRY_INTERVAL_MS).toISOString(),
      mode,
      distCm: valid ? distance : null,
      valid,
      state,
      pwm,
      avoidCount,
      rssi: -55 - Math.round(random() * 12),
    });
  }

  return points;
}

function makeEvent(
  id: number,
  ts: string,
  mode: DeviceMode,
  source: DeviceEvent['source'],
  type: string,
  detail: Record<string, unknown>,
): DeviceEvent {
  return { id: String(id), ts, mode, source, type, detail };
}

export function createSeedEvents(
  now: Date,
  telemetry: Telemetry[],
  random: () => number = createSeededRandom(99),
): DeviceEvent[] {
  const events: DeviceEvent[] = [];
  let nextId = 5000;
  let previous: Telemetry | null = null;

  for (const point of telemetry) {
    if (!previous) {
      previous = point;
      continue;
    }

    if (point.mode !== previous.mode) {
      events.push(
        makeEvent(nextId, point.ts, point.mode, 'SERVER', 'SET_MODE', {
          mode: point.mode,
        }),
      );
      nextId += 1;
    }

    if (point.avoidCount > previous.avoidCount) {
      events.push(
        makeEvent(nextId, point.ts, point.mode, 'DEVICE', 'AVOID_DONE', {
          avoid_count: point.avoidCount,
        }),
      );
      nextId += 1;
    }

    if (point.state !== previous.state) {
      if (point.state === 'STOP') {
        const reason = point.mode === 'MANUAL' ? 'MANUAL_STOP' : 'OBSTACLE';
        events.push(
          makeEvent(nextId, point.ts, point.mode, 'DEVICE', 'STOP', {
            dist_cm: point.distCm,
            reason,
          }),
        );
        nextId += 1;
      } else if (point.state === 'PINDAI') {
        events.push(makeEvent(nextId, point.ts, point.mode, 'DEVICE', 'PINDAI', {}));
        nextId += 1;
      } else if (point.state === 'BELOK') {
        events.push(
          makeEvent(nextId, point.ts, point.mode, 'DEVICE', 'BELOK', {
            direction: random() > 0.5 ? 'KANAN' : 'KIRI',
          }),
        );
        nextId += 1;
      }
    }

    previous = point;
  }

  events.push(
    makeEvent(nextId, isoAgo(now, 6 * 60 * 60 * 1000), 'AUTO', 'DEVICE', 'STOP', {
      dist_cm: 19.2,
      reason: 'NO_PATH',
    }),
  );
  nextId += 1;
  events.push(
    makeEvent(nextId, isoAgo(now, 10 * 60 * 60 * 1000), 'AUTO', 'DEVICE', 'STOP', {
      dist_cm: 20.4,
      reason: 'NO_PATH',
    }),
  );
  nextId += 1;

  events.push(
    makeEvent(nextId, isoAgo(now, 7.2 * 60 * 60 * 1000), 'AUTO', 'SERVER', 'DEVICE_OFFLINE', {
      reason: 'TIMEOUT',
    }),
  );
  nextId += 1;
  events.push(
    makeEvent(nextId, isoAgo(now, 7.2 * 60 * 60 * 1000 - 42000), 'AUTO', 'SERVER', 'DEVICE_ONLINE', {}),
  );
  nextId += 1;
  events.push(
    makeEvent(nextId, isoAgo(now, 13.5 * 60 * 60 * 1000), 'AUTO', 'SERVER', 'DEVICE_OFFLINE', {
      reason: 'TIMEOUT',
    }),
  );
  nextId += 1;

  return events.sort((first, second) => first.ts.localeCompare(second.ts));
}

export function createSeedCommands(
  now: Date,
  random: () => number = createSeededRandom(17),
): Command[] {
  const statuses: CommandStatus[] = [
    'acked',
    'acked',
    'acked',
    'acked',
    'rejected',
    'acked',
    'expired',
  ];
  const commands: Command[] = [];

  for (let index = 0; index < 28; index += 1) {
    const status = statuses[index % statuses.length];
    const cmd = index % 5 === 0 ? 'SET_MODE' : index % 3 === 0 ? 'STOP' : 'START';
    const createdAt = isoAgo(now, (index + 1) * 47 * 60 * 1000 + Math.round(random() * 30000));
    const latencyMs = status === 'acked' ? 140 + Math.round(random() * 460) : null;
    const reason =
      status === 'rejected'
        ? cmd === 'SET_MODE'
          ? 'NOT_STOPPED'
          : 'WRONG_MODE'
        : status === 'expired'
          ? 'EXPIRED'
          : null;

    commands.push({
      id: String(8000 + index),
      seq: 400 + index,
      cmd,
      payload: cmd === 'SET_MODE' ? { mode: index % 2 === 0 ? 'MANUAL' : 'AUTO' } : null,
      status,
      reason,
      latencyMs,
      createdAt,
      ackedAt:
        latencyMs === null ? null : new Date(new Date(createdAt).getTime() + latencyMs).toISOString(),
    });
  }

  return commands.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

interface SessionSeedInput {
  id: string;
  type: SessionType;
  name: string;
  config: DeviceConfig;
  startedDaysAgo: number;
  durationMinutes: number;
  notes: string;
  metadata?: Partial<TestSession>;
}

function createSessionSeed(now: Date, input: SessionSeedInput): TestSession {
  const startedAt = new Date(now.getTime() - input.startedDaysAgo * 24 * 60 * 60 * 1000);
  const endedAt = new Date(startedAt.getTime() + input.durationMinutes * 60 * 1000);

  return {
    id: input.id,
    deviceId: MOCK_DEVICE_ID,
    type: input.type,
    name: input.name,
    mode: 'AUTO',
    status: 'ended',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    obstacleType: null,
    obstacleSize: null,
    floorSurface: 'keramik',
    laneWidthCm: 60,
    batteryLevel: 'penuh',
    pwmSetting: 180,
    configSnapshot: { ...input.config },
    notes: input.notes,
    ...input.metadata,
  };
}

export function createSeedSessions(now: Date): TestSession[] {
  return [
    createSessionSeed(now, {
      id: 'sess-1006',
      type: 'PENGHINDARAN',
      name: 'Balok 20 cm - ambang 25 cm',
      config: configSnapshots[2],
      startedDaysAgo: 0.12,
      durationMinutes: 48,
      notes: 'Percobaan awal dengan target awal 18/20.',
      metadata: {
        obstacleType: 'balok',
        obstacleSize: '20x20 cm',
        floorSurface: 'keramik',
        laneWidthCm: 60,
        batteryLevel: 'penuh',
        pwmSetting: 180,
      },
    }),
    createSessionSeed(now, {
      id: 'sess-1005',
      type: 'PENGHINDARAN',
      name: 'Balok 20 cm - ambang 30 cm',
      config: configSnapshots[1],
      startedDaysAgo: 0.18,
      durationMinutes: 52,
      notes: 'Membandingkan ambang STOP yang lebih longgar.',
      metadata: {
        obstacleType: 'balok',
        obstacleSize: '20x20 cm',
        floorSurface: 'keramik',
        laneWidthCm: 60,
        batteryLevel: 'penuh',
        pwmSetting: 180,
      },
    }),
    createSessionSeed(now, {
      id: 'sess-1004',
      type: 'SENSOR',
      name: 'Kalibrasi sensor 30/50/70 cm',
      config: configSnapshots[2],
      startedDaysAgo: 0.28,
      durationMinutes: 35,
      notes: 'Penggaris sebagai referensi, lantai keramik.',
      metadata: { obstacleType: 'papan', obstacleSize: '30x30 cm', pwmSetting: null },
    }),
    createSessionSeed(now, {
      id: 'sess-1003',
      type: 'JARAK_BERHENTI',
      name: 'Jarak berhenti PWM 120/150/180',
      config: configSnapshots[2],
      startedDaysAgo: 0.38,
      durationMinutes: 41,
      notes: 'Satu pengukuran per PWM, ulang tiga kali.',
      metadata: { obstacleType: 'dinding', pwmSetting: 150 },
    }),
    createSessionSeed(now, {
      id: 'sess-1002',
      type: 'STOP',
      name: 'Latensi STOP 5 percobaan',
      config: configSnapshots[2],
      startedDaysAgo: 0.48,
      durationMinutes: 18,
      notes: 'Latensi dari tombol sampai motor berhenti.',
      metadata: { pwmSetting: 180 },
    }),
    createSessionSeed(now, {
      id: 'sess-1001',
      type: 'DAYA',
      name: 'Uji daya baterai 7.6 V',
      config: configSnapshots[2],
      startedDaysAgo: 0.58,
      durationMinutes: 64,
      notes: 'Baterai diukur manual sebelum dan sesudah sesi.',
      metadata: { batteryLevel: '7.6 V', obstacleType: null },
    }),
    createSessionSeed(now, {
      id: 'sess-1000',
      type: 'KONEKSI_PUTUS',
      name: 'Putus hotspot saat AUTO',
      config: configSnapshots[2],
      startedDaysAgo: 0.68,
      durationMinutes: 25,
      notes: 'Hotspot dimatikan saat mobil berjalan.',
      metadata: { pwmSetting: 180 },
    }),
  ];
}

function trialBase(
  session: TestSession,
  trialNo: number,
  index: number,
): Pick<TestTrial, 'id' | 'sessionId' | 'trialNo' | 'ts'> {
  const start = new Date(session.startedAt).getTime();
  return {
    id: `${session.id}-t${trialNo}`,
    sessionId: session.id,
    trialNo,
    ts: new Date(start + index * 75 * 1000).toISOString(),
  };
}

function trial(
  session: TestSession,
  trialNo: number,
  index: number,
  values: Partial<TestTrial>,
): TestTrial {
  return {
    ...trialBase(session, trialNo, index),
    result: null,
    refDistanceCm: null,
    measuredCm: null,
    valid: null,
    pwm: null,
    stoppingDistanceCm: null,
    stopLatencyMs: null,
    note: null,
    ...values,
  };
}

export function createSeedTrials(sessions: TestSession[]): TestTrial[] {
  const trials: TestTrial[] = [];
  const byId = new Map(sessions.map((session) => [session.id, session]));

  const avoidanceOne = byId.get('sess-1006');
  if (avoidanceOne) {
    for (let index = 0; index < 20; index += 1) {
      const result: TrialResult = index < 18 ? 'SUCCESS' : 'COLLISION';
      trials.push(
        trial(avoidanceOne, index + 1, index, {
          result,
          note: result === 'COLLISION' ? 'Tabrakan ringan pada sisi kiri.' : null,
        }),
      );
    }
  }

  const avoidanceTwo = byId.get('sess-1005');
  if (avoidanceTwo) {
    for (let index = 0; index < 20; index += 1) {
      const result: TrialResult = index % 5 === 4 ? 'COLLISION' : 'SUCCESS';
      trials.push(trial(avoidanceTwo, index + 1, index, { result }));
    }
  }

  const sensor = byId.get('sess-1004');
  if (sensor) {
    const points = [
      { ref: 30, values: [30.4, 29.6, 30.9, null] },
      { ref: 50, values: [50.8, 49.2, 51.4, null] },
      { ref: 70, values: [71.2, 69.8, 70.6, null] },
    ];
    let trialNo = 1;
    for (const point of points) {
      point.values.forEach((measured) => {
        const valid = measured !== null;
        trials.push(
          trial(sensor, trialNo, trialNo - 1, {
            refDistanceCm: point.ref,
            measuredCm: measured,
            valid,
            note: valid ? null : 'Pembacaan tidak valid.',
          }),
        );
        trialNo += 1;
      });
    }
  }

  const stopDistance = byId.get('sess-1003');
  if (stopDistance) {
    const values = [
      { pwm: 120, distances: [12.0, 12.5, 13.1] },
      { pwm: 150, distances: [14.1, 14.6, 15.2] },
      { pwm: 180, distances: [18.0, 19.5, 20.4] },
    ];
    let trialNo = 1;
    for (const group of values) {
      group.distances.forEach((distance) => {
        trials.push(
          trial(stopDistance, trialNo, trialNo - 1, {
            pwm: group.pwm,
            stoppingDistanceCm: distance,
          }),
        );
        trialNo += 1;
      });
    }
  }

  const stop = byId.get('sess-1002');
  if (stop) {
    [280, 315, 342, 401, 420].forEach((latency, index) => {
      trials.push(
        trial(stop, index + 1, index, {
          stopLatencyMs: latency,
          note: index === 4 ? 'Nilai tertinggi pada percobaan terakhir.' : null,
        }),
      );
    });
  }

  const power = byId.get('sess-1001');
  if (power) {
    ['SUCCESS', 'SUCCESS', 'FAIL', 'SUCCESS'].forEach((result, index) => {
      trials.push(
        trial(power, index + 1, index, {
          result: result as TrialResult,
          note: result === 'FAIL' ? 'Baterai turun ke 7.3 V.' : null,
        }),
      );
    });
  }

  const connectivity = byId.get('sess-1000');
  if (connectivity) {
    ['SUCCESS', 'FAIL', 'SUCCESS'].forEach((result, index) => {
      trials.push(
        trial(connectivity, index + 1, index, {
          result: result as TrialResult,
          note: result === 'FAIL' ? 'Mobil tidak berhenti setelah reconnect.' : null,
        }),
      );
    });
  }

  return trials;
}

export function createSeedOutages(now: Date): Outage[] {
  return [
    {
      from: isoAgo(now, 7.2 * 60 * 60 * 1000),
      to: isoAgo(now, 7.2 * 60 * 60 * 1000 - 42000),
      durationSec: 42,
      source: 'TIMEOUT',
      rssiBefore: -78,
    },
    {
      from: isoAgo(now, 13.5 * 60 * 60 * 1000),
      to: isoAgo(now, 13.5 * 60 * 60 * 1000 - 72000),
      durationSec: 72,
      source: 'TIMEOUT',
      rssiBefore: -80,
    },
    {
      from: isoAgo(now, 19.4 * 60 * 60 * 1000),
      to: isoAgo(now, 19.4 * 60 * 60 * 1000 - 18000),
      durationSec: 18,
      source: 'LWT',
      rssiBefore: -74,
    },
  ];
}

export function createSeedTelemetryForRange(
  telemetry: Telemetry[],
  fromMs: number,
  toMs: number,
  mode: DeviceMode | null,
): Telemetry[] {
  return telemetry.filter((point) => {
    const time = new Date(point.ts).getTime();
    return time >= fromMs && time <= toMs && (mode === null || point.mode === mode);
  });
}

export function normalizeRange(
  telemetry: Telemetry[],
  fallbackMs: number,
): { fromMs: number; toMs: number } {
  const last = telemetry[telemetry.length - 1];
  const toMs = last ? new Date(last.ts).getTime() : Date.now();
  return { fromMs: toMs - fallbackMs, toMs };
}

export function safeAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function safeMin(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.min(...values);
}

export function safeMax(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((first, second) => first - second);
  const index = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index];
}
