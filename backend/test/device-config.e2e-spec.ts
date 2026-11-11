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

describe('DeviceConfig (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let client: Socket | null = null;
  const deviceId = `e2e-cfg-${randomBytes(4).toString('hex')}`;

  const validBody = {
    stopCm: 30,
    resumeCm: 35,
    maxPwm: 220,
    manualMaxPwm: 160,
  };

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
      data: { id: deviceId, name: 'E2E Config Device' },
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await prisma.deviceConfig.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  function get(): request.Test {
    return request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/config`)
      .set('Authorization', `Bearer ${token}`);
  }

  function put(body: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .put(`/api/devices/${deviceId}/config`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('rejects unauthenticated request', async () => {
    await request(app.getHttpServer()).get(`/api/devices/${deviceId}/config`).expect(401);
  });

  it('rejects unknown device', async () => {
    await request(app.getHttpServer())
      .get('/api/devices/e2e-missing/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
  });

  it('returns default config on first get', async () => {
    await get().expect(200).expect((res) => {
      expect(res.body.data).toEqual({
        ver: 1,
        stopCm: 25,
        resumeCm: 30,
        maxPwm: 200,
        manualMaxPwm: 150,
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      });
    });
  });

  it('rejects stop_cm out of range', async () => {
    await put({ ...validBody, stopCm: 5 }).expect(400).expect((res) => {
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  it('rejects resume_cm below stop_cm + 3', async () => {
    await put({ ...validBody, stopCm: 25, resumeCm: 27 }).expect(400).expect((res) => {
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'resume_cm', issue: 'min 28' }],
      });
    });
  });

  it('rejects manual_max_pwm above max_pwm', async () => {
    await put({ ...validBody, maxPwm: 160, manualMaxPwm: 170 }).expect(400).expect((res) => {
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'manual_max_pwm', issue: 'max 160' }],
      });
    });
  });

  it('updates config and bumps ver', async () => {
    await put(validBody).expect(200).expect((res) => {
      expect(res.body.data).toEqual({
        ver: 2,
        stopCm: 30,
        resumeCm: 35,
        maxPwm: 220,
        manualMaxPwm: 160,
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      });
    });
  });

  it('broadcasts config.update on update', async () => {
    const address = app.getHttpServer().address() as AddressInfo;
    client = io(`http://127.0.0.1:${address.port}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      client?.on('connect', () => resolve());
      client?.on('connect_error', (error) => reject(error));
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });

    await new Promise<void>((resolve, reject) => {
      client?.emit('subscribe', { deviceId }, (ack: unknown) => {
        if ((ack as { ok: boolean }).ok === true) {
          resolve();
        } else {
          reject(new Error('subscribe failed'));
        }
      });
    });

    const received = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for config.update')), 8000);
      client?.once('config.update', (payload: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    await put({ ...validBody, stopCm: 40, resumeCm: 45, maxPwm: 230, manualMaxPwm: 170 }).expect(
      200,
    );

    await expect(received).resolves.toEqual({
      deviceId,
      ver: 3,
      stopCm: 40,
      resumeCm: 45,
      maxPwm: 230,
      manualMaxPwm: 170,
    });
  });
});
