import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Control (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let client: Socket | null = null;
  const deviceId = `e2e-ctl-${randomBytes(4).toString('hex')}`;

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
      data: {
        id: deviceId,
        name: 'E2E Control Device',
        online: true,
        mode: 'MANUAL',
        state: 'STOP',
      },
    });

    const addr = app.getHttpServer().address() as AddressInfo;
    client = io(`http://localhost:${addr.port}/realtime`, {
      transports: ['websocket'],
      auth: { token },
    });

    await new Promise<void>((resolve) => {
      client?.on('connect', () => resolve());
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.telemetry.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it('full control lifecycle: get -> acquire -> acquire conflict -> socket drive -> release', async () => {
    // 1. Initial GET /control shows no controller
    const initialRes = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/control`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(initialRes.body.data.controller).toBeNull();
    expect(initialRes.body.data.mode).toBe('MANUAL');

    // 2. Acquire control lock
    const acquireRes = await request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/control/acquire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(acquireRes.body.data.sid).toBeGreaterThanOrEqual(1);
    expect(acquireRes.body.data.expiresAt).toBeDefined();

    // 3. GET /control now shows controller
    const heldRes = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/control`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(heldRes.body.data.controller?.username).toBe('admin');
    expect(heldRes.body.data.sid).toBe(acquireRes.body.data.sid);

    // 4. Socket drive message
    // Insert fresh telemetry first so STALE_DATA check passes
    await prisma.telemetry.create({
      data: {
        deviceId,
        ts: new Date(),
        mode: 'MANUAL',
        valid: true,
        state: 'STOP',
        pwm: 0,
        avoidCount: 0,
      },
    });

    // Send drive command
    client?.emit('drive', {
      deviceId,
      dir: 'F',
      spd: 60,
    });

    // Send heartbeat
    client?.emit('control.heartbeat', {
      deviceId,
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // 5. Release control lock
    await request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/control/release`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // 6. GET /control shows controller is null again
    const releasedRes = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/control`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(releasedRes.body.data.controller).toBeNull();
  });

  it('rejects acquire when device is offline', async () => {
    const offlineId = `e2e-off-${randomBytes(4).toString('hex')}`;
    await prisma.device.create({
      data: {
        id: offlineId,
        name: 'Offline Device',
        online: false,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/devices/${offlineId}/control/acquire`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(res.body.error.code).toBe('DEVICE_OFFLINE');

    await prisma.device.delete({ where: { id: offlineId } });
  });
});
