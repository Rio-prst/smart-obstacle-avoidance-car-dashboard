import type {
  AnalyticsBundle,
  AnalyticsFilters,
  Command,
  CommandHistoryResult,
  ControlSnapshot,
  CreateSessionInput,
  CreateTrialInput,
  DashboardSnapshot,
  Device,
  DeviceConfig,
  DeviceEvent,
  DeviceMode,
  EventHistoryResult,
  SessionDetail,
  SessionListItem,
  Telemetry,
  TelemetryHistoryResult,
  TestSession,
  TestTrial,
  UpdateConfigInput,
} from '@/types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const TOKEN_KEY = 'smartcar_jwt';

export class ApiError extends Error {
  code?: string;
  status: number;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(username = 'admin', password = 'adminpassword123'): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new ApiError('Login gagal', res.status, 'INVALID_CREDENTIALS');
  }

  const json = await res.json();
  const token = json.accessToken as string;
  setStoredToken(token);
  return token;
}

export async function ensureToken(): Promise<string> {
  let token = getStoredToken();
  if (!token) {
    token = await login();
  }
  return token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryAuth = true,
): Promise<T> {
  const token = await ensureToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retryAuth) {
    clearStoredToken();
    return request<T>(path, options, false);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const json = await res.json();

  if (!res.ok) {
    const err = json.error || {};
    throw new ApiError(
      err.message || `HTTP error ${res.status}`,
      res.status,
      err.code,
      err.details,
    );
  }

  return json;
}

// =============================================================================
// API CLIENT IMPLEMENTATION
// =============================================================================

export const apiClient = {
  // --- Devices & Telemetry ---
  async getDevice(id = 'car01'): Promise<Device> {
    const res = await request<{ data: Device }>(`/devices/${id}`);
    return res.data;
  },

  async getLatestTelemetry(id = 'car01'): Promise<Telemetry | null> {
    const res = await request<{ data: Telemetry | null }>(`/devices/${id}/telemetry/latest`);
    return res.data;
  },

  async getTelemetryList(id = 'car01', limit = 50): Promise<Telemetry[]> {
    const res = await request<{ data: Telemetry[] }>(`/devices/${id}/telemetry?limit=${limit}`);
    return res.data;
  },

  async getEventsList(id = 'car01', limit = 20): Promise<DeviceEvent[]> {
    const res = await request<{ data: DeviceEvent[] }>(`/devices/${id}/events?limit=${limit}`);
    return res.data;
  },

  async getCommandsList(id = 'car01', limit = 20): Promise<Command[]> {
    const res = await request<{ data: Command[] }>(`/devices/${id}/commands?limit=${limit}`);
    return res.data;
  },

  // --- Snapshot Composite ---
  async getDashboardSnapshot(id = 'car01'): Promise<DashboardSnapshot> {
    const [device, config, latest, telemetry, events] = await Promise.all([
      apiClient.getDevice(id),
      apiClient.getConfig(id),
      apiClient.getLatestTelemetry(id),
      apiClient.getTelemetryList(id, 50),
      apiClient.getEventsList(id, 20),
    ]);

    const latestTs = latest?.ts ? new Date(latest.ts).getTime() : new Date(device.lastSeen).getTime();
    const dataAgeSeconds = Math.max(0, Math.round((Date.now() - latestTs) / 1000));

    const defaultTelemetry: Telemetry = {
      ts: device.lastSeen,
      mode: device.mode,
      distCm: null,
      valid: false,
      state: device.state,
      pwm: 0,
      avoidCount: device.avoidCount,
      rssi: null,
    };

    return {
      device,
      config,
      latest: latest || defaultTelemetry,
      telemetry,
      events,
      rttMs: null,
      dataAgeSeconds,
    };
  },

  // --- Control ---
  async getControlSnapshot(id = 'car01'): Promise<ControlSnapshot> {
    const [device, config, latest, controlStatus, commands] = await Promise.all([
      apiClient.getDevice(id),
      apiClient.getConfig(id),
      apiClient.getLatestTelemetry(id),
      request<{
        data: {
          mode: DeviceMode;
          state: Device['state'];
          controller: { username: string; until: string } | null;
          sid: number | null;
          rttMs: number | null;
        };
      }>(`/devices/${id}/control`),
      apiClient.getCommandsList(id, 20),
    ]);

    const latestTs = latest?.ts ? new Date(latest.ts).getTime() : new Date(device.lastSeen).getTime();
    const dataAgeSeconds = Math.max(0, Math.round((Date.now() - latestTs) / 1000));

    const defaultTelemetry: Telemetry = {
      ts: device.lastSeen,
      mode: device.mode,
      distCm: null,
      valid: false,
      state: device.state,
      pwm: 0,
      avoidCount: device.avoidCount,
      rssi: null,
    };

    return {
      device: {
        ...device,
        mode: controlStatus.data.mode,
        state: controlStatus.data.state,
      },
      config,
      latest: latest || defaultTelemetry,
      controller: controlStatus.data.controller,
      sid: controlStatus.data.sid,
      rttMs: controlStatus.data.rttMs,
      dataAgeSeconds,
      commands,
    };
  },

  async acquireControl(id = 'car01'): Promise<{ sid: number; expiresAt: string }> {
    const res = await request<{ data: { sid: number; expiresAt: string } }>(
      `/devices/${id}/control/acquire`,
      { method: 'POST' },
    );
    return res.data;
  },

  async releaseControl(id = 'car01'): Promise<void> {
    await request<void>(`/devices/${id}/control/release`, { method: 'POST' });
  },

  // --- Commands ---
  async sendCommand(
    cmd: 'START' | 'STOP' | 'SET_MODE',
    mode?: DeviceMode,
    id = 'car01',
  ): Promise<Command> {
    const body: Record<string, unknown> = { cmd };
    if (mode) body.mode = mode;

    const res = await request<{ data: Command }>(`/devices/${id}/commands`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  // --- Configuration ---
  async getConfig(id = 'car01'): Promise<DeviceConfig> {
    const res = await request<{ data: DeviceConfig }>(`/devices/${id}/config`);
    return res.data;
  },

  async updateConfig(input: UpdateConfigInput, id = 'car01'): Promise<DeviceConfig> {
    const res = await request<{ data: DeviceConfig }>(`/devices/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  // --- Sessions & Trials ---
  async getSessions(id = 'car01'): Promise<SessionListItem[]> {
    const res = await request<{ data: SessionListItem[] }>(`/devices/${id}/sessions`);
    return res.data;
  },

  async getSessionDetail(sid: string): Promise<SessionDetail> {
    const [sessionRes, trialsRes, summaryRes] = await Promise.all([
      request<{ data: TestSession }>(`/sessions/${sid}`),
      request<{ data: TestTrial[] }>(`/sessions/${sid}/trials`),
      request<{ data: SessionDetail['summary'] }>(`/sessions/${sid}/summary`),
    ]);

    return {
      session: sessionRes.data,
      trials: trialsRes.data,
      summary: summaryRes.data,
    };
  },

  async createSession(input: CreateSessionInput, id = 'car01'): Promise<TestSession> {
    const res = await request<{ data: TestSession }>(`/devices/${id}/sessions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async endSession(sid: string): Promise<TestSession> {
    const res = await request<{ data: TestSession }>(`/sessions/${sid}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ended' }),
    });
    return res.data;
  },

  async addTrial(sid: string, input: CreateTrialInput): Promise<TestTrial> {
    const res = await request<{ data: TestTrial }>(`/sessions/${sid}/trials`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async deleteTrial(sid: string, tid: string): Promise<void> {
    await request<void>(`/sessions/${sid}/trials/${tid}`, {
      method: 'DELETE',
    });
  },

  // --- History ---
  async getTelemetryHistory(
    rangeMinutes: number,
    mode: DeviceMode | null,
    id = 'car01',
  ): Promise<TelemetryHistoryResult> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - rangeMinutes * 60 * 1000).toISOString();
    let query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1000`;
    if (mode) query += `&mode=${mode}`;

    const res = await request<{
      data: Telemetry[];
      meta: { count: number; from: string; to: string };
    }>(`/devices/${id}/telemetry?${query}`);

    return {
      data: res.data,
      meta: { ...res.meta, mode },
    };
  },

  async getEventHistory(
    rangeMinutes: number,
    type: string | null,
    mode: DeviceMode | null,
    id = 'car01',
  ): Promise<EventHistoryResult> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - rangeMinutes * 60 * 1000).toISOString();
    let query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200`;
    if (type) query += `&type=${type}`;
    if (mode) query += `&mode=${mode}`;

    const res = await request<{
      data: DeviceEvent[];
      meta: { count: number; from: string; to: string };
    }>(`/devices/${id}/events?${query}`);

    return {
      data: res.data,
      meta: { ...res.meta, type },
    };
  },

  async getCommandHistory(rangeMinutes: number, id = 'car01'): Promise<CommandHistoryResult> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - rangeMinutes * 60 * 1000).toISOString();
    const res = await request<{ data: Command[] }>(`/devices/${id}/commands?limit=100`);

    return {
      data: res.data,
      meta: { count: res.data.length, from, to },
    };
  },

  // --- Analytics Bundle ---
  async getAnalytics(filters: AnalyticsFilters, id = 'car01'): Promise<AnalyticsBundle> {
    const to = new Date().toISOString();
    const rangeHours = filters.rangeHours || 24;
    const from = new Date(Date.now() - rangeHours * 60 * 60 * 1000).toISOString();

    let q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    if (filters.mode) q += `&mode=${filters.mode}`;
    if (filters.sessionId) q += `&sessionId=${filters.sessionId}`;

    const [
      sensor,
      stateDist,
      avoidance,
      commands,
      conn,
      stopDist,
      configComp,
      overview,
    ] = await Promise.all([
      request<{ data: AnalyticsBundle['sensor']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/sensor?${q}`,
      ),
      request<{ data: AnalyticsBundle['stateDistribution']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/state-distribution?${q}`,
      ),
      filters.mode === 'MANUAL'
        ? Promise.resolve({
            data: {
              cycles: 0,
              permanentStops: 0,
              cycleDurationSec: { avg: null, min: null, max: null },
              stopTriggerDistCm: { avg: null, min: null, max: null },
            },
          })
        : request<{ data: AnalyticsBundle['avoidance']; meta: AnalyticsBundle['meta'] }>(
            `/devices/${id}/analytics/avoidance?${q}`,
          ),
      request<{ data: AnalyticsBundle['commands']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/commands?${q}`,
      ),
      request<{ data: AnalyticsBundle['connectivity']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/connectivity?${q}`,
      ),
      request<{ data: AnalyticsBundle['stopDistance']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/stop-distance?${q}`,
      ),
      request<{ data: AnalyticsBundle['configComparison']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/config-comparison?${q}`,
      ),
      request<{ data: AnalyticsBundle['overview']; meta: AnalyticsBundle['meta'] }>(
        `/devices/${id}/analytics/overview?${q}`,
      ),
    ]);

    return {
      meta: sensor.meta,
      sensor: sensor.data,
      stateDistribution: stateDist.data,
      avoidance: avoidance.data,
      commands: commands.data,
      connectivity: conn.data,
      stopDistance: stopDist.data,
      configComparison: configComp.data,
      overview: overview.data,
    };
  },
};
