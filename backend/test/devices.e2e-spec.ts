import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Devices (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const deviceId = `e2e-dev-${randomBytes(4).toString('hex')}`;

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
      data: { id: deviceId, name: 'E2E Device' },
    });
  });

  afterAll(async () => {
    await prisma.telemetry.deleteMany({ where: { deviceId } });
    await prisma.event.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it('GET /api/devices requires authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/devices').expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/devices returns list including fixture device', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/devices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toContainEqual({
      id: deviceId,
      name: 'E2E Device',
      online: false,
      mode: 'AUTO',
      state: 'STOP',
      lastSeen: null,
      fw: null,
    });
  });

  it('GET /api/devices/:id returns detail for fixture device', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({
      id: deviceId,
      name: 'E2E Device',
      online: false,
      mode: 'AUTO',
      state: 'STOP',
      lastSeen: null,
      fw: null,
      avoidCount: 0,
      controller: null,
    });
  });

  it('GET /api/devices/:id returns 404 for unknown device', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/devices/e2e-unknown-device')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
