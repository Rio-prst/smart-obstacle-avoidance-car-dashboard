import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const deviceId = `e2e-ses-${randomBytes(4).toString('hex')}`;

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
        name: 'E2E Session Device',
        mode: 'AUTO',
      },
    });

    await prisma.deviceConfig.create({
      data: {
        deviceId,
        ver: 1,
        stopCm: 25,
        resumeCm: 30,
        maxPwm: 200,
        manualMaxPwm: 150,
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
    await prisma.telemetry.deleteMany({ where: { deviceId } });
    await prisma.deviceConfig.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await app.close();
  });

  it('full session lifecycle: create -> duplicate conflict -> trials -> summary -> end -> post trial rejected -> delete trial', async () => {
    // 1. Create a session
    const createRes = await request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'PENGHINDARAN',
        name: 'E2E Test Session 1',
        obstacleType: 'balok',
        obstacleSize: '20x20',
        floorSurface: 'keramik',
        laneWidthCm: 60,
        batteryLevel: '8.0V',
        pwmSetting: 180,
        notes: 'initial note',
      })
      .expect(201);

    expect(createRes.body.data).toMatchObject({
      deviceId,
      type: 'PENGHINDARAN',
      name: 'E2E Test Session 1',
      mode: 'AUTO',
      status: 'running',
    });
    expect(createRes.body.data.configSnapshot).toMatchObject({
      ver: 1,
      stopCm: 25,
      resumeCm: 30,
    });

    const sessionId = createRes.body.data.id;

    // 2. Reject creating a second running session on same device
    const duplicateRes = await request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'PENGHINDARAN',
        name: 'E2E Duplicate Session',
      })
      .expect(409);

    expect(duplicateRes.body.error.code).toBe('CONFLICT');

    // 3. Create trials
    const trial1Res = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/trials`)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'SUCCESS' })
      .expect(201);

    expect(trial1Res.body.data.trialNo).toBe(1);
    expect(trial1Res.body.data.result).toBe('SUCCESS');
    const trial1Id = trial1Res.body.data.id;

    const trial2Res = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/trials`)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'COLLISION' })
      .expect(201);

    expect(trial2Res.body.data.trialNo).toBe(2);
    expect(trial2Res.body.data.result).toBe('COLLISION');

    // 4. Verify summary
    const summaryRes = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}/summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(summaryRes.body.data).toEqual({
      type: 'PENGHINDARAN',
      mode: 'AUTO',
      trials: 2,
      success: 1,
      collision: 1,
      successRatePct: 50.0,
      target: { success: 18, trials: 20, label: 'initial target' },
    });

    // 5. End the session via PATCH
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ended', notes: 'session finished' })
      .expect(200);

    expect(patchRes.body.data.status).toBe('ended');
    expect(patchRes.body.data.endedAt).not.toBeNull();
    expect(patchRes.body.data.notes).toBe('session finished');

    // 6. Attempting to add trial after ended returns 409 SESSION_ENDED
    const endedTrialRes = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/trials`)
      .set('Authorization', `Bearer ${token}`)
      .send({ result: 'SUCCESS' })
      .expect(409);

    expect(endedTrialRes.body.error.code).toBe('SESSION_ENDED');

    // 7. Delete trial
    await request(app.getHttpServer())
      .delete(`/api/sessions/${sessionId}/trials/${trial1Id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Verify deleted
    const trialsListRes = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}/trials`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(trialsListRes.body.data).toHaveLength(1);
    expect(trialsListRes.body.data[0].id).toBe(trial2Res.body.data.id);
  });

  it('SENSOR session: captures fresh telemetry (< 3s) and rejects stale telemetry (> 3s)', async () => {
    // Create SENSOR session
    const sessionRes = await request(app.getHttpServer())
      .post(`/api/devices/${deviceId}/sessions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'SENSOR',
        name: 'E2E Sensor Test Session',
      })
      .expect(201);

    const sessionId = sessionRes.body.data.id;

    // Insert stale telemetry (5 seconds ago)
    await prisma.telemetry.create({
      data: {
        deviceId,
        ts: new Date(Date.now() - 5000),
        mode: 'AUTO',
        distCm: 50.2,
        valid: true,
        state: 'STOP',
        pwm: 0,
        avoidCount: 0,
        rssi: -60,
      },
    });

    // Attempt trial with captureSensor -> should fail with 409 CONFLICT because stale
    const staleRes = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/trials`)
      .set('Authorization', `Bearer ${token}`)
      .send({ refDistanceCm: 50, captureSensor: true })
      .expect(409);

    expect(staleRes.body.error.code).toBe('CONFLICT');

    // Insert fresh telemetry (< 1s ago)
    await prisma.telemetry.create({
      data: {
        deviceId,
        ts: new Date(),
        mode: 'AUTO',
        distCm: 49.5,
        valid: true,
        state: 'STOP',
        pwm: 0,
        avoidCount: 0,
        rssi: -60,
      },
    });

    // Attempt trial again with captureSensor -> should succeed
    const freshRes = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/trials`)
      .set('Authorization', `Bearer ${token}`)
      .send({ refDistanceCm: 50, captureSensor: true })
      .expect(201);

    expect(freshRes.body.data.refDistanceCm).toBe(50);
    expect(freshRes.body.data.measuredCm).toBe(49.5);
    expect(freshRes.body.data.valid).toBe(true);

    // End session to clean up
    await request(app.getHttpServer())
      .patch(`/api/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ended' })
      .expect(200);
  });
});
