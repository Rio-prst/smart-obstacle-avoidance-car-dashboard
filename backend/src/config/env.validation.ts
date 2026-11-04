import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),

  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD is required'),

  MQTT_URL: z.string().default(''),
  MQTT_USER: z.string().default(''),
  MQTT_PASS: z.string().default(''),
  MQTT_CLIENT_ID_PREFIX: z.string().default('backend'),

  CMD_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  CMD_ACK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(15),

  CONTROL_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(10),
  MANUAL_MAX_RTT_MS: z.coerce.number().int().positive().default(500),
  DRIVE_RATE_LIMIT_PER_SEC: z.coerce.number().int().positive().default(10),
  DRIVE_TTL_MS: z.coerce.number().int().min(100).max(500).default(500),
  PING_INTERVAL_ACTIVE_SECONDS: z.coerce.number().int().positive().default(2),
  PING_INTERVAL_IDLE_SECONDS: z.coerce.number().int().positive().default(10),

  TELEMETRY_SAMPLE_INTERVAL_SECONDS: z.coerce.number().positive().default(2),
  TELEMETRY_MAX_AGE_SECONDS: z.coerce.number().positive().default(5),
  RETENTION_TELEMETRY_DAYS: z.coerce.number().int().positive().default(14),
  RETENTION_EVENTS_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_COMMANDS_DAYS: z.coerce.number().int().positive().default(30),

  ANALYTICS_STOP_MARGIN_CM: z.coerce.number().int().nonnegative().default(10),
  EXPORT_MAX_RANGE_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }

  return parsed.data;
}
