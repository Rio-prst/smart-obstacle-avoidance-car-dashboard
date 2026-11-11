import { z } from 'zod';

export const DRIVE_DIRS = ['F', 'L', 'R', 'S'] as const;
export type DriveDir = (typeof DRIVE_DIRS)[number];

export const DRIVE_REJECTION_REASONS = [
  'NOT_HOLDER',
  'DEVICE_OFFLINE',
  'NOT_MANUAL',
  'STALE_DATA',
  'RTT_TOO_HIGH',
  'RATE_LIMITED',
  'INVALID',
] as const;

export type DriveRejectionReason = (typeof DRIVE_REJECTION_REASONS)[number];

export const driveMessageSchema = z.object({
  deviceId: z.string().min(1).max(64),
  dir: z.enum(DRIVE_DIRS),
  spd: z.number().int().min(0).max(100),
});

export type DriveMessage = z.infer<typeof driveMessageSchema>;

export const heartbeatMessageSchema = z.object({
  deviceId: z.string().min(1).max(64),
});

export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>;

export interface ControlStatusItem {
  mode: string;
  state: string;
  controller: { username: string; until: string } | null;
  sid: number;
  rttMs: number | null;
}

export interface AcquireResult {
  sid: number;
  expiresAt: string;
}
