import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Env } from '../config/env.validation';
import { MqttService } from './mqtt.service';
import { MQTT_EVENTS } from './mqtt.constants';

describe('MqttService', () => {
  const emitter = new EventEmitter2();
  const config = {
    get: (key: string): string => (key === 'NODE_ENV' ? 'test' : ''),
  } as unknown as ConfigService<Env, true>;

  function createService(): MqttService {
    return new MqttService(config, emitter);
  }

  function publish(topic: string, body: unknown): void {
    const service = createService();
    service.processMessage(topic, Buffer.from(JSON.stringify(body), 'utf8'));
  }

  afterEach(() => {
    emitter.removeAllListeners();
  });

  it('emits telemetry event for valid payload', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.telemetry, listener);

    publish('car/car01/telemetry', {
      seq: 1,
      ts: 0,
      mode: 'AUTO',
      dist_cm: 40,
      valid: true,
      state: 'MAJU',
      pwm: 180,
      avoid_count: 0,
      rssi: -60,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      deviceId: 'car01',
      payload: { mode: 'AUTO', dist_cm: 40, valid: true, state: 'MAJU' },
    });
  });

  it('emits status event for valid payload', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.status, listener);

    publish('car/car01/status', { online: true, fw: 'v1.0.0' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      deviceId: 'car01',
      payload: { online: true, fw: 'v1.0.0' },
    });
  });

  it('emits device event for valid payload', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.deviceEvent, listener);

    publish('car/car01/event', {
      seq: 2,
      ts: 1770000000,
      type: 'AVOID_DONE',
      mode: 'AUTO',
      detail: { dist_cm: 12 },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      deviceId: 'car01',
      payload: { type: 'AVOID_DONE' },
    });
  });

  it('emits command ack event for valid payload', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.commandAck, listener);

    publish('car/car01/cmd/ack', { seq: 55, ok: true, reason: null });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      deviceId: 'car01',
      payload: { seq: 55, ok: true },
    });
  });

  it('emits pong event for valid payload', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.pong, listener);

    publish('car/car01/pong', { seq: 5, t: 120 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      deviceId: 'car01',
      payload: { seq: 5, t: 120 },
    });
  });

  it('drops payload that fails schema validation', () => {
    const telemetryListener = jest.fn();
    emitter.on(MQTT_EVENTS.telemetry, telemetryListener);

    publish('car/car01/telemetry', {
      seq: 1,
      ts: 0,
      mode: 'MANUAL',
      dist_cm: 40,
      valid: true,
      state: 'PINDAI',
      pwm: 180,
      avoid_count: 0,
      rssi: -60,
    });

    expect(telemetryListener).not.toHaveBeenCalled();
  });

  it('drops payload with malformed JSON', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.telemetry, listener);

    const service = createService();
    service.processMessage('car/car01/telemetry', Buffer.from('not-json', 'utf8'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores non device topics', () => {
    const listener = jest.fn();
    emitter.on(MQTT_EVENTS.telemetry, listener);

    publish('home/car01/telemetry', { seq: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('reports disconnected before connect', () => {
    expect(createService().isConnected()).toBe(false);
  });

  it('skips publish when not connected', () => {
    const service = createService();

    expect(service.publish('car/car01/cmd', { seq: 1, cmd: 'STOP' })).toBe(false);
  });

  it('publishes json payload with qos 1 when connected', () => {
    const service = createService();
    const clientPublish = jest.fn();
    (service as unknown as { client: unknown }).client = { publish: clientPublish };
    (service as unknown as { connected: boolean }).connected = true;

    expect(service.publish('car/car01/cmd', { seq: 1, cmd: 'STOP' })).toBe(true);
    expect(clientPublish).toHaveBeenCalledWith(
      'car/car01/cmd',
      JSON.stringify({ seq: 1, cmd: 'STOP' }),
      { qos: 1, retain: false },
    );
  });

  it('publishes with custom qos and retain', () => {
    const service = createService();
    const clientPublish = jest.fn();
    (service as unknown as { client: unknown }).client = { publish: clientPublish };
    (service as unknown as { connected: boolean }).connected = true;

    expect(service.publish('car/car01/config', { ver: 2 }, { qos: 1, retain: true })).toBe(true);
    expect(clientPublish).toHaveBeenCalledWith('car/car01/config', JSON.stringify({ ver: 2 }), {
      qos: 1,
      retain: true,
    });
  });
});
