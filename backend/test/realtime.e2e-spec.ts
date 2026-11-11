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

describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mqtt: MqttService;
  let token: string;
  let baseUrl: string;
  let client: Socket | null = null;
  const deviceId = `e2e-rt-${randomBytes(4).toString('hex')}`;

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

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

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
      data: { id: deviceId, name: 'E2E Realtime Device' },
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.telemetry.deleteMany({ where: { deviceId } });
    await prisma.event.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  function connect(authToken: string): Promise<Socket> {
    const socket = io(`${baseUrl}/realtime`, {
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

  function once(socket: Socket, event: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5000);
      socket.once(event, (payload: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function emitWithAck(socket: Socket, event: string, body: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 5000);
      socket.emit(event, body, (ack: unknown) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });
  }

  function publish(topicKind: string, body: Record<string, unknown>): void {
    mqtt.processMessage(
      `car/${deviceId}/${topicKind}`,
      Buffer.from(JSON.stringify(body), 'utf8'),
    );
  }

  it('rejects connection with invalid token', async () => {
    const socket = io(`${baseUrl}/realtime`, {
      auth: { token: 'invalid-token' },
      transports: ['websocket'],
      reconnection: false,
    });

    const error = await new Promise<Error>((resolve, reject) => {
      socket.on('connect_error', (err: Error) => resolve(err));
      setTimeout(() => reject(new Error('expected connect_error')), 5000);
    });

    expect(error.message).toBe('UNAUTHORIZED');
    socket.close();
  });

  it('subscribes to a device room', async () => {
    client = await connect(token);

    await expect(emitWithAck(client, 'subscribe', { deviceId })).resolves.toEqual({ ok: true });
  });

  it('rejects invalid subscribe payload', async () => {
    const socket = await connect(token);

    try {
      await expect(emitWithAck(socket, 'subscribe', 'garbage')).resolves.toEqual({
        ok: false,
        code: 'INVALID',
      });
    } finally {
      socket.disconnect();
    }
  });

  it('broadcasts telemetry to subscribed room', async () => {
    const received = once(client as Socket, 'telemetry');

    publish('telemetry', {
      seq: 1,
      ts: 0,
      mode: 'AUTO',
      dist_cm: 40,
      valid: true,
      state: 'MAJU',
      pwm: 180,
      avoid_count: 2,
      rssi: -60,
    });

    await expect(received).resolves.toEqual({
      deviceId,
      ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      mode: 'AUTO',
      distCm: 40,
      valid: true,
      state: 'MAJU',
      pwm: 180,
      avoidCount: 2,
      rssi: -60,
    });
  });

  it('broadcasts status change to subscribed room', async () => {
    const received = once(client as Socket, 'status');

    publish('status', { online: true, fw: 'v1.2.0' });

    await expect(received).resolves.toEqual({
      deviceId,
      online: true,
      lastSeen: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
  });

  it('broadcasts recorded event to subscribed room', async () => {
    const socket = client as Socket;
    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for event')), 5000);
      const listener = (payload: Record<string, unknown>): void => {
        if (payload.type === 'AVOID_DONE') {
          clearTimeout(timer);
          socket.off('event', listener);
          resolve(payload);
        }
      };
      socket.on('event', listener);
    });

    publish('event', {
      seq: 2,
      ts: 1770000000,
      type: 'AVOID_DONE',
      mode: 'AUTO',
      detail: { dist_cm: 12 },
    });

    await expect(received).resolves.toMatchObject({
      deviceId,
      id: expect.any(String),
      ts: new Date(1770000000000).toISOString(),
      mode: 'AUTO',
      source: 'DEVICE',
      type: 'AVOID_DONE',
      detail: { dist_cm: 12 },
    });
  });

  it('stops broadcasting after unsubscribe', async () => {
    const socket = client as Socket;

    await expect(emitWithAck(socket, 'unsubscribe', { deviceId })).resolves.toEqual({ ok: true });

    let received = false;
    socket.on('telemetry', () => {
      received = true;
    });

    publish('telemetry', {
      seq: 3,
      ts: 0,
      mode: 'AUTO',
      dist_cm: 30,
      valid: true,
      state: 'MAJU',
      pwm: 150,
      avoid_count: 0,
      rssi: -55,
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(received).toBe(false);
  });
});
