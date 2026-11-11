import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

  function createService(mqttConnected: boolean): HealthService {
    const mqtt = { isConnected: () => mqttConnected } as unknown as MqttService;
    return new HealthService(prisma, mqtt);
  }

  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('reports ok when database is connected and mqtt is connected', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(createService(true).check()).resolves.toEqual({
      status: 'ok',
      mqtt: 'connected',
      db: 'connected',
    });
  });

  it('reports ok when database is connected even if mqtt is disconnected', async () => {
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(createService(false).check()).resolves.toEqual({
      status: 'ok',
      mqtt: 'disconnected',
      db: 'connected',
    });
  });

  it('reports degraded when database fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database down'));

    await expect(createService(false).check()).resolves.toEqual({
      status: 'degraded',
      mqtt: 'disconnected',
      db: 'disconnected',
    });
  });
});
