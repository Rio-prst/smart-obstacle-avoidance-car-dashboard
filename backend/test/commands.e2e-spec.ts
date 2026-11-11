import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { MqttService } from '../src/mqtt/mqtt.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Commands (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mqtt: MqttService;
  let token: string;
  let client: Socket | null = null;
  const deviceId = `e2e-cmd-${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);

    prisma = app.get(PrismaService);
    mqtt = app.get(MqttService);

    const config = app.get(ConfigService);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        username: config.get<string>('ADMIN_USERNAME') ?? 'admin',
        password: config.get<string>('ADMIN_PASSWORD') ?? '',
      })
      .expect(200);

    token = login.body.accessToken;

    await prisma.device.create({
      data: { id: deviceId, name: 'E2E Commands Device', online: false, mode: 'AUTO', state: 'STOP' },
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.command.deleteMany({ where: { deviceId } });
    await prisma.event.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  async function setDevice(fields: {
    online?: boolean;
    mode?: string;
    state?: string;
  }): Promise<void> {
    await prisma.device.update({ where: { id: deviceId }, data: fields });
  }

  function post(body: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/commands`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function list(query = ''): request.Test {
    return request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/commands${query}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function publishAck(body: Record<string, unknown>): void {
    mqtt.processMessage(`car/${deviceId}/cmd/ack`, Buffer.from(JSON.stringify(body), 'utf8'));
  }

  async function waitForStatus(seq: number, status: string): Promise<void> {
    const deadline = Date.now() + 8000;

    while (Date.now() < deadline) {
      const res = await list().expect(200);
      const item = res.body.data.find((command: { seq: number }) => command.seq === seq);

      if (item?.status === status) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`command ${seq} did not become ${status}`);
  }

  function connect(authToken: string): Promise<Socket> {
    const address = app.getHttpServer().address() as AddressInfo;
    const socket = io(`http://127.0.0.1:${address.port}/realtime`, {
      auth: { token: authToken },
      transports: ['websocket'],
      reconnection: false,
    });

    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });
  }

  function waitForCommandUpdate(
    socket: Socket,
    predicate: (payload: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('command.update', listener);
        reject(new Error('timeout waiting for command.update'));
      }, 8000);
      const listener = (payload: Record<string, unknown>): void => {
        if (predicate(payload)) {
          clearTimeout(timer);
          socket.off('command.update', listener);
          resolve(payload);
        }
      };
      socket.on('command.update', listener);
    });
  }

  it('rejects unauthenticated request', async () => {
    await request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/commands`)
      .send({ cmd: 'STOP' })
      .expect(401);
  });

  it('rejects unknown device', async () => {
    await request(app.getHttpServer())
      .post('/api/devices/e2e-missing/commands')
      .set('Authorization', `Bearer ${token}`)
      .send({ cmd: 'STOP' })
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
  });

  it('rejects invalid cmd', async () => {
    await post({ cmd: 'JUMP' }).expect(400).expect((res) => {
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('rejects SET_MODE without mode', async () => {
    await post({ cmd: 'SET_MODE' }).expect(400).expect((res) => {
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('rejects mode for START', async () => {
    await post({ cmd: 'START', mode: 'AUTO' }).expect(400);
  });

  it('rejects START while device offline', async () => {
    await setDevice({ online: false, mode: 'AUTO', state: 'STOP' });

    await post({ cmd: 'START' }).expect(409).expect((res) => {
      expect(res.body.error.code).toBe('DEVICE_OFFLINE');
    });
  });

  it('rejects START in MANUAL mode', async () => {
    await setDevice({ online: true, mode: 'MANUAL', state: 'STOP' });

    await post({ cmd: 'START' }).expect(409).expect((res) => {
      expect(res.body.error.code).toBe('WRONG_MODE');
    });
  });

  it('rejects SET_MODE while moving', async () => {
    await setDevice({ online: true, mode: 'AUTO', state: 'MAJU' });

    await post({ cmd: 'SET_MODE', mode: 'MANUAL' }).expect(409).expect((res) => {
      expect(res.body.error.code).toBe('NOT_STOPPED');
    });
  });

  it('creates STOP command even while device offline', async () => {
    await setDevice({ online: false, mode: 'AUTO', state: 'STOP' });

    await post({ cmd: 'STOP' }).expect(202).expect((res) => {
      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        seq: 1,
        cmd: 'STOP',
        payload: null,
        status: 'pending',
        exp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      });
    });
  });

  it('creates START command in AUTO mode', async () => {
    await setDevice({ online: true, mode: 'AUTO', state: 'STOP' });

    await post({ cmd: 'START' }).expect(202).expect((res) => {
      expect(res.body.data).toMatchObject({ seq: 2, cmd: 'START', status: 'pending' });
    });
  });

  it('creates SET_MODE command with mode payload', async () => {
    await setDevice({ online: true, mode: 'AUTO', state: 'STOP' });

    await post({ cmd: 'SET_MODE', mode: 'MANUAL' }).expect(202).expect((res) => {
      expect(res.body.data).toMatchObject({ seq: 3, cmd: 'SET_MODE' });
      expect(res.body.data.payload).toEqual({ mode: 'MANUAL' });
    });
  });

  it('applies successful ack with latency', async () => {
    await post({ cmd: 'STOP' }).expect(202).expect((res) => {
      expect(res.body.data.seq).toBe(4);
    });

    publishAck({ seq: 4, ok: true, reason: null, ts: Math.floor(Date.now() / 1000) });

    await waitForStatus(4, 'acked');

    const res = await list().expect(200);
    const item = res.body.data.find((command: { seq: number }) => command.seq === 4);

    expect(item).toMatchObject({
      status: 'acked',
      reason: null,
      latencyMs: expect.any(Number),
      ackedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
    expect(item.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('applies rejected ack with reason', async () => {
    await setDevice({ online: true, mode: 'AUTO', state: 'STOP' });
    await post({ cmd: 'SET_MODE', mode: 'MANUAL' }).expect(202).expect((res) => {
      expect(res.body.data.seq).toBe(5);
    });

    publishAck({ seq: 5, ok: false, reason: 'NOT_STOPPED', ts: Math.floor(Date.now() / 1000) });

    await waitForStatus(5, 'rejected');

    const res = await list().expect(200);
    const item = res.body.data.find((command: { seq: number }) => command.seq === 5);

    expect(item).toMatchObject({ status: 'rejected', reason: 'NOT_STOPPED' });
  });

  it('broadcasts command.update for create and ack', async () => {
    client = await connect(token);

    await new Promise<void>((resolve, reject) => {
      client?.emit('subscribe', { deviceId }, (ack: unknown) => {
        if ((ack as { ok: boolean }).ok === true) {
          resolve();
        } else {
          reject(new Error('subscribe failed'));
        }
      });
    });

    const pending = waitForCommandUpdate(client, (payload) => payload.seq === 6);
    await post({ cmd: 'STOP' }).expect(202);

    await expect(pending).resolves.toMatchObject({
      deviceId,
      seq: 6,
      cmd: 'STOP',
      status: 'pending',
      reason: null,
      latencyMs: null,
    });

    const acked = waitForCommandUpdate(
      client,
      (payload) => payload.seq === 6 && payload.status === 'acked',
    );
    publishAck({ seq: 6, ok: true, reason: null, ts: Math.floor(Date.now() / 1000) });

    await expect(acked).resolves.toMatchObject({
      deviceId,
      seq: 6,
      status: 'acked',
      latencyMs: expect.any(Number),
    });
  });

  it('expires pending command without ack', async () => {
    await post({ cmd: 'STOP' }).expect(202).expect((res) => {
      expect(res.body.data.seq).toBe(7);
    });

    await prisma.command.updateMany({
      where: { deviceId, seq: 7 },
      data: { createdAt: new Date(Date.now() - 11000) },
    });

    await waitForStatus(7, 'expired');

    const res = await list().expect(200);
    const item = res.body.data.find((command: { seq: number }) => command.seq === 7);

    expect(item).toMatchObject({ status: 'expired', reason: null, latencyMs: null, ackedAt: null });
  });

  it('lists commands newest first with limit', async () => {
    const res = await list('?limit=3').expect(200);

    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].seq).toBeGreaterThan(res.body.data[2].seq);

    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('payload');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('ackedAt');
    }
  });
});
