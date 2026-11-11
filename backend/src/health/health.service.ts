import { Injectable } from '@nestjs/common';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  mqtt: 'connected' | 'disconnected';
  db: 'connected' | 'disconnected';
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mqtt: MqttService,
  ) {}

  async check(): Promise<HealthResponse> {
    let db: HealthResponse['db'] = 'disconnected';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {
      db = 'disconnected';
    }

    const mqtt: HealthResponse['mqtt'] = this.mqtt.isConnected() ? 'connected' : 'disconnected';

    return {
      status: db === 'connected' ? 'ok' : 'degraded',
      mqtt,
      db,
    };
  }
}
