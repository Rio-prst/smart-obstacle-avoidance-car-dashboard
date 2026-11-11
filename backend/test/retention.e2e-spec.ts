import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionService } from '../src/retention/retention.service';

describe('Retention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let retentionService: RetentionService;
  let userId: string;
  const deviceId = `e2e-ret-${randomBytes(4).toString('hex')}`;

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
    retentionService = app.get(RetentionService);

    const user = await prisma.user.findFirst();
    userId = user!.id;

    await prisma.device.create({
      data: {
        id: deviceId,
        name: 'E2E Retention Device',
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

  it('purges data older than cutoffs, but preserves data overlapping with test sessions', async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Create Session 1: Started 20 days ago, ended 18 days ago
    const session1 = await prisma.testSession.create({
      data: {
        deviceId,
        createdBy: userId,
        type: 'PENGHINDARAN',
        name: 'Past Test Session',
        mode: 'AUTO',
        status: 'ended',
        startedAt: new Date(now - 20 * day),
        endedAt: new Date(now - 18 * day),
      },
    });

    const trial1 = await prisma.testTrial.create({
      data: {
        sessionId: session1.id,
        trialNo: 1,
        result: 'SUCCESS',
      },
    });

    // Telemetry:
    // 1. 25 days ago (unprotected, > 14 days) -> DELETE
    const tUnprotectedOld = await prisma.telemetry.create({
      data: {
        deviceId,
        ts: new Date(now - 25 * day),
        mode: 'AUTO',
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 0,
      },
    });

    // 2. 19 days ago (inside Session 1, age > 14 days) -> PRESERVE
    const tProtectedBySession = await prisma.telemetry.create({
      data: {
        deviceId,
        ts: new Date(now - 19 * day),
        mode: 'AUTO',
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 0,
      },
    });

    // 3. 2 days ago (fresh, age < 14 days) -> PRESERVE
    const tFresh = await prisma.telemetry.create({
      data: {
        deviceId,
        ts: new Date(now - 2 * day),
        mode: 'AUTO',
        valid: true,
        state: 'MAJU',
        pwm: 180,
        avoidCount: 0,
      },
    });

    // Events:
    // 1. 95 days ago (unprotected, > 90 days) -> DELETE
    const eUnprotectedOld = await prisma.event.create({
      data: {
        deviceId,
        ts: new Date(now - 95 * day),
        source: 'DEVICE',
        type: 'STOP',
      },
    });

    // 2. 5 days ago (fresh, < 90 days) -> PRESERVE
    const eFresh = await prisma.event.create({
      data: {
        deviceId,
        ts: new Date(now - 5 * day),
        source: 'DEVICE',
        type: 'STOP',
      },
    });

    // Commands:
    // 1. 35 days ago (unprotected, > 30 days) -> DELETE
    const cUnprotectedOld = await prisma.command.create({
      data: {
        deviceId,
        seq: 101,
        cmd: 'START',
        status: 'acked',
        exp: new Date(now - 35 * day + 30000),
        createdAt: new Date(now - 35 * day),
      },
    });

    // 2. 19 days ago (inside Session 1, but created 19 days ago < 30 days commands cutoff, so PRESERVE)
    // Let's create one that is 40 days ago INSIDE another session!
    const sessionOld = await prisma.testSession.create({
      data: {
        deviceId,
        createdBy: userId,
        type: 'STOP',
        name: 'Very Old Session',
        mode: 'AUTO',
        status: 'ended',
        startedAt: new Date(now - 42 * day),
        endedAt: new Date(now - 38 * day),
      },
    });

    // Command created 40 days ago (inside sessionOld) -> PRESERVE
    const cProtectedBySession = await prisma.command.create({
      data: {
        deviceId,
        seq: 102,
        cmd: 'STOP',
        status: 'acked',
        exp: new Date(now - 40 * day + 30000),
        createdAt: new Date(now - 40 * day),
      },
    });

    // Run retention cleanup
    const report = await retentionService.runRetention();

    expect(report.telemetryDeleted).toBeGreaterThanOrEqual(1);
    expect(report.eventsDeleted).toBeGreaterThanOrEqual(1);
    expect(report.commandsDeleted).toBeGreaterThanOrEqual(1);

    // Verify deletion & preservation
    // Unprotected rows must be deleted
    const t1Check = await prisma.telemetry.findUnique({ where: { id: tUnprotectedOld.id } });
    expect(t1Check).toBeNull();

    const e1Check = await prisma.event.findUnique({ where: { id: eUnprotectedOld.id } });
    expect(e1Check).toBeNull();

    const c1Check = await prisma.command.findUnique({ where: { id: cUnprotectedOld.id } });
    expect(c1Check).toBeNull();

    // Protected & fresh rows must still exist
    const t2Check = await prisma.telemetry.findUnique({ where: { id: tProtectedBySession.id } });
    expect(t2Check).not.toBeNull();

    const t3Check = await prisma.telemetry.findUnique({ where: { id: tFresh.id } });
    expect(t3Check).not.toBeNull();

    const e2Check = await prisma.event.findUnique({ where: { id: eFresh.id } });
    expect(e2Check).not.toBeNull();

    const c2Check = await prisma.command.findUnique({ where: { id: cProtectedBySession.id } });
    expect(c2Check).not.toBeNull();

    // Verify test sessions and trials are never deleted
    const sessionCheck = await prisma.testSession.findUnique({ where: { id: session1.id } });
    expect(sessionCheck).not.toBeNull();

    const sessionOldCheck = await prisma.testSession.findUnique({ where: { id: sessionOld.id } });
    expect(sessionOldCheck).not.toBeNull();

    const trialCheck = await prisma.testTrial.findUnique({ where: { id: trial1.id } });
    expect(trialCheck).not.toBeNull();
  });
});
