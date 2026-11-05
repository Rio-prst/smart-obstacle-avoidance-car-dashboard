import type {
  AnalyticsBundle,
  AnalyticsFilters,
  Command,
  CommandHistoryResult,
  ControlSnapshot,
  CreateSessionInput,
  CreateTrialInput,
  DashboardSnapshot,
  DeviceConfig,
  DeviceEvent,
  DeviceMode,
  EventHistoryResult,
  SessionDetail,
  SessionListItem,
  TelemetryHistoryResult,
  TestSession,
  TestTrial,
  UpdateConfigInput,
} from '@/types/api';
import {
  acquireControl,
  advanceSimulation,
  applyConfig,
  applyDrive,
  applySetMode,
  applyStart,
  applyStop,
  createInitialSimulation,
  releaseControl,
  type DriveDirection,
  type SimulationState,
} from './simulator';
import {
  createSeedCommands,
  createSeedOutages,
  createSeedSessions,
  createSeedTelemetryForRange,
  createSeedTrials,
  MOCK_DEVICE_ID,
} from './fixtures';
import {
  buildAvoidanceAnalytics,
  buildCommandAnalytics,
  buildConfigComparison,
  buildConnectivityAnalytics,
  buildOverview,
  buildSensorAnalytics,
  buildStateDistribution,
  buildStopDistanceAnalytics,
} from '@/lib/analytics';
import { successRateForSession, summarizeSession } from '@/lib/session-summary';

interface MockStore {
  simulation: SimulationState;
  commands: Command[];
  sessions: TestSession[];
  trials: TestTrial[];
  outages: ReturnType<typeof createSeedOutages>;
  nextCommandId: number;
  nextCommandSeq: number;
  nextSessionId: number;
}

function createMockStore(now: Date = new Date()): MockStore {
  const simulation = createInitialSimulation(now);
  const sessions = createSeedSessions(now);

  return {
    simulation,
    commands: createSeedCommands(now),
    sessions,
    trials: createSeedTrials(sessions),
    outages: createSeedOutages(now),
    nextCommandId: 8100,
    nextCommandSeq: 500,
    nextSessionId: 1007,
  };
}

let store = createMockStore();
let interval: ReturnType<typeof setInterval> | undefined;

function cloneTelemetry(point: SimulationState['telemetry'][number]) {
  return { ...point };
}

function cloneEvent(event: DeviceEvent): DeviceEvent {
  return { ...event, detail: { ...event.detail } };
}

export function toDashboardSnapshot(
  state: SimulationState,
  now: Date = new Date(),
): DashboardSnapshot {
  const latest = state.telemetry[state.telemetry.length - 1];
  const latestTime = new Date(latest.ts).getTime();

  return {
    device: { ...state.device },
    config: { ...state.config },
    latest: cloneTelemetry(latest),
    telemetry: state.telemetry.slice(-720).map(cloneTelemetry),
    events: [...state.events]
      .sort((first, second) => second.ts.localeCompare(first.ts))
      .slice(0, 10)
      .map(cloneEvent),
    rttMs: state.rttMs,
    dataAgeSeconds: Math.max(0, (now.getTime() - latestTime) / 1000),
  };
}

export function getDashboardSnapshot(now: Date = new Date()): DashboardSnapshot {
  return toDashboardSnapshot(store.simulation, now);
}

export function startMockSimulation(): void {
  if (interval !== undefined) {
    return;
  }

  interval = setInterval(() => {
    store.simulation = advanceSimulation(store.simulation);
  }, 2000);
}

export function stopMockSimulation(): void {
  if (interval === undefined) {
    return;
  }

  clearInterval(interval);
  interval = undefined;
}

export function resetMockSimulation(now: Date = new Date()): void {
  store = createMockStore(now);
}

function recordCommand(
  cmd: string,
  payload: Record<string, unknown> | null,
  now: Date,
  status: Command['status'] = 'acked',
  reason: string | null = null,
): Command {
  const latencyMs = status === 'acked' ? 140 + Math.round(Math.random() * 360) : null;
  const command: Command = {
    id: String(store.nextCommandId),
    seq: store.nextCommandSeq,
    cmd,
    payload,
    status,
    reason,
    latencyMs,
    createdAt: now.toISOString(),
    ackedAt:
      latencyMs === null ? null : new Date(now.getTime() + latencyMs).toISOString(),
  };

  store.nextCommandId += 1;
  store.nextCommandSeq += 1;
  store.commands = [command, ...store.commands].slice(0, 300);

  return command;
}

export function sendMockStart(now: Date = new Date()): Command {
  const previous = store.simulation;
  store.simulation = applyStart(store.simulation, now);
  const accepted = store.simulation !== previous;

  return recordCommand(
    'START',
    null,
    now,
    accepted ? 'acked' : 'rejected',
    accepted ? null : 'WRONG_MODE',
  );
}

export function sendMockStop(now: Date = new Date()): Command {
  store.simulation = applyStop(store.simulation, now);
  return recordCommand('STOP', null, now);
}

export function sendMockSetMode(mode: DeviceMode, now: Date = new Date()): Command {
  if (store.simulation.device.state !== 'STOP') {
    recordCommand('SET_MODE', { mode }, now, 'rejected', 'NOT_STOPPED');
    throw new Error('Device must be STOP before changing mode.');
  }

  store.simulation = applySetMode(store.simulation, mode, now);
  return recordCommand('SET_MODE', { mode }, now);
}

export function sendMockDrive(
  direction: DriveDirection,
  speed: number,
  now: Date = new Date(),
): ControlSnapshot {
  store.simulation = applyDrive(store.simulation, direction, speed, now);
  return getMockControlSnapshot(now);
}

export function acquireMockControl(now: Date = new Date()): ControlSnapshot {
  store.simulation = acquireControl(store.simulation, now);
  return getMockControlSnapshot(now);
}

export function releaseMockControl(now: Date = new Date()): ControlSnapshot {
  store.simulation = releaseControl(store.simulation, now);
  return getMockControlSnapshot(now);
}

export function getMockControlSnapshot(now: Date = new Date()): ControlSnapshot {
  const state = store.simulation;
  const latest = state.telemetry[state.telemetry.length - 1];

  return {
    device: { ...state.device },
    config: { ...state.config },
    latest: cloneTelemetry(latest),
    controller: state.controller === null ? null : { ...state.controller },
    sid: state.controller === null ? null : state.controlSid,
    rttMs: state.rttMs,
    dataAgeSeconds: Math.max(0, (now.getTime() - new Date(latest.ts).getTime()) / 1000),
    commands: store.commands.slice(0, 10).map((command) => ({ ...command })),
  };
}

export function getMockConfig(): DeviceConfig {
  return { ...store.simulation.config };
}

export function updateMockConfig(
  input: UpdateConfigInput,
  now: Date = new Date(),
): DeviceConfig {
  if (input.stopCm < 15 || input.stopCm > 100) {
    throw new Error('stopCm must be between 15 and 100.');
  }
  if (input.resumeCm <= input.stopCm || input.resumeCm > 150) {
    throw new Error('resumeCm must be greater than stopCm and at most 150.');
  }
  if (input.maxPwm < 80 || input.maxPwm > 255) {
    throw new Error('maxPwm must be between 80 and 255.');
  }
  if (input.manualMaxPwm < 80 || input.manualMaxPwm > 180) {
    throw new Error('manualMaxPwm must be between 80 and 180.');
  }
  if (input.manualMaxPwm > input.maxPwm) {
    throw new Error('manualMaxPwm must not exceed maxPwm.');
  }

  store.simulation = applyConfig(store.simulation, input, now);
  return getMockConfig();
}

function sessionTrials(sessionId: string): TestTrial[] {
  return store.trials
    .filter((trial) => trial.sessionId === sessionId)
    .sort((first, second) => first.trialNo - second.trialNo);
}

function sessionWithStats(session: TestSession): SessionListItem {
  const trials = sessionTrials(session.id);

  return {
    ...session,
    configSnapshot: { ...session.configSnapshot },
    trialCount: trials.length,
    successRatePct: successRateForSession(session, trials),
  };
}

export function getMockSessions(): SessionListItem[] {
  return store.sessions
    .map(sessionWithStats)
    .sort((first, second) => {
      if (first.status !== second.status) {
        return first.status === 'running' ? -1 : 1;
      }
      return second.startedAt.localeCompare(first.startedAt);
    });
}

function findSession(sid: string): TestSession {
  const session = store.sessions.find((item) => item.id === sid);
  if (!session) {
    throw new Error(`Session ${sid} not found.`);
  }
  return session;
}

export function getMockSession(sid: string): SessionDetail {
  const session = findSession(sid);
  const trials = sessionTrials(sid);

  return {
    session: { ...session, configSnapshot: { ...session.configSnapshot } },
    trials: trials.map((trial) => ({ ...trial })),
    summary: summarizeSession(session, trials),
  };
}

export function createMockSession(
  input: CreateSessionInput,
  now: Date = new Date(),
): TestSession {
  if (store.sessions.some((session) => session.status === 'running')) {
    throw new Error('Another session is still running.');
  }

  const sid = `sess-${store.nextSessionId}`;
  store.nextSessionId += 1;

  const session: TestSession = {
    id: sid,
    deviceId: MOCK_DEVICE_ID,
    type: input.type,
    name: input.name,
    mode: store.simulation.device.mode,
    status: 'running',
    startedAt: now.toISOString(),
    endedAt: null,
    obstacleType: input.obstacleType,
    obstacleSize: input.obstacleSize,
    floorSurface: input.floorSurface,
    laneWidthCm: input.laneWidthCm,
    batteryLevel: input.batteryLevel,
    pwmSetting: input.pwmSetting,
    configSnapshot: { ...store.simulation.config },
    notes: input.notes,
  };

  store.sessions = [session, ...store.sessions];

  return { ...session, configSnapshot: { ...session.configSnapshot } };
}

export function endMockSession(sid: string, now: Date = new Date()): SessionDetail {
  const session = findSession(sid);
  if (session.status !== 'running') {
    throw new Error('Session is not running.');
  }

  session.status = 'ended';
  session.endedAt = now.toISOString();
  return getMockSession(sid);
}

export function addMockTrial(
  sid: string,
  input: CreateTrialInput,
  now: Date = new Date(),
): TestTrial {
  const session = findSession(sid);
  if (session.status !== 'running') {
    throw new Error('Cannot add a trial to an ended session.');
  }

  const trials = sessionTrials(sid);
  const trialNo = trials.reduce((maximum, trial) => Math.max(maximum, trial.trialNo), 0) + 1;
  const trial: TestTrial = {
    id: `${sid}-t${trialNo}`,
    sessionId: sid,
    trialNo,
    ts: now.toISOString(),
    result: input.result ?? null,
    refDistanceCm: input.refDistanceCm ?? null,
    measuredCm: input.measuredCm ?? null,
    valid: input.valid ?? null,
    pwm: input.pwm ?? null,
    stoppingDistanceCm: input.stoppingDistanceCm ?? null,
    stopLatencyMs: input.stopLatencyMs ?? null,
    note: input.note ?? null,
  };

  store.trials = [...store.trials, trial];
  return { ...trial };
}

export function deleteMockTrial(sid: string, trialId: string): void {
  const session = findSession(sid);
  if (session.status !== 'running') {
    throw new Error('Cannot delete a trial from an ended session.');
  }

  store.trials = store.trials.filter(
    (trial) => !(trial.sessionId === sid && trial.id === trialId),
  );
}

export function getMockTelemetryHistory(
  rangeMinutes: number,
  mode: DeviceMode | null,
  limit = 500,
  now: Date = new Date(),
): TelemetryHistoryResult {
  const toMs = now.getTime();
  const fromMs = toMs - rangeMinutes * 60 * 1000;
  const data = createSeedTelemetryForRange(store.simulation.telemetry, fromMs, toMs, mode)
    .slice(-limit)
    .map(cloneTelemetry);

  return {
    data,
    meta: {
      count: data.length,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      mode,
    },
  };
}

export function getMockEventHistory(
  rangeMinutes: number,
  type: string | null,
  mode: DeviceMode | null,
  limit = 200,
  now: Date = new Date(),
): EventHistoryResult {
  const toMs = now.getTime();
  const fromMs = toMs - rangeMinutes * 60 * 1000;
  const data = store.simulation.events
    .filter((event) => {
      const time = new Date(event.ts).getTime();
      return (
        time >= fromMs &&
        time <= toMs &&
        (type === null || event.type === type) &&
        (mode === null || event.mode === mode)
      );
    })
    .sort((first, second) => second.ts.localeCompare(first.ts))
    .slice(0, limit)
    .map(cloneEvent);

  return {
    data,
    meta: {
      count: data.length,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      type,
    },
  };
}

export function getMockCommandHistory(
  rangeMinutes: number,
  limit = 50,
  now: Date = new Date(),
): CommandHistoryResult {
  const toMs = now.getTime();
  const fromMs = toMs - rangeMinutes * 60 * 1000;
  const data = store.commands
    .filter((command) => {
      const time = new Date(command.createdAt).getTime();
      return time >= fromMs && time <= toMs;
    })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, limit)
    .map((command) => ({ ...command }));

  return {
    data,
    meta: {
      count: data.length,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
    },
  };
}

function inRange(iso: string, fromMs: number, toMs: number): boolean {
  const time = new Date(iso).getTime();
  return time >= fromMs && time <= toMs;
}

export function getMockAnalytics(
  filters: AnalyticsFilters,
  now: Date = new Date(),
): AnalyticsBundle {
  let fromMs = now.getTime() - filters.rangeHours * 60 * 60 * 1000;
  let toMs = now.getTime();
  const sessionId = filters.sessionId;

  if (sessionId !== null) {
    const session = findSession(sessionId);
    fromMs = new Date(session.startedAt).getTime();
    toMs = session.endedAt === null ? now.getTime() : new Date(session.endedAt).getTime();
  }

  const telemetry = createSeedTelemetryForRange(
    store.simulation.telemetry,
    fromMs,
    toMs,
    filters.mode,
  );
  const events = store.simulation.events.filter(
    (event) =>
      inRange(event.ts, fromMs, toMs) &&
      (filters.mode === null || event.mode === filters.mode),
  );
  const commands = store.commands.filter((command) =>
    inRange(command.createdAt, fromMs, toMs),
  );
  const relevantOutages = store.outages.filter((outage) => {
    const start = new Date(outage.from).getTime();
    const end = new Date(outage.to).getTime();
    return end >= fromMs && start <= toMs;
  });
  const relevantTrials =
    sessionId === null
      ? store.trials
      : store.trials.filter((trial) => trial.sessionId === sessionId);
  const windowSeconds = Math.max(0, (toMs - fromMs) / 1000);

  return {
    meta: {
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      mode: filters.mode,
      sessionId,
    },
    sensor: buildSensorAnalytics(telemetry),
    stateDistribution: buildStateDistribution(
      telemetry,
      windowSeconds,
      relevantOutages.reduce((total, outage) => total + outage.durationSec, 0),
    ),
    avoidance: buildAvoidanceAnalytics(events),
    commands: buildCommandAnalytics(commands),
    connectivity: buildConnectivityAnalytics(relevantOutages, telemetry, windowSeconds),
    stopDistance: buildStopDistanceAnalytics(relevantTrials),
    configComparison: buildConfigComparison(store.sessions, store.trials),
    overview: buildOverview(telemetry, events),
  };
}

export function getMockOutages(): ReturnType<typeof createSeedOutages> {
  return store.outages.map((outage) => ({ ...outage }));
}

export function getMockDeviceEvents(): DeviceEvent[] {
  return store.simulation.events.map(cloneEvent);
}

export function getMockCommands(): Command[] {
  return store.commands.map((command) => ({ ...command }));
}
