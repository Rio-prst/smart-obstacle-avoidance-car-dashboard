import { parseDeviceTopic } from './mqtt.constants';

describe('parseDeviceTopic', () => {
  it('parses telemetry topic', () => {
    expect(parseDeviceTopic('car/car01/telemetry')).toEqual({
      deviceId: 'car01',
      kind: 'telemetry',
    });
  });

  it('parses status topic', () => {
    expect(parseDeviceTopic('car/car01/status')).toEqual({
      deviceId: 'car01',
      kind: 'status',
    });
  });

  it('parses event topic', () => {
    expect(parseDeviceTopic('car/car01/event')).toEqual({
      deviceId: 'car01',
      kind: 'event',
    });
  });

  it('parses cmd ack topic', () => {
    expect(parseDeviceTopic('car/car01/cmd/ack')).toEqual({
      deviceId: 'car01',
      kind: 'cmd/ack',
    });
  });

  it('parses pong topic', () => {
    expect(parseDeviceTopic('car/car01/pong')).toEqual({
      deviceId: 'car01',
      kind: 'pong',
    });
  });

  it('returns null for non device topic', () => {
    expect(parseDeviceTopic('home/car01/telemetry')).toBeNull();
  });

  it('returns null for unknown suffix', () => {
    expect(parseDeviceTopic('car/car01/unknown')).toBeNull();
  });

  it('returns null for topic without device id', () => {
    expect(parseDeviceTopic('car/telemetry')).toBeNull();
  });
});
