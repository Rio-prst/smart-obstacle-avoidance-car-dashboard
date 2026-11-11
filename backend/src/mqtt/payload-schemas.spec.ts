import {
  commandAckPayloadSchema,
  deviceEventPayloadSchema,
  pongPayloadSchema,
  statusPayloadSchema,
  telemetryPayloadSchema,
  type TelemetryPayload,
} from './payload-schemas';

function createTelemetry(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    seq: 1,
    ts: 0,
    mode: 'AUTO',
    dist_cm: 40,
    valid: true,
    state: 'MAJU',
    pwm: 180,
    avoid_count: 0,
    rssi: -60,
    ...overrides,
  };
}

describe('telemetryPayloadSchema', () => {
  it('accepts a valid AUTO payload', () => {
    const result = telemetryPayloadSchema.safeParse(createTelemetry());

    expect(result.success).toBe(true);
  });

  it('accepts a valid payload with invalid sensor reading', () => {
    const result = telemetryPayloadSchema.safeParse(
      createTelemetry({ valid: false, dist_cm: null, rssi: null, state: 'STOP' }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects PINDAI state outside AUTO mode', () => {
    const result = telemetryPayloadSchema.safeParse(
      createTelemetry({ mode: 'MANUAL', state: 'PINDAI' }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects valid reading without distance', () => {
    const result = telemetryPayloadSchema.safeParse(createTelemetry({ valid: true, dist_cm: null }));

    expect(result.success).toBe(false);
  });

  it('rejects invalid reading with distance', () => {
    const result = telemetryPayloadSchema.safeParse(createTelemetry({ valid: false, dist_cm: 40 }));

    expect(result.success).toBe(false);
  });

  it('rejects distance outside range', () => {
    expect(telemetryPayloadSchema.safeParse(createTelemetry({ dist_cm: 1 })).success).toBe(false);
    expect(telemetryPayloadSchema.safeParse(createTelemetry({ dist_cm: 401 })).success).toBe(false);
  });

  it('rejects pwm above 255', () => {
    const result = telemetryPayloadSchema.safeParse(createTelemetry({ pwm: 256 }));

    expect(result.success).toBe(false);
  });

  it('rejects positive rssi', () => {
    const result = telemetryPayloadSchema.safeParse(createTelemetry({ rssi: 10 }));

    expect(result.success).toBe(false);
  });

  it('rejects missing seq', () => {
    const { seq: _seq, ...payload } = createTelemetry();
    const result = telemetryPayloadSchema.safeParse(payload);

    expect(result.success).toBe(false);
  });
});

describe('statusPayloadSchema', () => {
  it('accepts minimal online status', () => {
    const result = statusPayloadSchema.safeParse({ online: true });

    expect(result.success).toBe(true);
  });

  it('accepts LWT offline status without fields', () => {
    const result = statusPayloadSchema.safeParse({ online: false });

    expect(result.success).toBe(true);
  });

  it('accepts status with firmware and boot timestamp', () => {
    const result = statusPayloadSchema.safeParse({
      online: true,
      fw: 'v1.2.0',
      boot_ts: 1770000000,
    });

    expect(result.success).toBe(true);
  });

  it('rejects missing online flag', () => {
    const result = statusPayloadSchema.safeParse({ fw: 'v1.2.0' });

    expect(result.success).toBe(false);
  });
});

describe('deviceEventPayloadSchema', () => {
  it('accepts a valid avoid done event', () => {
    const result = deviceEventPayloadSchema.safeParse({
      seq: 3,
      ts: 1770000000,
      type: 'AVOID_DONE',
      mode: 'AUTO',
      detail: { dist_cm: 12, from: 'MAJU', to: 'BELOK' },
    });

    expect(result.success).toBe(true);
  });

  it('accepts event with empty detail', () => {
    const result = deviceEventPayloadSchema.safeParse({
      seq: 4,
      ts: 1770000001,
      type: 'MODE_CHANGE',
      mode: 'AUTO',
      detail: {},
    });

    expect(result.success).toBe(true);
  });

  it('rejects unknown event type', () => {
    const result = deviceEventPayloadSchema.safeParse({
      seq: 5,
      ts: 1770000002,
      type: 'OBSTACLE_AVOIDED',
      mode: 'AUTO',
      detail: {},
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing mode', () => {
    const result = deviceEventPayloadSchema.safeParse({
      seq: 6,
      ts: 1770000003,
      type: 'MODE_CHANGE',
      detail: {},
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing detail', () => {
    const result = deviceEventPayloadSchema.safeParse({
      seq: 7,
      ts: 1770000004,
      type: 'MODE_CHANGE',
      mode: 'AUTO',
    });

    expect(result.success).toBe(false);
  });
});

describe('commandAckPayloadSchema', () => {
  it('accepts a successful ack', () => {
    const result = commandAckPayloadSchema.safeParse({ seq: 55, ok: true, reason: null });

    expect(result.success).toBe(true);
  });

  it('accepts a failed ack with reason', () => {
    const result = commandAckPayloadSchema.safeParse({
      seq: 55,
      ok: false,
      reason: 'WRONG_MODE',
      ts: 1770000001,
    });

    expect(result.success).toBe(true);
  });

  it('accepts config ack with cfg_ver', () => {
    const result = commandAckPayloadSchema.safeParse({ seq: 0, ok: true, cfg_ver: 4 });

    expect(result.success).toBe(true);
  });

  it('rejects unknown reason', () => {
    const result = commandAckPayloadSchema.safeParse({ seq: 55, ok: false, reason: 'NOPE' });

    expect(result.success).toBe(false);
  });

  it('rejects missing seq', () => {
    const result = commandAckPayloadSchema.safeParse({ ok: true });

    expect(result.success).toBe(false);
  });
});

describe('pongPayloadSchema', () => {
  it('accepts pong with latency', () => {
    const result = pongPayloadSchema.safeParse({ seq: 9, t: 123 });

    expect(result.success).toBe(true);
  });

  it('rejects missing t', () => {
    const result = pongPayloadSchema.safeParse({ seq: 9 });

    expect(result.success).toBe(false);
  });
});
