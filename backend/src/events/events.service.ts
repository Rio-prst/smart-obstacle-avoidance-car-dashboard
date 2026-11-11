import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { APP_EVENTS, type EventRecordedEvent } from '../common/app-events';
import { PrismaService } from '../prisma/prisma.service';
import { MQTT_EVENTS, type DeviceEventReceivedEvent } from '../mqtt/mqtt.constants';
import type { EventQueryDto } from './dto/event-query.dto';

export type ServerEventType = 'DEVICE_ONLINE' | 'DEVICE_OFFLINE';

export interface EventItem {
  id: string;
  ts: string;
  mode: 'AUTO' | 'MANUAL' | null;
  source: string;
  type: string;
  detail: Record<string, unknown>;
}

export interface EventListResult {
  data: EventItem[];
  meta: {
    count: number;
    from: string | null;
    to: string | null;
    type: string | null;
    nextCursor: string | null;
  };
}

interface EventRow {
  id: bigint;
  ts: Date;
  mode: string | null;
  source: string;
  type: string;
  detail: Prisma.JsonValue;
}

const DEFAULT_LIMIT = 50;

const eventSelect = {
  id: true,
  ts: true,
  mode: true,
  source: true,
  type: true,
  detail: true,
} as const;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  @OnEvent(MQTT_EVENTS.deviceEvent)
  handleDeviceEvent(event: DeviceEventReceivedEvent): void {
    void this.recordDeviceEvent(event).catch((error: unknown) => {
      this.logger.warn(
        `Failed to record ${event.payload.type} event for ${event.deviceId}: ${errorMessage(error)}`,
      );
    });
  }

  async recordDeviceEvent(event: DeviceEventReceivedEvent): Promise<void> {
    const ts = event.payload.ts > 0 ? new Date(event.payload.ts * 1000) : event.receivedAt;

    const row = await this.prisma.event.create({
      data: {
        deviceId: event.deviceId,
        ts,
        mode: event.payload.mode,
        source: 'DEVICE',
        type: event.payload.type,
        detail: (event.payload.detail ?? {}) as Prisma.InputJsonValue,
      },
      select: eventSelect,
    });

    this.emitter.emit(APP_EVENTS.eventRecorded, this.toRecordedEvent(event.deviceId, row));
  }

  async recordServerEvent(
    deviceId: string,
    type: ServerEventType,
    detail: Record<string, unknown>,
    ts: Date = new Date(),
  ): Promise<void> {
    const row = await this.prisma.event.create({
      data: {
        deviceId,
        ts,
        mode: null,
        source: 'SERVER',
        type,
        detail: detail as Prisma.InputJsonValue,
      },
      select: eventSelect,
    });

    this.emitter.emit(APP_EVENTS.eventRecorded, this.toRecordedEvent(deviceId, row));
  }

  async list(deviceId: string, query: EventQueryDto): Promise<EventListResult> {
    await this.ensureDevice(deviceId);

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'from must be before to',
      });
    }

    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = query.cursor ? BigInt(query.cursor) : null;
    const rows = await this.prisma.event.findMany({
      where: {
        deviceId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.mode ? { mode: query.mode } : {}),
        ...(from || to
          ? {
              ts: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(cursor !== null ? { id: { lt: cursor } } : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: limit,
    });

    return {
      data: rows.map((row) => this.toItem(row)),
      meta: {
        count: rows.length,
        from: query.from ?? null,
        to: query.to ?? null,
        type: query.type ?? null,
        nextCursor: rows.length === limit ? rows[rows.length - 1].id.toString() : null,
      },
    };
  }

  private toItem(row: {
    id: bigint;
    ts: Date;
    mode: string | null;
    source: string;
    type: string;
    detail: Prisma.JsonValue;
  }): EventItem {
    return {
      id: row.id.toString(),
      ts: row.ts.toISOString(),
      mode: (row.mode as EventItem['mode']) ?? null,
      source: row.source,
      type: row.type,
      detail: (row.detail ?? {}) as Record<string, unknown>,
    };
  }

  private toRecordedEvent(deviceId: string, row: EventRow): EventRecordedEvent {
    return {
      deviceId,
      event: this.toItem(row),
    };
  }

  private async ensureDevice(deviceId: string): Promise<void> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Device ${deviceId} not found`,
      });
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
