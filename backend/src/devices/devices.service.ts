import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Env } from '../config/env.validation';
import { APP_EVENTS } from '../common/app-events';
import { DeviceStateService } from '../device-state/device-state.service';
import { EventsService } from '../events/events.service';
import { MQTT_EVENTS, type StatusReceivedEvent } from '../mqtt/mqtt.constants';
import type { TelemetryPayload } from '../mqtt/payload-schemas';
import { PrismaService } from '../prisma/prisma.service';

export interface DeviceListItem {
  id: string;
  name: string;
  online: boolean;
  mode: 'AUTO' | 'MANUAL';
  state: 'STOP' | 'MAJU' | 'PINDAI' | 'BELOK';
  lastSeen: string | null;
  fw: string | null;
}

export interface DeviceControllerInfo {
  username: string;
  until: string;
}

export interface DeviceDetail extends DeviceListItem {
  avoidCount: number;
  controller: DeviceControllerInfo | null;
}

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly deviceState: DeviceStateService,
    private readonly events: EventsService,
    private readonly emitter: EventEmitter2,
  ) {}

  @OnEvent(MQTT_EVENTS.status)
  handleStatus(event: StatusReceivedEvent): void {
    this.deviceState.applyStatus(event.deviceId, event.payload, event.receivedAt);

    void this.applyStatus(event).catch((error: unknown) => {
      this.logger.warn(
        `Failed to apply status for ${event.deviceId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async detectOfflineDevices(): Promise<void> {
    const thresholdMs = this.config.get('DEVICE_OFFLINE_AFTER_SECONDS', { infer: true }) * 1000;
    const threshold = new Date(Date.now() - thresholdMs);
    const stale = await this.prisma.device.findMany({
      where: { online: true, lastSeen: { lt: threshold } },
      select: { id: true, lastSeen: true },
    });

    for (const device of stale) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { online: false },
      });
      this.deviceState.markOffline(device.id);
      this.emitter.emit(APP_EVENTS.deviceStatus, {
        deviceId: device.id,
        online: false,
        lastSeen: device.lastSeen?.toISOString() ?? null,
      });
      await this.events.recordServerEvent(device.id, 'DEVICE_OFFLINE', { source: 'TIMEOUT' });
    }
  }

  async markSeenFromTelemetry(
    deviceId: string,
    payload: TelemetryPayload,
    receivedAt: Date,
  ): Promise<boolean> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { online: true },
    });

    if (!device) {
      this.logger.warn(`Telemetry from unknown device ${deviceId} ignored`);
      return false;
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        online: true,
        mode: payload.mode,
        state: payload.state,
        lastSeen: receivedAt,
      },
    });

    if (!device.online) {
      await this.events.recordServerEvent(deviceId, 'DEVICE_ONLINE', {});
      this.emitter.emit(APP_EVENTS.deviceStatus, {
        deviceId,
        online: true,
        lastSeen: receivedAt.toISOString(),
      });
    }

    return true;
  }

  async list(): Promise<DeviceListItem[]> {
    const devices = await this.prisma.device.findMany({ orderBy: { id: 'asc' } });
    return devices.map((device) => this.toListItem(device));
  }

  async get(deviceId: string): Promise<DeviceDetail> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { controlUser: true },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Device ${deviceId} not found`,
      });
    }

    const latest = await this.prisma.telemetry.findFirst({
      where: { deviceId },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      select: { avoidCount: true },
    });

    return {
      ...this.toListItem(device),
      avoidCount: latest?.avoidCount ?? 0,
      controller:
        device.controlUserId !== null &&
        device.controlUser !== null &&
        device.controlUntil !== null
          ? {
              username: device.controlUser.username,
              until: device.controlUntil.toISOString(),
            }
          : null,
    };
  }

  async ensureDevice(deviceId: string): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Device ${deviceId} not found`,
      });
    }
  }

  private async applyStatus(event: StatusReceivedEvent): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { id: event.deviceId },
      select: { online: true },
    });

    if (!device) {
      this.logger.warn(`Status from unknown device ${event.deviceId} ignored`);
      return;
    }

    await this.prisma.device.update({
      where: { id: event.deviceId },
      data: {
        online: event.payload.online,
        lastSeen: event.receivedAt,
        ...(event.payload.fw !== undefined ? { fw: event.payload.fw } : {}),
      },
    });

    if (event.payload.online !== device.online) {
      this.emitter.emit(APP_EVENTS.deviceStatus, {
        deviceId: event.deviceId,
        online: event.payload.online,
        lastSeen: event.receivedAt.toISOString(),
      });
    }

    if (event.payload.online && !device.online) {
      await this.events.recordServerEvent(event.deviceId, 'DEVICE_ONLINE', {});
    }

    if (!event.payload.online && device.online) {
      await this.events.recordServerEvent(event.deviceId, 'DEVICE_OFFLINE', { source: 'LWT' });
    }
  }

  private toListItem(device: {
    id: string;
    name: string;
    online: boolean;
    mode: string;
    state: string;
    lastSeen: Date | null;
    fw: string | null;
  }): DeviceListItem {
    return {
      id: device.id,
      name: device.name,
      online: device.online,
      mode: device.mode as DeviceListItem['mode'],
      state: device.state as DeviceListItem['state'],
      lastSeen: device.lastSeen?.toISOString() ?? null,
      fw: device.fw,
    };
  }
}
