export type DeviceMode = 'AUTO' | 'MANUAL';
export type DeviceState = 'STOP' | 'MAJU' | 'PINDAI' | 'BELOK';
export type EventSource = 'DEVICE' | 'SERVER';
export type CommandStatus = 'pending' | 'acked' | 'rejected' | 'expired';
export type SessionType =
  | 'SENSOR'
  | 'PENGHINDARAN'
  | 'JARAK_BERHENTI'
  | 'DAYA'
  | 'KONEKSI_PUTUS'
  | 'STOP';
export type SessionStatus = 'running' | 'ended';
export type TrialResult = 'SUCCESS' | 'COLLISION' | 'FAIL';

export interface Device {
  id: string;
  name: string;
  online: boolean;
  mode: DeviceMode;
  state: DeviceState;
  lastSeen: string;
  fw: string;
  avoidCount: number;
}

export interface Telemetry {
  ts: string;
  mode: DeviceMode;
  distCm: number | null;
  valid: boolean;
  state: DeviceState;
  pwm: number;
  avoidCount: number;
  rssi: number | null;
}

export interface DeviceEvent {
  id: string;
  ts: string;
  mode: DeviceMode;
  source: EventSource;
  type: string;
  detail: Record<string, unknown>;
}

export interface DeviceConfig {
  ver: number;
  stopCm: number;
  resumeCm: number;
  maxPwm: number;
  manualMaxPwm: number;
  updatedAt: string;
}

export interface Command {
  id: string;
  seq: number;
  cmd: string;
  payload: Record<string, unknown> | null;
  status: CommandStatus;
  reason: string | null;
  latencyMs: number | null;
  createdAt: string;
  ackedAt: string | null;
}

export interface Controller {
  username: string;
  until: string;
}

export interface DashboardSnapshot {
  device: Device;
  config: DeviceConfig;
  latest: Telemetry;
  telemetry: Telemetry[];
  events: DeviceEvent[];
  rttMs: number | null;
  dataAgeSeconds: number;
}

export interface ControlSnapshot {
  device: Device;
  config: DeviceConfig;
  latest: Telemetry;
  controller: Controller | null;
  sid: number | null;
  rttMs: number | null;
  dataAgeSeconds: number;
  commands: Command[];
}

export interface TestSession {
  id: string;
  deviceId: string;
  type: SessionType;
  name: string;
  mode: DeviceMode;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  obstacleType: string | null;
  obstacleSize: string | null;
  floorSurface: string | null;
  laneWidthCm: number | null;
  batteryLevel: string | null;
  pwmSetting: number | null;
  configSnapshot: DeviceConfig;
  notes: string | null;
}

export interface TestTrial {
  id: string;
  sessionId: string;
  trialNo: number;
  ts: string;
  result: TrialResult | null;
  refDistanceCm: number | null;
  measuredCm: number | null;
  valid: boolean | null;
  pwm: number | null;
  stoppingDistanceCm: number | null;
  stopLatencyMs: number | null;
  note: string | null;
}

export interface SessionListItem extends TestSession {
  trialCount: number;
  successRatePct: number | null;
}

export interface SensorPointSummary {
  refCm: number;
  n: number;
  validN: number;
  invalidN: number;
  errorAvgCm: number | null;
  errorMaxCm: number | null;
}

export interface StopDistancePointSummary {
  pwm: number;
  n: number;
  avgCm: number | null;
  maxCm: number | null;
}

export interface SessionSummary {
  type: SessionType;
  mode: DeviceMode;
  trials: number;
  success: number | null;
  collision: number | null;
  fail: number | null;
  successRatePct: number | null;
  target: { success: number; trials: number; label: string } | null;
  byPoint: SensorPointSummary[] | null;
  byPwm: StopDistancePointSummary[] | null;
  latencyMs: { avg: number | null; max: number | null; n: number } | null;
  byResult: Record<string, number> | null;
  bootEvents: number;
  outageCount: number;
}

export interface SessionDetail {
  session: TestSession;
  trials: TestTrial[];
  summary: SessionSummary;
}

export interface Outage {
  from: string;
  to: string;
  durationSec: number;
  source: string;
  rssiBefore: number | null;
}

export interface TelemetryHistoryResult {
  data: Telemetry[];
  meta: { count: number; from: string; to: string; mode: DeviceMode | null };
}

export interface EventHistoryResult {
  data: DeviceEvent[];
  meta: { count: number; from: string; to: string; type: string | null };
}

export interface CommandHistoryResult {
  data: Command[];
  meta: { count: number; from: string; to: string };
}

export interface AnalyticsMeta {
  from: string;
  to: string;
  mode: DeviceMode | null;
  sessionId: string | null;
}

export interface SensorAnalytics {
  total: number;
  valid: number;
  invalidCount: number;
  invalidPct: number;
  distCm: { avg: number | null; min: number | null; max: number | null };
}

export interface StateDistribution {
  windowSeconds: number;
  observedSeconds: number;
  excludedOfflineSeconds: number;
  byState: { state: DeviceState; seconds: number; pct: number }[];
}

export interface AvoidanceAnalytics {
  cycles: number;
  permanentStops: number;
  cycleDurationSec: { avg: number | null; min: number | null; max: number | null };
  stopTriggerDistCm: { avg: number | null; min: number | null; max: number | null };
}

export interface CommandAnalytics {
  byStatus: Record<CommandStatus, number>;
  byCmd: Record<string, number>;
  latencyMs: { avg: number | null; p95: number | null; max: number | null };
  rejectReasons: Record<string, number>;
}

export interface ConnectivityAnalytics {
  uptimePct: number;
  disconnectCount: number;
  outages: Outage[];
  rssi: { avg: number | null; min: number | null; max: number | null };
}

export interface StopDistanceAnalytics {
  byPwm: { pwm: number; trials: number; avgCm: number; maxCm: number }[];
  worstStoppingDistanceCm: number | null;
  marginCm: number;
  recommendedStopCm: number | null;
  note: string;
}

export interface ConfigComparisonRow {
  stopCm: number;
  resumeCm: number;
  maxPwm: number;
  manualMaxPwm: number;
  sessions: number;
  trials: number;
  success: number;
  successRatePct: number | null;
}

export interface ModeOverview {
  samples: number;
  events: Record<string, number>;
  stateSeconds: Record<DeviceState, number>;
}

export interface AnalyticsBundle {
  meta: AnalyticsMeta;
  sensor: SensorAnalytics;
  stateDistribution: StateDistribution;
  avoidance: AvoidanceAnalytics;
  commands: CommandAnalytics;
  connectivity: ConnectivityAnalytics;
  stopDistance: StopDistanceAnalytics;
  configComparison: ConfigComparisonRow[];
  overview: Record<DeviceMode, ModeOverview>;
}

export interface CreateSessionInput {
  type: SessionType;
  name: string;
  obstacleType: string | null;
  obstacleSize: string | null;
  floorSurface: string | null;
  laneWidthCm: number | null;
  batteryLevel: string | null;
  pwmSetting: number | null;
  notes: string | null;
}

export interface CreateTrialInput {
  result?: TrialResult | null;
  refDistanceCm?: number | null;
  measuredCm?: number | null;
  valid?: boolean | null;
  pwm?: number | null;
  stoppingDistanceCm?: number | null;
  stopLatencyMs?: number | null;
  note?: string | null;
}

export interface UpdateConfigInput {
  stopCm: number;
  resumeCm: number;
  maxPwm: number;
  manualMaxPwm: number;
}

export interface AnalyticsFilters {
  rangeHours: number;
  sessionId: string | null;
  mode: DeviceMode | null;
}
