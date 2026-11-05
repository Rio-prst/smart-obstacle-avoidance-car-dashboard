import type {
  Controller,
  Device,
  DeviceConfig,
  DeviceEvent,
  DeviceMode,
  DeviceState,
  Telemetry,
} from '@/types/api';
import {
  createSeedEvents,
  createSeedTelemetry,
  createSeededRandom,
  MOCK_DEVICE_ID,
  MOCK_DEVICE_NAME,
  MOCK_HISTORY_MS,
  mockConfig,
} from './fixtures';

type SimulationPhase = 'CRUISE' | 'STOP' | 'SCAN' | 'TURN';
export type DriveDirection = 'F' | 'L' | 'R' | 'S';

export interface SimulationState {
  device: Device;
  config: DeviceConfig;
  telemetry: Telemetry[];
  events: DeviceEvent[];
  rttMs: number;
  phase: SimulationPhase;
  phaseTicks: number;
  autoPaused: boolean;
  nextEventId: number;
  controller: Controller | null;
  controlSid: number;
  lastDriveAt: number;
  manualPwm: number;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function trimTelemetry(telemetry: Telemetry[], now: Date): Telemetry[] {
  const cutoff = now.getTime() - MOCK_HISTORY_MS;
  return telemetry.filter((point) => new Date(point.ts).getTime() >= cutoff).slice(-20000);
}

function trimEvents(events: DeviceEvent[], now: Date): DeviceEvent[] {
  const cutoff = now.getTime() - MOCK_HISTORY_MS;
  return events.filter((event) => new Date(event.ts).getTime() >= cutoff).slice(-800);
}

function createEvent(
  id: number,
  now: Date,
  mode: DeviceMode,
  type: string,
  source: DeviceEvent['source'],
  detail: Record<string, unknown>,
): DeviceEvent {
  return {
    id: String(id),
    ts: now.toISOString(),
    mode,
    source,
    type,
    detail,
  };
}

function createTelemetry(
  now: Date,
  mode: DeviceMode,
  state: DeviceState,
  pwm: number,
  distance: number,
  avoidCount: number,
  rssi: number,
): Telemetry {
  return {
    ts: now.toISOString(),
    mode,
    distCm: roundOne(clamp(distance, 10, 150)),
    valid: true,
    state,
    pwm,
    avoidCount,
    rssi,
  };
}

function nextEventIdFrom(events: DeviceEvent[]): number {
  return (
    events.reduce((maximum, event) => Math.max(maximum, Number(event.id) || 0), 8000) + 1
  );
}

export function createInitialSimulation(
  now: Date = new Date(),
  random: () => number = createSeededRandom(7),
): SimulationState {
  const telemetry = createSeedTelemetry(now, random);
  const latest = telemetry[telemetry.length - 1];
  const events = createSeedEvents(now, telemetry, random);

  return {
    device: {
      id: MOCK_DEVICE_ID,
      name: MOCK_DEVICE_NAME,
      online: true,
      mode: latest.mode,
      state: latest.state,
      lastSeen: latest.ts,
      fw: '0.1.0',
      avoidCount: latest.avoidCount,
    },
    config: { ...mockConfig },
    telemetry,
    events,
    rttMs: 180,
    phase: 'CRUISE',
    phaseTicks: 0,
    autoPaused: false,
    nextEventId: nextEventIdFrom(events),
    controller: null,
    controlSid: 0,
    lastDriveAt: 0,
    manualPwm: 0,
  };
}

function advanceAuto(state: SimulationState, now: Date, random: () => number): SimulationState {
  const previous = state.telemetry[state.telemetry.length - 1];
  const previousDistance = previous.distCm ?? state.config.resumeCm + 10;
  let phase = state.phase;
  let phaseTicks = state.phaseTicks + 1;
  let deviceState: DeviceState = previous.state;
  let pwm = previous.pwm;
  let distance = previousDistance;
  let avoidCount = state.device.avoidCount;
  let events = state.events;
  let nextEventId = state.nextEventId;

  switch (state.phase) {
    case 'CRUISE': {
      const threshold = 8 + Math.round(random() * 6);

      if (state.phaseTicks >= threshold) {
        phase = 'STOP';
        phaseTicks = 0;
        deviceState = 'STOP';
        pwm = 0;
        distance = state.config.stopCm - 2 - random() * 3;
        events = [
          ...events,
          createEvent(nextEventId, now, state.device.mode, 'STOP', 'DEVICE', {
            dist_cm: roundOne(distance),
            reason: 'OBSTACLE',
          }),
        ];
        nextEventId += 1;
      } else {
        deviceState = 'MAJU';
        pwm = state.config.maxPwm - 20 + Math.round(random() * 15);
        distance = clamp(
          previousDistance + (random() * 10 - 5),
          state.config.resumeCm + 5,
          110,
        );
      }
      break;
    }
    case 'STOP': {
      deviceState = 'STOP';
      pwm = 0;
      distance = Math.min(previousDistance, state.config.stopCm - 2);
      if (state.phaseTicks >= 2) {
        phase = 'SCAN';
        phaseTicks = 0;
      }
      break;
    }
    case 'SCAN': {
      deviceState = 'PINDAI';
      pwm = 0;
      distance = previousDistance;
      if (state.phaseTicks >= 2) {
        phase = 'TURN';
        phaseTicks = 0;
      }
      break;
    }
    case 'TURN': {
      deviceState = 'BELOK';
      pwm = Math.round(state.config.maxPwm * 0.75);
      distance = previousDistance + 12;
      if (state.phaseTicks >= 2) {
        phase = 'CRUISE';
        phaseTicks = 0;
        avoidCount += 1;
        events = [
          ...events,
          createEvent(nextEventId, now, state.device.mode, 'AVOID_DONE', 'DEVICE', {
            avoid_count: avoidCount,
          }),
        ];
        nextEventId += 1;
      }
      break;
    }
  }

  const latest = createTelemetry(
    now,
    state.device.mode,
    deviceState,
    pwm,
    distance,
    avoidCount,
    -55 - Math.round(random() * 12),
  );

  return {
    ...state,
    device: {
      ...state.device,
      state: deviceState,
      lastSeen: now.toISOString(),
      online: true,
      avoidCount,
    },
    telemetry: trimTelemetry([...state.telemetry, latest], now),
    events: trimEvents(events, now),
    rttMs: 165 + Math.round(random() * 45),
    phase,
    phaseTicks,
    nextEventId,
  };
}

function advanceManual(
  state: SimulationState,
  now: Date,
  random: () => number,
): SimulationState {
  const previous = state.telemetry[state.telemetry.length - 1];
  const previousDistance = previous.distCm ?? state.config.resumeCm + 10;
  let deviceState = state.device.state;
  let pwm = state.manualPwm;
  let distance = previousDistance;
  let events = state.events;
  let nextEventId = state.nextEventId;
  let lastDriveAt = state.lastDriveAt;
  let manualPwm = state.manualPwm;

  const driveAge = now.getTime() - lastDriveAt;
  const shouldTimeout = state.controller === null || driveAge > 500;

  if (shouldTimeout) {
    if (previous.state !== 'STOP' || previous.pwm !== 0) {
      deviceState = 'STOP';
      manualPwm = 0;
      pwm = 0;
      lastDriveAt = now.getTime();
      events = [
        ...events,
        createEvent(nextEventId, now, state.device.mode, 'MANUAL_TIMEOUT', 'DEVICE', {
          reason: 'TTL',
        }),
      ];
      nextEventId += 1;
    }
    deviceState = 'STOP';
    manualPwm = 0;
    pwm = 0;
  } else {
    distance = clamp(previousDistance + (random() * 8 - 4), 10, 130);
    if (deviceState === 'MAJU' && distance <= state.config.stopCm) {
      deviceState = 'STOP';
      manualPwm = 0;
      pwm = 0;
      events = [
        ...events,
        createEvent(nextEventId, now, state.device.mode, 'MANUAL_BLOCKED', 'DEVICE', {
          dist_cm: roundOne(distance),
          reason: 'OBSTACLE',
        }),
      ];
      nextEventId += 1;
    }
  }

  const latest = createTelemetry(
    now,
    state.device.mode,
    deviceState,
    pwm,
    distance,
    state.device.avoidCount,
    -55 - Math.round(random() * 12),
  );

  return {
    ...state,
    device: {
      ...state.device,
      state: deviceState,
      lastSeen: now.toISOString(),
      online: true,
    },
    telemetry: trimTelemetry([...state.telemetry, latest], now),
    events: trimEvents(events, now),
    rttMs: 165 + Math.round(random() * 45),
    lastDriveAt,
    manualPwm,
    nextEventId,
  };
}

export function advanceSimulation(
  state: SimulationState,
  now: Date = new Date(),
  random: () => number = Math.random,
): SimulationState {
  if (state.autoPaused && state.device.mode === 'AUTO') {
    const previous = state.telemetry[state.telemetry.length - 1];
    const latest = createTelemetry(
      now,
      state.device.mode,
      'STOP',
      0,
      previous.distCm ?? state.config.resumeCm,
      state.device.avoidCount,
      -55 - Math.round(random() * 12),
    );

    return {
      ...state,
      device: {
        ...state.device,
        state: 'STOP',
        lastSeen: now.toISOString(),
        online: true,
      },
      telemetry: trimTelemetry([...state.telemetry, latest], now),
      rttMs: 165 + Math.round(random() * 45),
      phase: 'CRUISE',
      phaseTicks: 0,
    };
  }

  if (state.device.mode === 'MANUAL') {
    return advanceManual(state, now, random);
  }

  return advanceAuto(state, now, random);
}

export function applyStart(state: SimulationState, now: Date = new Date()): SimulationState {
  if (state.device.mode !== 'AUTO') {
    return state;
  }

  const previous = state.telemetry[state.telemetry.length - 1];
  const latest = createTelemetry(
    now,
    state.device.mode,
    'MAJU',
    state.config.maxPwm - 20,
    previous.distCm ?? state.config.resumeCm + 10,
    state.device.avoidCount,
    previous.rssi ?? -60,
  );
  const event = createEvent(state.nextEventId, now, state.device.mode, 'START', 'SERVER', {
    cmd: 'START',
  });

  return {
    ...state,
    device: {
      ...state.device,
      state: 'MAJU',
      lastSeen: now.toISOString(),
      online: true,
    },
    telemetry: trimTelemetry([...state.telemetry, latest], now),
    events: trimEvents([...state.events, event], now),
    nextEventId: state.nextEventId + 1,
    phase: 'CRUISE',
    phaseTicks: 0,
    autoPaused: false,
    lastDriveAt: now.getTime(),
    manualPwm: 0,
  };
}

export function applyStop(state: SimulationState, now: Date = new Date()): SimulationState {
  const previous = state.telemetry[state.telemetry.length - 1];
  const latest = createTelemetry(
    now,
    state.device.mode,
    'STOP',
    0,
    previous.distCm ?? state.config.resumeCm,
    state.device.avoidCount,
    previous.rssi ?? -60,
  );
  const event = createEvent(state.nextEventId, now, state.device.mode, 'STOP', 'SERVER', {
    reason: 'MANUAL',
  });

  return {
    ...state,
    device: {
      ...state.device,
      state: 'STOP',
      lastSeen: now.toISOString(),
      online: true,
    },
    telemetry: trimTelemetry([...state.telemetry, latest], now),
    events: trimEvents([...state.events, event], now),
    nextEventId: state.nextEventId + 1,
    autoPaused: state.device.mode === 'AUTO',
    phase: 'CRUISE',
    phaseTicks: 0,
    lastDriveAt: 0,
    manualPwm: 0,
  };
}

export function applySetMode(
  state: SimulationState,
  mode: DeviceMode,
  now: Date = new Date(),
): SimulationState {
  if (state.device.state !== 'STOP' || state.device.mode === mode) {
    return state;
  }

  const controller =
    mode === 'MANUAL'
      ? { username: 'admin', until: new Date(now.getTime() + 30000).toISOString() }
      : null;
  const event = createEvent(state.nextEventId, now, mode, 'SET_MODE', 'SERVER', { mode });

  return {
    ...state,
    device: {
      ...state.device,
      mode,
      state: 'STOP',
      lastSeen: now.toISOString(),
      online: true,
    },
    events: trimEvents([...state.events, event], now),
    nextEventId: state.nextEventId + 1,
    controller,
    controlSid: controller === null ? state.controlSid : state.controlSid + 1,
    lastDriveAt: 0,
    manualPwm: 0,
    autoPaused: false,
    phase: 'CRUISE',
    phaseTicks: 0,
  };
}

export function applyDrive(
  state: SimulationState,
  direction: DriveDirection,
  speed: number,
  now: Date = new Date(),
  random: () => number = Math.random,
): SimulationState {
  if (state.device.mode !== 'MANUAL' || state.controller === null) {
    return state;
  }

  const previous = state.telemetry[state.telemetry.length - 1];
  const distance = previous.distCm ?? state.config.resumeCm + 10;
  const pwm = Math.round((clamp(speed, 0, 100) / 100) * state.config.manualMaxPwm);

  if (direction === 'S') {
    const shouldRecord = previous.state !== 'STOP' || previous.pwm !== 0;
    const stopPoint = createTelemetry(
      now,
      state.device.mode,
      'STOP',
      0,
      distance,
      state.device.avoidCount,
      previous.rssi ?? -60,
    );

    return {
      ...state,
      device: { ...state.device, state: 'STOP', lastSeen: now.toISOString() },
      telemetry: shouldRecord
        ? trimTelemetry([...state.telemetry, stopPoint], now)
        : state.telemetry,
      lastDriveAt: now.getTime(),
      manualPwm: 0,
      rttMs: 165 + Math.round(random() * 45),
    };
  }

  const sensorUnsafe = !previous.valid || previous.distCm === null;
  const forwardBlocked = direction === 'F' && (sensorUnsafe || distance <= state.config.stopCm);

  if (sensorUnsafe || forwardBlocked) {
    const event = createEvent(
      state.nextEventId,
      now,
      state.device.mode,
      'MANUAL_BLOCKED',
      'DEVICE',
      {
        dist_cm: previous.distCm,
        reason: sensorUnsafe ? 'INVALID' : 'OBSTACLE',
      },
    );

    return {
      ...state,
      device: { ...state.device, state: 'STOP', lastSeen: now.toISOString() },
      events: trimEvents([...state.events, event], now),
      nextEventId: state.nextEventId + 1,
      lastDriveAt: now.getTime(),
      manualPwm: 0,
      rttMs: 165 + Math.round(random() * 45),
    };
  }

  const nextState: DeviceState = direction === 'F' ? 'MAJU' : 'BELOK';
  const latest = createTelemetry(
    now,
    state.device.mode,
    nextState,
    pwm,
    distance,
    state.device.avoidCount,
    previous.rssi ?? -60,
  );

  return {
    ...state,
    device: { ...state.device, state: nextState, lastSeen: now.toISOString() },
    telemetry: trimTelemetry([...state.telemetry, latest], now),
    lastDriveAt: now.getTime(),
    manualPwm: pwm,
    rttMs: 165 + Math.round(random() * 45),
  };
}

export function acquireControl(state: SimulationState, now: Date = new Date()): SimulationState {
  if (state.device.mode !== 'MANUAL') {
    return state;
  }

  return {
    ...state,
    controller: {
      username: 'admin',
      until: new Date(now.getTime() + 30000).toISOString(),
    },
    controlSid: state.controlSid + 1,
    lastDriveAt: now.getTime(),
  };
}

export function releaseControl(state: SimulationState, now: Date = new Date()): SimulationState {
  return {
    ...state,
    controller: null,
    device: { ...state.device, state: 'STOP', lastSeen: now.toISOString() },
    lastDriveAt: 0,
    manualPwm: 0,
  };
}

export function applyConfig(
  state: SimulationState,
  config: Omit<DeviceConfig, 'ver' | 'updatedAt'>,
  now: Date = new Date(),
): SimulationState {
  const event = createEvent(state.nextEventId, now, state.device.mode, 'CONFIG_UPDATE', 'SERVER', {
    ver: state.config.ver + 1,
  });

  return {
    ...state,
    config: {
      ...config,
      ver: state.config.ver + 1,
      updatedAt: now.toISOString(),
    },
    events: trimEvents([...state.events, event], now),
    nextEventId: state.nextEventId + 1,
  };
}
