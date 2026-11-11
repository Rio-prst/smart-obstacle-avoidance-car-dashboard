import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import mqtt, { type IClientSubscribeOptions, type MqttClient } from 'mqtt';
import { Env } from '../config/env.validation';
import {
  MQTT_EVENTS,
  parseDeviceTopic,
  type CommandAckReceivedEvent,
  type DeviceEventReceivedEvent,
  type PongReceivedEvent,
  type StatusReceivedEvent,
  type TelemetryReceivedEvent,
} from './mqtt.constants';
import {
  commandAckPayloadSchema,
  deviceEventPayloadSchema,
  pongPayloadSchema,
  statusPayloadSchema,
  telemetryPayloadSchema,
} from './payload-schemas';

const subscriptions: Record<string, IClientSubscribeOptions> = {
  'car/+/telemetry': { qos: 0 },
  'car/+/status': { qos: 1 },
  'car/+/event': { qos: 1 },
  'car/+/cmd/ack': { qos: 1 },
  'car/+/pong': { qos: 0 },
};

export interface MqttPublishOptions {
  qos?: 0 | 1;
  retain?: boolean;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient | null = null;
  private connected = false;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly emitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    const url = this.config.get('MQTT_URL', { infer: true });
    const username = this.config.get('MQTT_USER', { infer: true });
    const password = this.config.get('MQTT_PASS', { infer: true });

    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    if (!url || !username || !password) {
      this.logger.warn('MQTT disabled: MQTT_URL, MQTT_USER, and MQTT_PASS must be set');
      return;
    }

    if (!url.startsWith('mqtts://')) {
      this.logger.warn('MQTT disabled: MQTT_URL must use the mqtts:// scheme (TLS required)');
      return;
    }

    this.connect(url, username, password);
  }

  onModuleDestroy(): void {
    this.client?.end(true);
    this.client = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  publish(topic: string, payload: Record<string, unknown>, options?: MqttPublishOptions): boolean {
    if (this.client === null || !this.connected) {
      this.logger.warn(`MQTT publish skipped (not connected): ${topic}`);
      return false;
    }

    this.client.publish(topic, JSON.stringify(payload), {
      qos: options?.qos ?? 1,
      retain: options?.retain ?? false,
    });

    return true;
  }

  private connect(url: string, username: string, password: string): void {
    const prefix = this.config.get('MQTT_CLIENT_ID_PREFIX', { infer: true });
    const clientId = `${prefix}-${randomBytes(4).toString('hex')}`;

    this.client = mqtt.connect(url, {
      clientId,
      username,
      password,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
      protocolVersion: 4,
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.client?.subscribe(subscriptions, (error) => {
        if (error) {
          this.logger.error(`MQTT subscribe failed: ${error.message}`);
        }
      });
      this.logger.log(`MQTT connected (clientId: ${clientId})`);
    });

    this.client.on('message', (topic, payload) => {
      this.processMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      this.logger.warn(`MQTT connection error: ${error.message}`);
    });

    this.client.on('reconnect', () => {
      this.connected = false;
    });

    this.client.on('close', () => {
      this.connected = false;
    });

    this.client.on('offline', () => {
      this.connected = false;
    });
  }

  processMessage(topic: string, payload: Buffer): void {
    const parsedTopic = parseDeviceTopic(topic);

    if (!parsedTopic) {
      return;
    }

    const { deviceId, kind } = parsedTopic;
    const receivedAt = new Date();

    let parsed: unknown;

    try {
      parsed = JSON.parse(payload.toString('utf8'));
    } catch {
      this.dropInvalid(kind, deviceId, 'malformed JSON');
      return;
    }

    switch (kind) {
      case 'telemetry': {
        const result = telemetryPayloadSchema.safeParse(parsed);

        if (!result.success) {
          this.dropInvalid(kind, deviceId, 'schema validation failed');
          return;
        }

        const event: TelemetryReceivedEvent = { deviceId, payload: result.data, receivedAt };
        this.emitter.emit(MQTT_EVENTS.telemetry, event);
        break;
      }
      case 'status': {
        const result = statusPayloadSchema.safeParse(parsed);

        if (!result.success) {
          this.dropInvalid(kind, deviceId, 'schema validation failed');
          return;
        }

        const event: StatusReceivedEvent = { deviceId, payload: result.data, receivedAt };
        this.emitter.emit(MQTT_EVENTS.status, event);
        break;
      }
      case 'event': {
        const result = deviceEventPayloadSchema.safeParse(parsed);

        if (!result.success) {
          this.dropInvalid(kind, deviceId, 'schema validation failed');
          return;
        }

        const event: DeviceEventReceivedEvent = { deviceId, payload: result.data, receivedAt };
        this.emitter.emit(MQTT_EVENTS.deviceEvent, event);
        break;
      }
      case 'cmd/ack': {
        const result = commandAckPayloadSchema.safeParse(parsed);

        if (!result.success) {
          this.dropInvalid(kind, deviceId, 'schema validation failed');
          return;
        }

        const event: CommandAckReceivedEvent = { deviceId, payload: result.data, receivedAt };
        this.emitter.emit(MQTT_EVENTS.commandAck, event);
        break;
      }
      case 'pong': {
        const result = pongPayloadSchema.safeParse(parsed);

        if (!result.success) {
          this.dropInvalid(kind, deviceId, 'schema validation failed');
          return;
        }

        const event: PongReceivedEvent = { deviceId, payload: result.data, receivedAt };
        this.emitter.emit(MQTT_EVENTS.pong, event);
        break;
      }
    }
  }

  private dropInvalid(kind: string, deviceId: string, reason: string): void {
    this.logger.warn(`Dropped ${kind} payload for ${deviceId}: ${reason}`);
  }
}
