import { Injectable } from '@nestjs/common';
import type { StatusPayload, TelemetryPayload } from '../mqtt/payload-schemas';

export interface DeviceSnapshot {
  deviceId: string;
  online: boolean;
  mode: DeviceSnapshotMode;
  state: DeviceSnapshotState;
  fw: string | null;
  lastSeen: Date | null;
  avoidCount: number;
  latestTelemetry: TelemetryPayload | null;
  lastTelemetryAt: Date | null;
}

export type DeviceSnapshotMode = 'AUTO' | 'MANUAL';
export type DeviceSnapshotState = 'STOP' | 'MAJU' | 'PINDAI' | 'BELOK';

@Injectable()
export class DeviceStateService {
  private readonly snapshots = new Map<string, DeviceSnapshot>();

  applyTelemetry(deviceId: string, payload: TelemetryPayload, receivedAt: Date): void {
    const snapshot = this.ensure(deviceId);

    snapshot.online = true;
    snapshot.mode = payload.mode;
    snapshot.state = payload.state;
    snapshot.avoidCount = payload.avoid_count;
    snapshot.lastSeen = receivedAt;
    snapshot.latestTelemetry = payload;
    snapshot.lastTelemetryAt = receivedAt;
  }

  applyStatus(deviceId: string, payload: StatusPayload, receivedAt: Date): void {
    const snapshot = this.ensure(deviceId);

    if (payload.online) {
      snapshot.online = true;
      snapshot.lastSeen = receivedAt;
    } else {
      snapshot.online = false;
    }

    if (payload.fw !== undefined) {
      snapshot.fw = payload.fw;
    }
  }

  markOffline(deviceId: string): void {
    const snapshot = this.snapshots.get(deviceId);

    if (snapshot) {
      snapshot.online = false;
    }
  }

  get(deviceId: string): DeviceSnapshot | null {
    return this.snapshots.get(deviceId) ?? null;
  }

  private ensure(deviceId: string): DeviceSnapshot {
    let snapshot = this.snapshots.get(deviceId);

    if (!snapshot) {
      snapshot = {
        deviceId,
        online: false,
        mode: 'AUTO',
        state: 'STOP',
        fw: null,
        lastSeen: null,
        avoidCount: 0,
        latestTelemetry: null,
        lastTelemetryAt: null,
      };
      this.snapshots.set(deviceId, snapshot);
    }

    return snapshot;
  }
}
