import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  const deviceId = `e2e-anl-${randomBytes(4).toString('hex')}`;

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

    const user = await prisma.user.findFirst();
    userId = user!.id;

    await prisma.device.create({
      data: {
        id: deviceId,
        name: 'E2E Analytics Device',
        mode: 'AUTO',
        online: true,
      },
    });

    // Seed test data
    const now = new Date();
    await prisma.telemetry.createMany({
      data: [
        {
          deviceId,
          ts: new Date(now.getTime() - 10000),
          mode: 'AUTO',
          distCm: 45.2,
          valid: true,
          state: 'MAJU',
          pwm: 180,
          avoidCount: 2,
          rssi: -60,
        },
        {
          deviceId,
          ts: new Date(now.getTime() - 5000),
          mode: 'AUTO',
          distCm: null,
          valid: false,
          state: 'STOP',
          pwm: 0,
          avoidCount: 2,
          rssi: -65,
        },
      ],
    });

    await prisma.event.createMany({
      data: [
        {
          deviceId,
          ts: new Date(now.getTime() - 15000),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'MAJU',
        },
        {
          deviceId,
          ts: new Date(now.getTime() - 10000),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'STOP',
          detail: { reason: 'OBSTACLE', dist_cm: 23.5 },
        },
        {
          deviceId,
          ts: new Date(now.getTime() - 6000),
          mode: 'AUTO',
          source: 'DEVICE',
          type: 'AVOID_DONE',
        },
      ],
    });

    await prisma.command.create({
      data: {
        deviceId,
        seq: 1,
        cmd: 'START',
        status: 'acked',
        exp: new Date(now.getTime() + 30000),
        createdAt: new Date(now.getTime() - 10000),
        ackedAt: new Date(now.getTime() - 9800),
      },
    });
  });

  afterAll(async () => {
    await prisma.testTrial.deleteMany({
      where: { session: { deviceId } },
    });
    await prisma.testSession.deleteMany({
      where: { deviceId },
    });
    await prisma.command.deleteMany({ where: { deviceId } });
    await prisma.event.deleteMany({ where: { deviceId } });
    await prisma.telemetry.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it('GET /sensor returns aggregated sensor metrics', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/sensor`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.total).toBe(2);
    expect(res.body.data.valid).toBe(1);
    expect(res.body.data.invalidCount).toBe(1);
    expect(res.body.data.invalidPct).toBe(50);
    expect(res.body.meta).toBeDefined();
  });

  it('GET /state-distribution returns calculated state time', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/state-distribution`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.byState).toBeDefined();
    expect(res.body.data.windowSeconds).toBeGreaterThan(0);
  });

  it('GET /avoidance calculates cycles and rejects MANUAL mode', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/avoidance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.cycles).toBe(1);
    expect(res.body.data.cycleDurationSec.avg).toBe(4);

    await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/avoidance?mode=MANUAL`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('GET /commands returns command statistics and latency', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/commands`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.byStatus.acked).toBe(1);
    expect(res.body.data.byCmd.START).toBe(1);
    expect(res.body.data.latencyMs.avg).toBe(200);
  });

  it('GET /connectivity returns uptime and RSSI stats', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/connectivity`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.uptimePct).toBeDefined();
    expect(res.body.data.rssi.avg).toBe(-62);
  });

  it('GET /stop-distance returns recommendation or null', async () => {
    // Without JARAK_BERHENTI session -> data is null
    const resNull = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/stop-distance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resNull.body.data).toBeNull();

    // Create a JARAK_BERHENTI session and trial
    const session = await prisma.testSession.create({
      data: {
        deviceId,
        createdBy: userId,
        type: 'JARAK_BERHENTI',
        name: 'Uji Jarak',
        mode: 'AUTO',
        status: 'ended',
        startedAt: new Date(Date.now() - 5000),
        endedAt: new Date(),
      },
    });

    await prisma.testTrial.create({
      data: {
        sessionId: session.id,
        trialNo: 1,
        pwm: 150,
        stoppingDistanceCm: 14.5,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/stop-distance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.worstStoppingDistanceCm).toBe(14.5);
    expect(res.body.data.recommendedStopCm).toBe(25); // ceil(14.5 + 10) = 25
  });

  it('GET /config-comparison groups by config snapshot', async () => {
    const session = await prisma.testSession.create({
      data: {
        deviceId,
        createdBy: userId,
        type: 'PENGHINDARAN',
        name: 'Uji Config',
        mode: 'AUTO',
        status: 'ended',
        configSnapshot: { stopCm: 25, resumeCm: 30, maxPwm: 200 },
        startedAt: new Date(Date.now() - 5000),
        endedAt: new Date(),
      },
    });

    await prisma.testTrial.create({
      data: {
        sessionId: session.id,
        trialNo: 1,
        result: 'SUCCESS',
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/config-comparison`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].stopCm).toBe(25);
    expect(res.body.data[0].successRatePct).toBe(100);
  });

  it('GET /overview returns counts grouped by mode', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/analytics/overview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.AUTO.samples).toBeGreaterThanOrEqual(1);
    expect(res.body.data.AUTO.events).toBeDefined();
    expect(res.body.data.MANUAL).toBeDefined();
  });
});
