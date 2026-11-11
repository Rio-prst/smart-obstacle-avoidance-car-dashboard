import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Telemetry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const deviceId = `e2e-tel-${randomBytes(4).toString('hex')}`;

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
    await app.init();

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
      data: { id: deviceId, name: 'E2E Telemetry Device' },
    });

    await prisma.telemetry.createMany({
      data: [
        {
          deviceId,
          ts: new Date('2026-01-01T00:00:00Z'),
          mode: 'AUTO',
          distCm: 40,
          valid: true,
          state: 'MAJU',
          pwm: 180,
          avoidCount: 0,
          rssi: -60,
        },
        {
          deviceId,
          ts: new Date('2026-01-01T00:00:01Z'),
          mode: 'AUTO',
          distCm: 50,
          valid: true,
          state: 'MAJU',
          pwm: 180,
          avoidCount: 1,
          rssi: -61,
        },
        {
          deviceId,
          ts: new Date('2026-01-01T00:00:02Z'),
          mode: 'AUTO',
          distCm: 60,
          valid: true,
          state: 'MAJU',
          pwm: 180,
          avoidCount: 2,
          rssi: -62,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.telemetry.deleteMany({ where: { deviceId } });
    await prisma.event.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it('GET /api/devices/:id/telemetry/latest returns newest row', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry/latest`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({
      ts: '2026-01-01T00:00:02.000Z',
      mode: 'AUTO',
      distCm: 60,
      valid: true,
      state: 'MAJU',
      pwm: 180,
      avoidCount: 2,
      rssi: -62,
    });
  });

  it('GET /api/devices/:id/telemetry/latest returns null for device without rows', async () => {
    const emptyDeviceId = `${deviceId}-empty`;

    await prisma.device.create({ data: { id: emptyDeviceId, name: 'Empty' } });

    try {
      const response = await request(app.getHttpServer())
        .get(`/api/devices/${emptyDeviceId}/telemetry/latest`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toBeNull();
    } finally {
      await prisma.device.deleteMany({ where: { id: emptyDeviceId } });
    }
  });

  it('GET /api/devices/:id/telemetry returns raw history ascending', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0].ts).toBe('2026-01-01T00:00:00.000Z');
    expect(response.body.data[2].ts).toBe('2026-01-01T00:00:02.000Z');
    expect(response.body.meta).toEqual({
      count: 3,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T00:00:02.000Z',
      mode: null,
    });
  });

  it('GET /api/devices/:id/telemetry filters by time range', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({
        from: '2026-01-01T00:00:01Z',
        to: '2026-01-01T00:00:01Z',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].distCm).toBe(50);
  });

  it('GET /api/devices/:id/telemetry filters by mode', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({ mode: 'MANUAL' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(0);
    expect(response.body.meta.mode).toBe('MANUAL');
  });

  it('GET /api/devices/:id/telemetry aggregates per second bucket', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({ interval: '1s' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0].ts).toBe('2026-01-01T00:00:00.000Z');
    expect(response.body.meta.count).toBe(3);
  });

  it('GET /api/devices/:id/telemetry aggregates into one minute bucket', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({ interval: '1m' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      distCm: 50,
      pwm: 180,
      avoidCount: 2,
      state: 'MAJU',
    });
    expect(typeof response.body.data[0].distCm).toBe('number');
  });

  it('GET /api/devices/:id/telemetry rejects from after to', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({
        from: '2026-01-01T00:00:02Z',
        to: '2026-01-01T00:00:00Z',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/devices/:id/telemetry rejects unknown interval', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({ interval: '2s' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/devices/:id/telemetry rejects limit above 2000', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .query({ limit: 2001 })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/devices/:id/telemetry returns 404 for unknown device', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/devices/e2e-unknown-device/telemetry')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/devices/:id/telemetry requires authentication', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/telemetry`)
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
