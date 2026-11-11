import { z } from 'zod';

export const deviceModes = ['AUTO', 'MANUAL'] as const;
export const deviceStates = ['STOP', 'MAJU', 'PINDAI', 'BELOK'] as const;

export const deviceEventTypes = [
  'STOP',
  'MAJU',
  'PINDAI',
  'BELOK',
  'BOOT',
  'AVOID_DONE',
  'SENSOR_FAIL',
  'STOP_BUTTON',
  'CMD_REJECTED',
  'MODE_CHANGE',
  'MANUAL_BLOCKED',
  'MANUAL_TIMEOUT',
] as const;

export const serverEventTypes = ['DEVICE_ONLINE', 'DEVICE_OFFLINE'] as const;

export const commandAckReasons = [
  'EXPIRED',
  'SENSOR_NOT_READY',
  'TIME_NOT_SYNCED',
  'INVALID',
  'DUPLICATE',
  'WRONG_MODE',
  'NOT_STOPPED',
] as const;

export const telemetryPayloadSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    ts: z.number().int().nonnegative(),
    mode: z.enum(deviceModes),
    dist_cm: z.number().min(2).max(400).nullable(),
    valid: z.boolean(),
    state: z.enum(deviceStates),
    pwm: z.number().int().min(0).max(255),
    avoid_count: z.number().int().nonnegative(),
    rssi: z.number().int().nonpositive().nullable(),
  })
  .refine((payload) => payload.state !== 'PINDAI' || payload.mode === 'AUTO', {
    message: 'state PINDAI is only allowed in AUTO mode',
  })
  .refine((payload) => payload.valid === (payload.dist_cm !== null), {
    message: 'dist_cm must be set when valid and null when invalid',
  });

export const statusPayloadSchema = z.object({
  online: z.boolean(),
  fw: z.string().min(1).max(32).optional(),
  boot_ts: z.number().int().nonnegative().optional(),
});

export const deviceEventPayloadSchema = z.object({
  seq: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative(),
  mode: z.enum(deviceModes),
  type: z.enum(deviceEventTypes),
  detail: z.record(z.unknown()),
});

export const commandAckPayloadSchema = z.object({
  seq: z.number().int().nonnegative(),
  ok: z.boolean(),
  reason: z.enum(commandAckReasons).nullable().optional(),
  ts: z.number().int().nonnegative().optional(),
  cfg_ver: z.number().int().nonnegative().optional(),
});

export const pongPayloadSchema = z.object({
  seq: z.number().int().nonnegative(),
  t: z.number().int().nonnegative(),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
export type StatusPayload = z.infer<typeof statusPayloadSchema>;
export type DeviceEventPayload = z.infer<typeof deviceEventPayloadSchema>;
export type CommandAckPayload = z.infer<typeof commandAckPayloadSchema>;
export type PongPayload = z.infer<typeof pongPayloadSchema>;
