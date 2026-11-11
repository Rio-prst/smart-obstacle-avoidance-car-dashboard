import type { DeviceConfigItem } from '../device-config/device-config.service';
import type { CommandItem } from '../commands/commands.service';
import type { EventItem } from '../events/events.service';

export const APP_EVENTS = {
  eventRecorded: 'app.event.recorded',
  deviceStatus: 'app.device.status',
  commandUpdated: 'app.command.updated',
  configUpdated: 'app.config.updated',
  controlUpdated: 'app.control.updated',
  rttMeasured: 'app.control.rtt',
  driveRejected: 'app.control.drive.rejected',
} as const;

export interface EventRecordedEvent {
  deviceId: string;
  event: EventItem;
}

export interface DeviceStatusEvent {
  deviceId: string;
  online: boolean;
  lastSeen: string | null;
}

export interface CommandUpdateEvent {
  deviceId: string;
  command: Omit<CommandItem, 'payload' | 'createdAt' | 'ackedAt'>;
}

export interface ConfigUpdatedEvent {
  deviceId: string;
  config: Omit<DeviceConfigItem, 'updatedAt'>;
}

export interface ControlUpdatedEvent {
  deviceId: string;
  controller: { username: string; until: string } | null;
  sid: number;
}

export interface RttMeasuredEvent {
  deviceId: string;
  rttMs: number;
  ts: string;
}

export interface DriveRejectedEvent {
  deviceId: string;
  socketId: string;
  reason: string;
}
