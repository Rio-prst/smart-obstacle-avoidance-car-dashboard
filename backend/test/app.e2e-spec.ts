import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('App (e2e)', () => {
  let app: INestApplication;
  let username: string;
  let password: string;

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

    const config = app.get(ConfigService);
    username = config.get<string>('ADMIN_USERNAME') ?? 'admin';
    password = config.get<string>('ADMIN_PASSWORD') ?? '';
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      mqtt: 'disconnected',
      db: 'connected',
    });
  });

  it('POST /api/auth/login with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);

    expect(typeof response.body.accessToken).toBe('string');
    expect(response.body.expiresIn).toBeGreaterThan(0);
  });

  it('POST /api/auth/login with invalid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: 'wrong-password' })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
