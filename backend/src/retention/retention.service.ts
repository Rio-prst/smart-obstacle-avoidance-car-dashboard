import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  RETENTION_BATCH_SIZE,
  RETENTION_DAYS_COMMANDS,
  RETENTION_DAYS_EVENTS,
  RETENTION_DAYS_TELEMETRY,
} from './retention.constants';

export interface RetentionReport {
  telemetryDeleted: number;
  eventsDeleted: number;
  commandsDeleted: number;
}

export interface RetentionOptions {
  telemetryCutoff?: Date;
  eventsCutoff?: Date;
  commandsCutoff?: Date;
  batchSize?: number;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Starting daily retention cleanup cron job at 03:00...');
    try {
      const report = await this.runRetention();
      this.logger.log(
        `Retention cleanup completed: deleted ${report.telemetryDeleted} telemetry, ${report.eventsDeleted} events, ${report.commandsDeleted} commands`,
      );
    } catch (error) {
      this.logger.error('Failed to complete retention cleanup job', error);
    }
  }

  async runRetention(options?: RetentionOptions): Promise<RetentionReport> {
    const now = Date.now();
    const batchSize = options?.batchSize ?? RETENTION_BATCH_SIZE;

    const telemetryCutoff =
      options?.telemetryCutoff ??
      new Date(now - RETENTION_DAYS_TELEMETRY * 24 * 60 * 60 * 1000);
    const eventsCutoff =
      options?.eventsCutoff ??
      new Date(now - RETENTION_DAYS_EVENTS * 24 * 60 * 60 * 1000);
    const commandsCutoff =
      options?.commandsCutoff ??
      new Date(now - RETENTION_DAYS_COMMANDS * 24 * 60 * 60 * 1000);

    const telemetryDeleted = await this.deleteTelemetry(telemetryCutoff, batchSize);
    const eventsDeleted = await this.deleteEvents(eventsCutoff, batchSize);
    const commandsDeleted = await this.deleteCommands(commandsCutoff, batchSize);

    return {
      telemetryDeleted,
      eventsDeleted,
      commandsDeleted,
    };
  }

  private async deleteTelemetry(cutoff: Date, batchSize: number): Promise<number> {
    let total = 0;

    while (true) {
      const deleted = await this.prisma.$executeRaw`
        WITH to_delete AS (
          SELECT id FROM telemetry
          WHERE ts < ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM test_sessions s
              WHERE s.device_id = telemetry.device_id
                AND telemetry.ts >= s.started_at
                AND telemetry.ts <= COALESCE(s.ended_at, NOW())
            )
          LIMIT ${batchSize}
        )
        DELETE FROM telemetry
        WHERE id IN (SELECT id FROM to_delete);
      `;

      total += deleted;
      if (deleted < batchSize) {
        break;
      }
    }

    return total;
  }

  private async deleteEvents(cutoff: Date, batchSize: number): Promise<number> {
    let total = 0;

    while (true) {
      const deleted = await this.prisma.$executeRaw`
        WITH to_delete AS (
          SELECT id FROM events
          WHERE ts < ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM test_sessions s
              WHERE s.device_id = events.device_id
                AND events.ts >= s.started_at
                AND events.ts <= COALESCE(s.ended_at, NOW())
            )
          LIMIT ${batchSize}
        )
        DELETE FROM events
        WHERE id IN (SELECT id FROM to_delete);
      `;

      total += deleted;
      if (deleted < batchSize) {
        break;
      }
    }

    return total;
  }

  private async deleteCommands(cutoff: Date, batchSize: number): Promise<number> {
    let total = 0;

    while (true) {
      const deleted = await this.prisma.$executeRaw`
        WITH to_delete AS (
          SELECT id FROM commands
          WHERE created_at < ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM test_sessions s
              WHERE s.device_id = commands.device_id
                AND commands.created_at >= s.started_at
                AND commands.created_at <= COALESCE(s.ended_at, NOW())
            )
          LIMIT ${batchSize}
        )
        DELETE FROM commands
        WHERE id IN (SELECT id FROM to_delete);
      `;

      total += deleted;
      if (deleted < batchSize) {
        break;
      }
    }

    return total;
  }
}
