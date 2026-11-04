import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('reports ok when database is connected', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const service = new HealthService(prisma);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      mqtt: 'disconnected',
      db: 'connected',
    });
  });

  it('reports degraded when database fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database down'));

    const service = new HealthService(prisma);

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      mqtt: 'disconnected',
      db: 'disconnected',
    });
  });
});
