import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import { ControlService } from '../control/control.service';
import { RealtimeGateway } from './realtime.gateway';
import type { TelemetryPayload } from '../mqtt/payload-schemas';

function telemetry(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    seq: 1,
    ts: 0,
    mode: 'AUTO',
    dist_cm: 40,
    valid: true,
    state: 'MAJU',
    pwm: 180,
    avoid_count: 2,
    rssi: -60,
    ...overrides,
  };
}

describe('RealtimeGateway', () => {
  const verifyAsync = jest.fn();
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });

  const handleDrive = jest.fn();
  const handleHeartbeat = jest.fn();
  const handleSocketDisconnect = jest.fn();

  function createGateway(): RealtimeGateway {
    const jwt = { verifyAsync } as unknown as JwtService;
    const control = {
      handleDrive,
      handleHeartbeat,
      handleSocketDisconnect,
    } as unknown as ControlService;
    const gateway = new RealtimeGateway(jwt, control);
    gateway.server = { to } as unknown as Namespace;
    return gateway;
  }

  beforeEach(() => {
    verifyAsync.mockReset();
    emit.mockReset();
    to.mockClear();
  });

  describe('afterInit', () => {
    it('registers handshake middleware on namespace', () => {
      const use = jest.fn();
      const gateway = createGateway();

      gateway.afterInit({ use } as unknown as Namespace);

      expect(use).toHaveBeenCalledTimes(1);
      expect(typeof use.mock.calls[0][0]).toBe('function');
    });
  });

  describe('handshake middleware', () => {
    function getMiddleware(): (socket: Socket, next: (err?: Error) => void) => void {
      const use = jest.fn();
      createGateway().afterInit({ use } as unknown as Namespace);
      return use.mock.calls[0][0];
    }

    it('accepts connection with valid token', async () => {
      verifyAsync.mockResolvedValueOnce({ sub: '1', username: 'admin' });
      const socket = { handshake: { auth: { token: 'valid-token' } }, data: {} as Record<string, unknown> };
      const next = jest.fn();
      getMiddleware()(socket as unknown as Socket, next);
      await new Promise((resolve) => setImmediate(resolve));

      expect(verifyAsync).toHaveBeenCalledWith('valid-token');
      expect(next).toHaveBeenCalledWith();
      expect(socket.data.user).toEqual({ id: '1', username: 'admin' });
    });

    it('rejects connection with invalid token', async () => {
      verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
      const socket = { handshake: { auth: { token: 'bad-token' } }, data: {} as Record<string, unknown> };
      const next = jest.fn();
      getMiddleware()(socket as unknown as Socket, next);
      await new Promise((resolve) => setImmediate(resolve));

      expect(next).toHaveBeenCalledWith(new Error('UNAUTHORIZED'));
      expect(socket.data.user).toBeUndefined();
    });

    it('rejects connection without token', async () => {
      const socket = { handshake: { auth: {} }, data: {} as Record<string, unknown> };
      const next = jest.fn();
      getMiddleware()(socket as unknown as Socket, next);
      await new Promise((resolve) => setImmediate(resolve));

      expect(verifyAsync).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(new Error('UNAUTHORIZED'));
    });
  });

  describe('subscribe', () => {
    it('joins device room and acks ok', () => {
      const join = jest.fn();
      const client = { join };
      const gateway = createGateway();

      const ack = gateway.handleSubscribe({ deviceId: 'car01' }, client as unknown as Socket);

      expect(ack).toEqual({ ok: true });
      expect(join).toHaveBeenCalledWith('device:car01');
    });

    it('rejects invalid payload', () => {
      const join = jest.fn();
      const client = { join };
      const gateway = createGateway();

      expect(gateway.handleSubscribe('garbage', client as unknown as Socket)).toEqual({
        ok: false,
        code: 'INVALID',
      });
      expect(gateway.handleSubscribe({}, client as unknown as Socket)).toEqual({
        ok: false,
        code: 'INVALID',
      });
      expect(gateway.handleSubscribe({ deviceId: '' }, client as unknown as Socket)).toEqual({
        ok: false,
        code: 'INVALID',
      });
      expect(join).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('leaves device room and acks ok', () => {
      const leave = jest.fn();
      const client = { leave };
      const gateway = createGateway();

      const ack = gateway.handleUnsubscribe({ deviceId: 'car01' }, client as unknown as Socket);

      expect(ack).toEqual({ ok: true });
      expect(leave).toHaveBeenCalledWith('device:car01');
    });

    it('rejects invalid payload', () => {
      const gateway = createGateway();

      expect(gateway.handleUnsubscribe({ deviceId: 42 }, {} as unknown as Socket)).toEqual({
        ok: false,
        code: 'INVALID',
      });
    });
  });

  describe('broadcastTelemetry', () => {
    it('emits mapped telemetry to device room', () => {
      const gateway = createGateway();
      const receivedAt = new Date('2026-11-11T08:00:00Z');

      gateway.broadcastTelemetry({
        deviceId: 'car01',
        payload: telemetry(),
        receivedAt,
      });

      expect(to).toHaveBeenCalledWith('device:car01');
      expect(emit).toHaveBeenCalledWith('telemetry', {
        deviceId: 'car01',
        ts: '2026-11-11T08:00:00.000Z',
        mode: 'AUTO',
        distCm: 40,
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 2,
        rssi: -60,
      });
    });

    it('uses payload timestamp when set', () => {
      const gateway = createGateway();

      gateway.broadcastTelemetry({
        deviceId: 'car01',
        payload: telemetry({ ts: 1770000000 }),
        receivedAt: new Date('2026-11-11T08:00:00Z'),
      });

      expect(emit.mock.calls[0][1].ts).toBe(new Date(1770000000000).toISOString());
    });

    it('nullifies distance for invalid reading', () => {
      const gateway = createGateway();

      gateway.broadcastTelemetry({
        deviceId: 'car01',
        payload: telemetry({ valid: false, dist_cm: null, state: 'STOP', rssi: null }),
        receivedAt: new Date('2026-11-11T08:00:00Z'),
      });

      expect(emit.mock.calls[0][1]).toMatchObject({ valid: false, distCm: null });
    });
  });

  describe('broadcastDeviceStatus', () => {
    it('emits status to device room', () => {
      const gateway = createGateway();

      gateway.broadcastDeviceStatus({
        deviceId: 'car01',
        online: false,
        lastSeen: '2026-11-11T08:00:00.000Z',
      });

      expect(to).toHaveBeenCalledWith('device:car01');
      expect(emit).toHaveBeenCalledWith('status', {
        deviceId: 'car01',
        online: false,
        lastSeen: '2026-11-11T08:00:00.000Z',
      });
    });
  });

  describe('broadcastEvent', () => {
    it('emits recorded event to device room', () => {
      const gateway = createGateway();

      gateway.broadcastEvent({
        deviceId: 'car01',
        event: {
          id: '20',
          ts: '2026-11-11T09:00:02.000Z',
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
          detail: { dist_cm: 12 },
        },
      });

      expect(to).toHaveBeenCalledWith('device:car01');
      expect(emit).toHaveBeenCalledWith('event', {
        deviceId: 'car01',
        id: '20',
        ts: '2026-11-11T09:00:02.000Z',
        mode: 'AUTO',
        source: 'DEVICE',
        type: 'AVOID_DONE',
        detail: { dist_cm: 12 },
      });
    });
  });

  describe('broadcastCommandUpdate', () => {
    it('emits command update to device room', () => {
      const gateway = createGateway();

      gateway.broadcastCommandUpdate({
        deviceId: 'car01',
        command: {
          id: '90',
          seq: 55,
          cmd: 'START',
          status: 'acked',
          reason: null,
          latencyMs: 180,
        },
      });

      expect(to).toHaveBeenCalledWith('device:car01');
      expect(emit).toHaveBeenCalledWith('command.update', {
        deviceId: 'car01',
        id: '90',
        seq: 55,
        cmd: 'START',
        status: 'acked',
        reason: null,
        latencyMs: 180,
      });
    });
  });

  describe('broadcastConfigUpdate', () => {
    it('emits config update to device room', () => {
      const gateway = createGateway();

      gateway.broadcastConfigUpdate({
        deviceId: 'car01',
        config: {
          ver: 4,
          stopCm: 25,
          resumeCm: 30,
          maxPwm: 200,
          manualMaxPwm: 150,
        },
      });

      expect(to).toHaveBeenCalledWith('device:car01');
      expect(emit).toHaveBeenCalledWith('config.update', {
        deviceId: 'car01',
        ver: 4,
        stopCm: 25,
        resumeCm: 30,
        maxPwm: 200,
        manualMaxPwm: 150,
      });
    });
  });
});
