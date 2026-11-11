import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { APP_EVENTS, type ControlUpdatedEvent, type RttMeasuredEvent } from '../common/app-events';
import { Env } from '../config/env.validation';
import { DeviceService } from '../devices/devices.service';
import { MQTT_EVENTS, driveTopic, pingTopic, type PongReceivedEvent } from '../mqtt/mqtt.constants';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcquireResult,
  ControlStatusItem,
  DriveDir,
  DriveRejectionReason,
} from './control.constants';

@Injectable()
export class ControlService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ControlService.name);

  private readonly lockTtlSeconds: number;
  private readonly maxRttMs: number;
  private readonly driveRateLimitPerSec: number;
  private readonly driveTtlMs: number;
  private readonly telemetryMaxAgeMs: number;

  private readonly driveSeq = new Map<string, number>();
  private readonly lastRtt = new Map<string, number>();
  private readonly pingSeq = new Map<string, number>();
  private readonly driveTimestamps = new Map<string, number[]>();

  private pingTimer: NodeJS.Timeout | null = null;
  private pingTick = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
    private readonly mqtt: MqttService,
    private readonly config: ConfigService<Env, true>,
    private readonly emitter: EventEmitter2,
  ) {
    this.lockTtlSeconds = this.config.get<number>('CONTROL_LOCK_TTL_SECONDS', { infer: true });
    this.maxRttMs = this.config.get<number>('MANUAL_MAX_RTT_MS', { infer: true });
    this.driveRateLimitPerSec = this.config.get<number>('DRIVE_RATE_LIMIT_PER_SEC', { infer: true });
    this.driveTtlMs = this.config.get<number>('DRIVE_TTL_MS', { infer: true });
    this.telemetryMaxAgeMs =
      this.config.get<number>('TELEMETRY_MAX_AGE_SECONDS', { infer: true }) * 1000;
  }

  onModuleInit(): void {
    // Run ping tick every 2 seconds
    this.pingTimer = setInterval(() => {
      void this.executePingTick().catch((err) => {
        this.logger.error('Error during ping tick', err);
      });
    }, 2000);
  }

  onModuleDestroy(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  async getControl(deviceId: string): Promise<ControlStatusItem> {
    await this.devices.ensureDevice(deviceId);

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { controlUser: { select: { username: true } } },
    });

    if (device === null) {
      throw new ConflictException({ code: 'NOT_FOUND', message: 'Device not found' });
    }

    const now = new Date();
    const isLocked =
      device.controlUserId !== null &&
      device.controlUntil !== null &&
      device.controlUntil > now;

    const controller =
      isLocked && device.controlUser !== null && device.controlUntil !== null
        ? { username: device.controlUser.username, until: device.controlUntil.toISOString() }
        : null;

    return {
      mode: device.mode,
      state: device.state,
      controller,
      sid: device.controlEpoch,
      rttMs: this.lastRtt.get(deviceId) ?? null,
    };
  }

  async acquire(
    deviceId: string,
    userId: string,
    username: string,
  ): Promise<AcquireResult> {
    await this.devices.ensureDevice(deviceId);

    const current = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { controlUser: { select: { username: true } } },
    });

    if (current === null) {
      throw new ConflictException({ code: 'NOT_FOUND', message: 'Device not found' });
    }

    if (!current.online) {
      throw new ConflictException({
        code: 'DEVICE_OFFLINE',
        message: 'Device is offline',
      });
    }

    const now = new Date();
    const isLocked =
      current.controlUserId !== null &&
      current.controlUntil !== null &&
      current.controlUntil > now &&
      current.controlUserId !== userId;

    if (isLocked) {
      throw new ConflictException({
        code: 'CONTROL_TAKEN',
        message: 'Control lock is currently held by another user',
        details: [
          {
            holder: current.controlUser?.username ?? 'another user',
            until: current.controlUntil?.toISOString() ?? '',
          },
        ],
      });
    }

    const newSid = current.controlEpoch + 1;
    const expiresAt = new Date(Date.now() + this.lockTtlSeconds * 1000);

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        controlUserId: userId,
        controlEpoch: newSid,
        controlUntil: expiresAt,
      },
    });

    this.driveSeq.set(deviceId, 0);

    const event: ControlUpdatedEvent = {
      deviceId,
      controller: { username, until: expiresAt.toISOString() },
      sid: newSid,
    };
    this.emitter.emit(APP_EVENTS.controlUpdated, event);

    return {
      sid: newSid,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async release(deviceId: string, userId: string): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { controlUserId: true, controlEpoch: true },
    });

    if (device === null || device.controlUserId !== userId) {
      return;
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        controlUserId: null,
        controlUntil: null,
      },
    });

    // Best effort drive S to stop the car
    const nextSeq = (this.driveSeq.get(deviceId) ?? 0) + 1;
    this.driveSeq.set(deviceId, nextSeq);

    this.mqtt.publish(
      driveTopic(deviceId),
      {
        sid: device.controlEpoch,
        seq: nextSeq,
        dir: 'S',
        spd: 0,
        ttl_ms: 500,
      },
      { qos: 0, retain: false },
    );

    const event: ControlUpdatedEvent = {
      deviceId,
      controller: null,
      sid: device.controlEpoch,
    };
    this.emitter.emit(APP_EVENTS.controlUpdated, event);
  }

  async handleHeartbeat(deviceId: string, userId: string): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { controlUser: { select: { username: true } } },
    });

    const now = new Date();
    if (
      device === null ||
      device.controlUserId !== userId ||
      device.controlUntil === null ||
      device.controlUntil <= now
    ) {
      return;
    }

    const expiresAt = new Date(Date.now() + this.lockTtlSeconds * 1000);

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { controlUntil: expiresAt },
    });

    const event: ControlUpdatedEvent = {
      deviceId,
      controller: {
        username: device.controlUser?.username ?? '',
        until: expiresAt.toISOString(),
      },
      sid: device.controlEpoch,
    };
    this.emitter.emit(APP_EVENTS.controlUpdated, event);
  }

  async handleSocketDisconnect(userId: string): Promise<void> {
    const devices = await this.prisma.device.findMany({
      where: { controlUserId: userId },
      select: { id: true },
    });

    for (const d of devices) {
      await this.release(d.id, userId);
    }
  }

  async handleDrive(
    deviceId: string,
    userId: string,
    dir: DriveDir,
    spd: number,
  ): Promise<{ ok: boolean; reason?: DriveRejectionReason }> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        online: true,
        mode: true,
        controlUserId: true,
        controlUntil: true,
        controlEpoch: true,
      },
    });

    const now = Date.now();

    // 1. Holder check
    if (
      device === null ||
      device.controlUserId !== userId ||
      device.controlUntil === null ||
      device.controlUntil.getTime() <= now
    ) {
      return { ok: false, reason: 'NOT_HOLDER' };
    }

    // 2. Online check
    if (!device.online) {
      return { ok: false, reason: 'DEVICE_OFFLINE' };
    }

    // 3. Mode check
    if (device.mode !== 'MANUAL') {
      return { ok: false, reason: 'NOT_MANUAL' };
    }

    // 4. Telemetry freshness check (< 5s)
    const latest = await this.prisma.telemetry.findFirst({
      where: { deviceId },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      select: { ts: true },
    });

    if (latest === null || now - latest.ts.getTime() > this.telemetryMaxAgeMs) {
      return { ok: false, reason: 'STALE_DATA' };
    }

    // 5. RTT check (dir !== 'S')
    const rtt = this.lastRtt.get(deviceId);
    if (dir !== 'S' && rtt !== undefined && rtt > this.maxRttMs) {
      return { ok: false, reason: 'RTT_TOO_HIGH' };
    }

    // 6. Rate limit check (max per second per user)
    const userTimestamps = this.driveTimestamps.get(userId) ?? [];
    const oneSecAgo = now - 1000;
    const recent = userTimestamps.filter((ts) => ts > oneSecAgo);

    if (recent.length >= this.driveRateLimitPerSec) {
      return { ok: false, reason: 'RATE_LIMITED' };
    }

    recent.push(now);
    this.driveTimestamps.set(userId, recent);

    // Renew hold-to-move lock
    const newUntil = new Date(now + this.lockTtlSeconds * 1000);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { controlUntil: newUntil },
    });

    const nextSeq = (this.driveSeq.get(deviceId) ?? 0) + 1;
    this.driveSeq.set(deviceId, nextSeq);

    this.mqtt.publish(
      driveTopic(deviceId),
      {
        sid: device.controlEpoch,
        seq: nextSeq,
        dir,
        spd,
        ttl_ms: this.driveTtlMs,
      },
      { qos: 0, retain: false },
    );

    return { ok: true };
  }

  @OnEvent(MQTT_EVENTS.pong)
  handlePong(event: PongReceivedEvent): void {
    const now = Date.now();
    const rttMs = Math.max(0, now - event.payload.t);
    this.lastRtt.set(event.deviceId, rttMs);

    const rttEvent: RttMeasuredEvent = {
      deviceId: event.deviceId,
      rttMs,
      ts: new Date().toISOString(),
    };
    this.emitter.emit(APP_EVENTS.rttMeasured, rttEvent);
  }

  private async executePingTick(): Promise<void> {
    this.pingTick += 2;
    const now = new Date();

    const onlineDevices = await this.prisma.device.findMany({
      where: { online: true },
      select: { id: true, controlUserId: true, controlUntil: true },
    });

    for (const d of onlineDevices) {
      const hasActiveHolder =
        d.controlUserId !== null && d.controlUntil !== null && d.controlUntil > now;

      // Ping every 2s for active holder, or every 10s if idle
      if (hasActiveHolder || this.pingTick % 10 === 0) {
        const nextSeq = (this.pingSeq.get(d.id) ?? 0) + 1;
        this.pingSeq.set(d.id, nextSeq);

        this.mqtt.publish(
          pingTopic(d.id),
          { seq: nextSeq, t: Date.now() },
          { qos: 0, retain: false },
        );
      }
    }
  }
}
