import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { Env } from '../config/env.validation';
import { APP_EVENTS, type CommandUpdateEvent } from '../common/app-events';
import { DeviceService } from '../devices/devices.service';
import { MQTT_EVENTS, commandTopic, type CommandAckReceivedEvent } from '../mqtt/mqtt.constants';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommandDto } from './dto/create-command.dto';
import { CommandQueryDto } from './dto/command-query.dto';

export type CommandStatus = 'pending' | 'acked' | 'rejected' | 'expired';

export interface CommandItem {
  id: string;
  seq: number;
  cmd: string;
  payload: Record<string, unknown> | null;
  status: CommandStatus;
  reason: string | null;
  latencyMs: number | null;
  createdAt: string;
  ackedAt: string | null;
}

export interface CommandCreateResult {
  id: string;
  seq: number;
  cmd: string;
  payload: Record<string, unknown> | null;
  status: CommandStatus;
  exp: string;
}

interface CommandRow {
  id: bigint;
  deviceId: string;
  seq: number;
  cmd: string;
  payload: Prisma.JsonValue;
  status: string;
  reason: string | null;
  createdAt: Date;
  ackedAt: Date | null;
}

const DEFAULT_LIMIT = 20;

const commandSelect = {
  id: true,
  deviceId: true,
  seq: true,
  cmd: true,
  payload: true,
  status: true,
  reason: true,
  createdAt: true,
  ackedAt: true,
} as const;

@Injectable()
export class CommandsService {
  private readonly logger = new Logger(CommandsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly devices: DeviceService,
    private readonly mqtt: MqttService,
    private readonly emitter: EventEmitter2,
  ) {}

  @OnEvent(MQTT_EVENTS.commandAck)
  handleCommandAck(event: CommandAckReceivedEvent): void {
    void this.applyAck(event).catch((error: unknown) => {
      this.logger.warn(
        `Failed to apply command ack for ${event.deviceId}: ${errorMessage(error)}`,
      );
    });
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async expirePendingCommands(): Promise<void> {
    const timeoutMs = this.config.get('CMD_ACK_TIMEOUT_SECONDS', { infer: true }) * 1000;
    const threshold = new Date(Date.now() - timeoutMs);

    const stale = await this.prisma.command.findMany({
      where: { status: 'pending', createdAt: { lt: threshold } },
      select: commandSelect,
    });

    for (const row of stale) {
      const result = await this.prisma.command.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'expired' },
      });

      if (result.count === 0) {
        continue;
      }

      this.emitCommandUpdate({ ...row, status: 'expired' });
    }
  }

  async create(deviceId: string, body: CreateCommandDto): Promise<CommandCreateResult> {
    await this.devices.ensureDevice(deviceId);

    if (body.cmd === 'SET_MODE' && body.mode === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'mode is required for SET_MODE',
      });
    }

    if (body.cmd !== 'SET_MODE' && body.mode !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'mode is only allowed for SET_MODE',
      });
    }

    if (body.cmd !== 'STOP') {
      const device = await this.prisma.device.findUnique({
        where: { id: deviceId },
        select: { online: true, mode: true, state: true },
      });

      if (device === null || !device.online) {
        throw new ConflictException({
          code: 'DEVICE_OFFLINE',
          message: `Device ${deviceId} is offline`,
        });
      }

      if (body.cmd === 'START' && device.mode !== 'AUTO') {
        throw new ConflictException({
          code: 'WRONG_MODE',
          message: 'START is only allowed in AUTO mode',
        });
      }

      if (body.cmd === 'SET_MODE' && device.state !== 'STOP') {
        throw new ConflictException({
          code: 'NOT_STOPPED',
          message: 'SET_MODE is only allowed when the device is stopped',
        });
      }
    }

    const { lastCmdSeq: seq } = await this.prisma.device.update({
      where: { id: deviceId },
      data: { lastCmdSeq: { increment: 1 } },
      select: { lastCmdSeq: true },
    });

    const exp = new Date(Date.now() + this.config.get('CMD_TTL_SECONDS', { infer: true }) * 1000);
    const mode = body.cmd === 'SET_MODE' ? body.mode : undefined;
    const payload = mode !== undefined ? { mode } : null;

    const row = await this.prisma.command.create({
      data: {
        deviceId,
        seq,
        cmd: body.cmd,
        payload: payload ?? Prisma.JsonNull,
        status: 'pending',
        exp,
      },
      select: commandSelect,
    });

    this.publishCommand(deviceId, seq, body.cmd, mode, exp);
    this.emitCommandUpdate(row);

    return {
      id: row.id.toString(),
      seq,
      cmd: row.cmd,
      payload: (row.payload ?? null) as Record<string, unknown> | null,
      status: 'pending',
      exp: exp.toISOString(),
    };
  }

  async list(deviceId: string, query: CommandQueryDto): Promise<CommandItem[]> {
    await this.devices.ensureDevice(deviceId);

    const rows = await this.prisma.command.findMany({
      where: { deviceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? DEFAULT_LIMIT,
      select: commandSelect,
    });

    return rows.map((row) => this.toItem(row));
  }

  private publishCommand(
    deviceId: string,
    seq: number,
    cmd: string,
    mode: 'AUTO' | 'MANUAL' | undefined,
    exp: Date,
  ): void {
    const message: Record<string, unknown> = {
      seq,
      cmd,
      exp: Math.floor(exp.getTime() / 1000),
      ...(mode !== undefined ? { mode } : {}),
    };

    this.mqtt.publish(commandTopic(deviceId), message, { qos: 1, retain: false });
  }

  private async applyAck(event: CommandAckReceivedEvent): Promise<void> {
    if (event.payload.cfg_ver !== undefined) {
      return;
    }

    const row = await this.prisma.command.findUnique({
      where: { deviceId_seq: { deviceId: event.deviceId, seq: event.payload.seq } },
      select: commandSelect,
    });

    if (row === null || row.status !== 'pending') {
      return;
    }

    const status: CommandStatus = event.payload.ok ? 'acked' : 'rejected';
    const reason = event.payload.ok ? null : event.payload.reason ?? 'INVALID';

    const result = await this.prisma.command.updateMany({
      where: { id: row.id, status: 'pending' },
      data: { status, reason, ackedAt: event.receivedAt },
    });

    if (result.count === 0) {
      return;
    }

    this.emitCommandUpdate({ ...row, status, reason, ackedAt: event.receivedAt });
  }

  private emitCommandUpdate(row: CommandRow): void {
    const event: CommandUpdateEvent = {
      deviceId: row.deviceId,
      command: {
        id: row.id.toString(),
        seq: row.seq,
        cmd: row.cmd,
        status: row.status as CommandStatus,
        reason: row.reason,
        latencyMs: row.ackedAt !== null ? row.ackedAt.getTime() - row.createdAt.getTime() : null,
      },
    };

    this.emitter.emit(APP_EVENTS.commandUpdated, event);
  }

  private toItem(row: CommandRow): CommandItem {
    return {
      id: row.id.toString(),
      seq: row.seq,
      cmd: row.cmd,
      payload: (row.payload ?? null) as Record<string, unknown> | null,
      status: row.status as CommandStatus,
      reason: row.reason,
      latencyMs: row.ackedAt !== null ? row.ackedAt.getTime() - row.createdAt.getTime() : null,
      createdAt: row.createdAt.toISOString(),
      ackedAt: row.ackedAt?.toISOString() ?? null,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
