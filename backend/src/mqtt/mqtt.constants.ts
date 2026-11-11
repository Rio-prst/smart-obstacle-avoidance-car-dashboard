import type {
  CommandAckPayload,
  DeviceEventPayload,
  PongPayload,
  StatusPayload,
  TelemetryPayload,
} from './payload-schemas';

export const MQTT_EVENTS = {
  telemetry: 'mqtt.telemetry',
  status: 'mqtt.status',
  deviceEvent: 'mqtt.device-event',
  commandAck: 'mqtt.command-ack',
  pong: 'mqtt.pong',
} as const;

export type DeviceTopicKind = 'telemetry' | 'status' | 'event' | 'cmd/ack' | 'pong';

export interface TelemetryReceivedEvent {
  deviceId: string;
  payload: TelemetryPayload;
  receivedAt: Date;
}

export interface StatusReceivedEvent {
  deviceId: string;
  payload: StatusPayload;
  receivedAt: Date;
}

export interface DeviceEventReceivedEvent {
  deviceId: string;
  payload: DeviceEventPayload;
  receivedAt: Date;
}

export interface CommandAckReceivedEvent {
  deviceId: string;
  payload: CommandAckPayload;
  receivedAt: Date;
}

export interface PongReceivedEvent {
  deviceId: string;
  payload: PongPayload;
  receivedAt: Date;
}

export function parseDeviceTopic(topic: string): { deviceId: string; kind: DeviceTopicKind } | null {
  const match = /^car\/([^/]+)\/(telemetry|status|event|cmd\/ack|pong)$/.exec(topic);

  if (!match) {
    return null;
  }

  return { deviceId: match[1], kind: match[2] as DeviceTopicKind };
}

export function commandTopic(deviceId: string): string {
  return `car/${deviceId}/cmd`;
}

export function configTopic(deviceId: string): string {
  return `car/${deviceId}/config`;
}

export function driveTopic(deviceId: string): string {
  return `car/${deviceId}/drive`;
}

export function pingTopic(deviceId: string): string {
  return `car/${deviceId}/ping`;
}
