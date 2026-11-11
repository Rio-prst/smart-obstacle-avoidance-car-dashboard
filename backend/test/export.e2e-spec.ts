import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  const deviceId = `e2e-exp-${randomBytes(4).toString('hex')}`;

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
        name: 'E2E Export Device',
        mode: 'AUTO',
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

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/export/telemetry.csv`)
      .expect(401);
  });

  it('rejects unknown device with 404', async () => {
    await request(app.getHttpServer())
      .get('/api/devices/unknown-device-id/export/telemetry.csv')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects date range exceeding 7 days with 400 VALIDATION_ERROR', async () => {
    const from = '2026-11-01T00:00:00.000Z';
    const to = '2026-11-10T00:00:00.000Z'; // 9 days

    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/export/telemetry.csv?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('7 days');
  });

  it('exports telemetry as CSV stream', async () => {
    const now = new Date();
    await prisma.telemetry.create({
      data: {
        deviceId,
        ts: now,
        mode: 'AUTO',
        distCm: 32.5,
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 3,
        rssi: -62,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/export/telemetry.csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`telemetry-${deviceId}.csv`);
    expect(res.text).toContain('id,deviceId,ts,mode,distCm,valid,state,pwm,avoidCount,rssi');
    expect(res.text).toContain(`${deviceId},${now.toISOString()},AUTO,32.5,true,MAJU,180,3,-62`);
  });

  it('exports events as CSV stream', async () => {
    const now = new Date();
    await prisma.event.create({
      data: {
        deviceId,
        ts: now,
        mode: 'AUTO',
        source: 'DEVICE',
        type: 'STOP',
        detail: { reason: 'OBSTACLE', dist_cm: 22 },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/export/events.csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`events-${deviceId}.csv`);
    expect(res.text).toContain('id,deviceId,ts,mode,source,type,detail');
    expect(res.text).toContain(`${deviceId},${now.toISOString()},AUTO,DEVICE,STOP`);
    expect(res.text).toContain('OBSTACLE');
  });

  it('exports commands as CSV stream', async () => {
    const createdAt = new Date(Date.now() - 500);
    const ackedAt = new Date();
    await prisma.command.create({
      data: {
        deviceId,
        seq: 1,
        cmd: 'START',
        status: 'acked',
        exp: new Date(Date.now() + 30000),
        createdAt,
        ackedAt,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/devices/${deviceId}/export/commands.csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`commands-${deviceId}.csv`);
    expect(res.text).toContain('id,deviceId,seq,cmd,payload,status,reason,exp,createdAt,ackedAt,latencyMs');
    expect(res.text).toContain(`${deviceId},1,START,,acked`);
  });

  it('exports session with metadata, trials, and summary', async () => {
    const session = await prisma.testSession.create({
      data: {
        deviceId,
        createdBy: userId,
        type: 'PENGHINDARAN',
        name: 'Sesi Ekspor Lengkap',
        mode: 'AUTO',
        status: 'ended',
        startedAt: new Date(Date.now() - 10000),
        endedAt: new Date(),
        notes: 'catatan uji coba ekspor',
      },
    });

    await prisma.testTrial.create({
      data: {
        sessionId: session.id,
        trialNo: 1,
        result: 'SUCCESS',
        pwm: 180,
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/sessions/${session.id}/export.csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`session-${session.id}.csv`);

    expect(res.text).toContain('# Session Metadata');
    expect(res.text).toContain('Sesi Ekspor Lengkap');
    expect(res.text).toContain('catatan uji coba ekspor');

    expect(res.text).toContain('# Trials');
    expect(res.text).toContain('1,');
    expect(res.text).toContain('SUCCESS');

    expect(res.text).toContain('# Summary');
    expect(res.text).toContain('type,PENGHINDARAN');
    expect(res.text).toContain('successRatePct,100');
  });
});
