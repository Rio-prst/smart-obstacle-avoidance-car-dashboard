import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Env } from '../config/env.validation';
import { DeviceService } from '../devices/devices.service';
import type { CommandAckReceivedEvent } from '../mqtt/mqtt.constants';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommandsService } from './commands.service';

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function commandRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 90n,
    deviceId: 'car01',
    seq: 55,
    cmd: 'START',
    payload: null,
    status: 'pending',
    reason: null,
    createdAt: new Date('2026-11-11T08:00:00Z'),
    ackedAt: null,
    ...overrides,
  };
}

function ackEvent(overrides: Partial<CommandAckReceivedEvent> = {}): CommandAckReceivedEvent {
  return {
    deviceId: 'car01',
    payload: { seq: 55, ok: true, reason: null },
    receivedAt: new Date('2026-11-11T08:00:01Z'),
    ...overrides,
  };
}

describe('CommandsService', () => {
  const deviceFindUnique = jest.fn();
  const deviceUpdate = jest.fn();
  const commandCreate = jest.fn();
  const commandFindUnique = jest.fn();
  const commandFindMany = jest.fn();
  const commandUpdateMany = jest.fn();
  const ensureDevice = jest.fn();
  const mqttPublish = jest.fn();
  const emitter = new EventEmitter2();
  const emitterSpy = jest.spyOn(emitter, 'emit');

  function createService(cmdTtlSeconds = 30, ackTimeoutSeconds = 10): CommandsService {
    const prisma = {
      device: { findUnique: deviceFindUnique, update: deviceUpdate },
      command: {
        create: commandCreate,
        findUnique: commandFindUnique,
        findMany: commandFindMany,
        updateMany: commandUpdateMany,
      },
    } as unknown as PrismaService;
    const config = {
      get: (key: string): number =>
        key === 'CMD_TTL_SECONDS'
          ? cmdTtlSeconds
          : key === 'CMD_ACK_TIMEOUT_SECONDS'
            ? ackTimeoutSeconds
            : 0,
    } as unknown as ConfigService<Env, true>;
    const devices = { ensureDevice } as unknown as DeviceService;
    const mqtt = { publish: mqttPublish } as unknown as MqttService;

    return new CommandsService(prisma, config, devices, mqtt, emitter);
  }

  beforeEach(() => {
    deviceFindUnique.mockReset();
    deviceUpdate.mockReset();
    commandCreate.mockReset();
    commandFindUnique.mockReset();
    commandFindMany.mockReset();
    commandUpdateMany.mockReset();
    ensureDevice.mockReset().mockResolvedValue(undefined);
    mqttPublish.mockReset().mockReturnValue(true);
    emitterSpy.mockClear();
  });

  describe('create', () => {
    it('rejects SET_MODE without mode', async () => {
      await expect(createService().create('car01', { cmd: 'SET_MODE' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(commandCreate).not.toHaveBeenCalled();
    });

    it('rejects mode for commands other than SET_MODE', async () => {
      await expect(
        createService().create('car01', { cmd: 'START', mode: 'AUTO' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects START when device is offline', async () => {
      deviceFindUnique.mockResolvedValueOnce({ online: false, mode: 'AUTO', state: 'MAJU' });

      const error = await createService()
        .create('car01', { cmd: 'START' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'DEVICE_OFFLINE' });
      expect(commandCreate).not.toHaveBeenCalled();
    });

    it('rejects START when mode is not AUTO', async () => {
      deviceFindUnique.mockResolvedValueOnce({ online: true, mode: 'MANUAL', state: 'STOP' });

      const error = await createService()
        .create('car01', { cmd: 'START' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'WRONG_MODE' });
    });

    it('rejects SET_MODE when state is not STOP', async () => {
      deviceFindUnique.mockResolvedValueOnce({ online: true, mode: 'AUTO', state: 'MAJU' });

      const error = await createService()
        .create('car01', { cmd: 'SET_MODE', mode: 'MANUAL' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'NOT_STOPPED' });
    });

    it('creates STOP without device state checks', async () => {
      deviceUpdate.mockResolvedValueOnce({ lastCmdSeq: 3 });
      commandCreate.mockResolvedValueOnce(commandRow({ seq: 3, cmd: 'STOP' }));

      const result = await createService().create('car01', { cmd: 'STOP' });

      expect(deviceFindUnique).not.toHaveBeenCalled();
      expect(result).toMatchObject({ seq: 3, cmd: 'STOP', status: 'pending' });
    });

    it('allocates seq atomically and publishes qos 1 without retain', async () => {
      deviceFindUnique.mockResolvedValueOnce({ online: true, mode: 'AUTO', state: 'MAJU' });
      deviceUpdate.mockResolvedValueOnce({ lastCmdSeq: 55 });
      commandCreate.mockResolvedValueOnce(commandRow({ seq: 55 }));

      const result = await createService().create('car01', { cmd: 'START' });

      expect(deviceUpdate).toHaveBeenCalledWith({
        where: { id: 'car01' },
        data: { lastCmdSeq: { increment: 1 } },
        select: { lastCmdSeq: true },
      });
      expect(mqttPublish).toHaveBeenCalledWith(
        'car/car01/cmd',
        { seq: 55, cmd: 'START', exp: expect.any(Number) },
        { qos: 1, retain: false },
      );
      expect(mqttPublish.mock.calls[0][1].exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(result).toEqual({
        id: '90',
        seq: 55,
        cmd: 'START',
        payload: null,
        status: 'pending',
        exp: expect.any(String),
      });
    });

    it('publishes and stores mode for SET_MODE', async () => {
      deviceFindUnique.mockResolvedValueOnce({ online: true, mode: 'AUTO', state: 'STOP' });
      deviceUpdate.mockResolvedValueOnce({ lastCmdSeq: 56 });
      commandCreate.mockResolvedValueOnce(
        commandRow({ seq: 56, cmd: 'SET_MODE', payload: { mode: 'MANUAL' } }),
      );

      const result = await createService().create('car01', { cmd: 'SET_MODE', mode: 'MANUAL' });

      expect(commandCreate.mock.calls[0][0].data.payload).toEqual({ mode: 'MANUAL' });
      expect(mqttPublish).toHaveBeenCalledWith(
        'car/car01/cmd',
        { seq: 56, cmd: 'SET_MODE', mode: 'MANUAL', exp: expect.any(Number) },
        { qos: 1, retain: false },
      );
      expect(result.payload).toEqual({ mode: 'MANUAL' });
    });

    it('emits command update for created command', async () => {
      deviceUpdate.mockResolvedValueOnce({ lastCmdSeq: 1 });
      commandCreate.mockResolvedValueOnce(commandRow({ seq: 1, cmd: 'STOP' }));

      await createService().create('car01', { cmd: 'STOP' });

      expect(emitterSpy).toHaveBeenCalledWith('app.command.updated', {
        deviceId: 'car01',
        command: {
          id: '90',
          seq: 1,
          cmd: 'STOP',
          status: 'pending',
          reason: null,
          latencyMs: null,
        },
      });
    });

    it('still creates command when mqtt is unavailable', async () => {
      mqttPublish.mockReturnValue(false);
      deviceUpdate.mockResolvedValueOnce({ lastCmdSeq: 2 });
      commandCreate.mockResolvedValueOnce(commandRow({ seq: 2, cmd: 'STOP' }));

      await expect(createService().create('car01', { cmd: 'STOP' })).resolves.toMatchObject({
        status: 'pending',
      });
      expect(mqttPublish).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleCommandAck', () => {
    it('marks command acked with latency from receive time', async () => {
      commandFindUnique.mockResolvedValueOnce(commandRow({ createdAt: new Date('2026-11-11T08:00:00Z') }));
      commandUpdateMany.mockResolvedValueOnce({ count: 1 });

      createService().handleCommandAck(
        ackEvent({
          payload: { seq: 55, ok: true, reason: null, ts: 1770000001 },
          receivedAt: new Date('2026-11-11T08:00:01Z'),
        }),
      );
      await flush();

      expect(commandFindUnique).toHaveBeenCalledWith({
        where: { deviceId_seq: { deviceId: 'car01', seq: 55 } },
        select: expect.any(Object),
      });
      expect(commandUpdateMany).toHaveBeenCalledWith({
        where: { id: 90n, status: 'pending' },
        data: { status: 'acked', reason: null, ackedAt: new Date('2026-11-11T08:00:01Z') },
      });
      expect(emitterSpy).toHaveBeenCalledWith('app.command.updated', {
        deviceId: 'car01',
        command: expect.objectContaining({ id: '90', status: 'acked', latencyMs: 1000 }),
      });
    });

    it('marks command rejected with reason', async () => {
      commandFindUnique.mockResolvedValueOnce(commandRow({ createdAt: new Date(1770000000000) }));
      commandUpdateMany.mockResolvedValueOnce({ count: 1 });

      createService().handleCommandAck(
        ackEvent({ payload: { seq: 55, ok: false, reason: 'WRONG_MODE' } }),
      );
      await flush();

      expect(commandUpdateMany.mock.calls[0][0].data).toMatchObject({
        status: 'rejected',
        reason: 'WRONG_MODE',
      });
      expect(emitterSpy).toHaveBeenCalledWith(
        'app.command.updated',
        expect.objectContaining({
          command: expect.objectContaining({ status: 'rejected', reason: 'WRONG_MODE' }),
        }),
      );
    });

    it('defaults missing rejection reason to INVALID', async () => {
      commandFindUnique.mockResolvedValueOnce(commandRow());
      commandUpdateMany.mockResolvedValueOnce({ count: 1 });

      createService().handleCommandAck(ackEvent({ payload: { seq: 55, ok: false } }));
      await flush();

      expect(commandUpdateMany.mock.calls[0][0].data.reason).toBe('INVALID');
    });

    it('ignores ack for already finalized command', async () => {
      commandFindUnique.mockResolvedValueOnce(commandRow({ status: 'acked' }));

      createService().handleCommandAck(ackEvent());
      await flush();

      expect(commandUpdateMany).not.toHaveBeenCalled();
      expect(emitterSpy).not.toHaveBeenCalled();
    });

    it('ignores ack for unknown seq', async () => {
      commandFindUnique.mockResolvedValueOnce(null);

      createService().handleCommandAck(ackEvent({ payload: { seq: 99, ok: true } }));
      await flush();

      expect(commandUpdateMany).not.toHaveBeenCalled();
    });

    it('ignores config acknowledgement', async () => {
      createService().handleCommandAck(
        ackEvent({
          payload: { seq: 0, ok: true, reason: null, cfg_ver: 4, ts: 1770000001 },
        }),
      );
      await flush();

      expect(commandFindUnique).not.toHaveBeenCalled();
      expect(commandUpdateMany).not.toHaveBeenCalled();
    });

    it('skips emit when update loses race', async () => {
      commandFindUnique.mockResolvedValueOnce(commandRow());
      commandUpdateMany.mockResolvedValueOnce({ count: 0 });

      createService().handleCommandAck(ackEvent());
      await flush();

      expect(emitterSpy).not.toHaveBeenCalled();
    });
  });

  describe('expirePendingCommands', () => {
    it('expires stale pending commands and emits update', async () => {
      commandFindMany.mockResolvedValueOnce([commandRow()]);
      commandUpdateMany.mockResolvedValueOnce({ count: 1 });

      await createService(30, 10).expirePendingCommands();

      expect(commandFindMany.mock.calls[0][0].where).toMatchObject({ status: 'pending' });
      expect(commandFindMany.mock.calls[0][0].where.createdAt.lt).toBeInstanceOf(Date);
      expect(commandUpdateMany).toHaveBeenCalledWith({
        where: { id: 90n, status: 'pending' },
        data: { status: 'expired' },
      });
      expect(emitterSpy).toHaveBeenCalledWith(
        'app.command.updated',
        expect.objectContaining({
          deviceId: 'car01',
          command: expect.objectContaining({ status: 'expired' }),
        }),
      );
    });

    it('skips emit when a concurrent ack won the race', async () => {
      commandFindMany.mockResolvedValueOnce([commandRow()]);
      commandUpdateMany.mockResolvedValueOnce({ count: 0 });

      await createService().expirePendingCommands();

      expect(emitterSpy).not.toHaveBeenCalled();
    });

    it('does nothing when no stale commands', async () => {
      commandFindMany.mockResolvedValueOnce([]);

      await createService().expirePendingCommands();

      expect(commandUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('maps rows to items newest first with default limit', async () => {
      commandFindMany.mockResolvedValueOnce([
        commandRow({ ackedAt: new Date('2026-11-11T08:00:02Z') }),
      ]);

      const items = await createService().list('car01', {});

      expect(commandFindMany.mock.calls[0][0]).toMatchObject({
        where: { deviceId: 'car01' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      });
      expect(items).toEqual([
        {
          id: '90',
          seq: 55,
          cmd: 'START',
          payload: null,
          status: 'pending',
          reason: null,
          latencyMs: 2000,
          createdAt: '2026-11-11T08:00:00.000Z',
          ackedAt: '2026-11-11T08:00:02.000Z',
        },
      ]);
    });

    it('uses provided limit', async () => {
      commandFindMany.mockResolvedValueOnce([]);

      await createService().list('car01', { limit: 5 });

      expect(commandFindMany.mock.calls[0][0].take).toBe(5);
    });

    it('throws for unknown device', async () => {
      ensureDevice.mockReset().mockRejectedValueOnce(new Error('not found'));

      await expect(createService().list('car99', {})).rejects.toThrow('not found');
    });
  });
});
