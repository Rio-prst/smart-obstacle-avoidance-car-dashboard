import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const deviceId = `e2e-evt-${randomBytes(4).toString('hex')}`;

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
      data: { id: deviceId, name: 'E2E Events Device' },
    });

    await prisma.event.createMany({
      data: [
        {
          deviceId,
          ts: new Date('2026-01-01T00:00:00Z'),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
          detail: { dist_cm: 12 },
        },
        {
          deviceId,
          ts: new Date('2026-01-01T00:01:00Z'),
          mode: null,
          source: 'SERVER',
          type: 'DEVICE_ONLINE',
          detail: {},
        },
        {
          deviceId,
          ts: new Date('2026-01-01T00:02:00Z'),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'MODE_CHANGE',
          detail: { from: 'AUTO', to: 'MANUAL' },
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

  it('GET /api/devices/:id/events returns events newest first', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0]).toMatchObject({
      mode: 'AUTO',
      source: 'DEVICE',
      type: 'MODE_CHANGE',
      detail: { from: 'AUTO', to: 'MANUAL' },
      ts: '2026-01-01T00:02:00.000Z',
    });
    expect(typeof response.body.data[0].id).toBe('string');
    expect(response.body.meta).toEqual({
      count: 3,
      from: null,
      to: null,
      type: null,
      nextCursor: null,
    });
  });

  it('GET /api/devices/:id/events paginates with cursor', async () => {
    const firstPage = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({ limit: 2 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta.nextCursor).toBe(firstPage.body.data[1].id);

    const secondPage = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({ limit: 2, cursor: firstPage.body.meta.nextCursor })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.data[0].type).toBe('AVOID_DONE');
    expect(secondPage.body.meta.nextCursor).toBeNull();
  });

  it('GET /api/devices/:id/events filters by type', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({ type: 'DEVICE_ONLINE' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('DEVICE_ONLINE');
    expect(response.body.meta.type).toBe('DEVICE_ONLINE');
  });

  it('GET /api/devices/:id/events filters by time range', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({
        from: '2026-01-01T00:00:30Z',
        to: '2026-01-01T00:01:30Z',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe('DEVICE_ONLINE');
  });

  it('GET /api/devices/:id/events filters by mode', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({ mode: 'MANUAL' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(0);
  });

  it('GET /api/devices/:id/events rejects limit above 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({ limit: 201 })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/devices/:id/events rejects from after to', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .query({
        from: '2026-01-01T00:02:00Z',
        to: '2026-01-01T00:00:00Z',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/devices/:id/events returns 404 for unknown device', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/devices/e2e-unknown-device/events')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/devices/:id/events requires authentication', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/events`)
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
