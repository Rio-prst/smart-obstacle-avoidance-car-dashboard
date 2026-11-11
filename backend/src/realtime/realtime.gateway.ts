import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import {
  APP_EVENTS,
  type CommandUpdateEvent,
  type ConfigUpdatedEvent,
  type ControlUpdatedEvent,
  type DeviceStatusEvent,
  type EventRecordedEvent,
  type RttMeasuredEvent,
} from '../common/app-events';
import {
  driveMessageSchema,
  heartbeatMessageSchema,
} from '../control/control.constants';
import { ControlService } from '../control/control.service';
import { MQTT_EVENTS, type TelemetryReceivedEvent } from '../mqtt/mqtt.constants';
import type { TelemetryPayload } from '../mqtt/payload-schemas';

interface SocketJwtPayload {
  sub: string;
  username: string;
}

export interface SubscribeAck {
  ok: boolean;
  code?: string;
}

const subscriptionSchema = z.object({
  deviceId: z.string().min(1).max(64),
});

function roomFor(deviceId: string): string {
  return `device:${deviceId}`;
}

function toTelemetryTimestamp(payload: TelemetryPayload, receivedAt: Date): string {
  return (payload.ts > 0 ? new Date(payload.ts * 1000) : receivedAt).toISOString();
}

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly control: ControlService,
  ) {}

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = client.data.user as { username: string } | undefined;
    this.logger.debug(`Realtime client connected: ${user?.username ?? 'unknown'}`);
  }

  handleDisconnect(client: Socket): void {
    const user = client.data.user as { id: string } | undefined;
    if (user?.id) {
      void this.control.handleSocketDisconnect(user.id);
    }
    this.logger.debug(`Realtime client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): SubscribeAck {
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return { ok: false, code: 'INVALID' };
    }

    client.join(roomFor(parsed.data.deviceId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): SubscribeAck {
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return { ok: false, code: 'INVALID' };
    }

    client.leave(roomFor(parsed.data.deviceId));
    return { ok: true };
  }

  @SubscribeMessage('drive')
  async handleDrive(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const user = client.data.user as { id: string; username: string } | undefined;
    if (!user) {
      client.emit('drive.rejected', { reason: 'NOT_HOLDER' });
      return;
    }

    const parsed = driveMessageSchema.safeParse(body);
    if (!parsed.success) {
      client.emit('drive.rejected', { reason: 'INVALID' });
      return;
    }

    const result = await this.control.handleDrive(
      parsed.data.deviceId,
      user.id,
      parsed.data.dir,
      parsed.data.spd,
    );

    if (!result.ok) {
      client.emit('drive.rejected', {
        deviceId: parsed.data.deviceId,
        reason: result.reason,
      });
    }
  }

  @SubscribeMessage('control.heartbeat')
  async handleHeartbeat(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const user = client.data.user as { id: string; username: string } | undefined;
    if (!user) {
      return;
    }

    const parsed = heartbeatMessageSchema.safeParse(body);
    if (!parsed.success) {
      return;
    }

    await this.control.handleHeartbeat(parsed.data.deviceId, user.id);
  }

  @OnEvent(APP_EVENTS.controlUpdated)
  broadcastControlUpdate(event: ControlUpdatedEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('control.update', {
      deviceId: event.deviceId,
      controller: event.controller,
      sid: event.sid,
    });
  }

  @OnEvent(APP_EVENTS.rttMeasured)
  broadcastRtt(event: RttMeasuredEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('rtt', {
      deviceId: event.deviceId,
      rttMs: event.rttMs,
      ts: event.ts,
    });
  }

  @OnEvent(MQTT_EVENTS.telemetry)
  broadcastTelemetry(event: TelemetryReceivedEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('telemetry', {
      deviceId: event.deviceId,
      ts: toTelemetryTimestamp(event.payload, event.receivedAt),
      mode: event.payload.mode,
      distCm: event.payload.valid ? event.payload.dist_cm : null,
      valid: event.payload.valid,
      state: event.payload.state,
      pwm: event.payload.pwm,
      avoidCount: event.payload.avoid_count,
      rssi: event.payload.rssi,
    });
  }

  @OnEvent(APP_EVENTS.deviceStatus)
  broadcastDeviceStatus(event: DeviceStatusEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('status', {
      deviceId: event.deviceId,
      online: event.online,
      lastSeen: event.lastSeen,
    });
  }

  @OnEvent(APP_EVENTS.eventRecorded)
  broadcastEvent(event: EventRecordedEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('event', {
      deviceId: event.deviceId,
      ...event.event,
    });
  }

  @OnEvent(APP_EVENTS.commandUpdated)
  broadcastCommandUpdate(event: CommandUpdateEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('command.update', {
      deviceId: event.deviceId,
      ...event.command,
    });
  }

  @OnEvent(APP_EVENTS.configUpdated)
  broadcastConfigUpdate(event: ConfigUpdatedEvent): void {
    this.server.to(roomFor(event.deviceId)).emit('config.update', {
      deviceId: event.deviceId,
      ...event.config,
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token;

    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('missing token');
    }

    const payload = await this.jwt.verifyAsync<SocketJwtPayload>(token);
    socket.data.user = { id: payload.sub, username: payload.username };
  }
}
