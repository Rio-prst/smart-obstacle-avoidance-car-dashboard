import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APP_EVENTS, type ConfigUpdatedEvent } from '../common/app-events';
import { DeviceService } from '../devices/devices.service';
import { MqttService } from '../mqtt/mqtt.service';
import { configTopic } from '../mqtt/mqtt.constants';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConfigDto } from './dto/update-config.dto';

export interface DeviceConfigItem {
  ver: number;
  stopCm: number;
  resumeCm: number;
  maxPwm: number;
  manualMaxPwm: number;
  updatedAt: string;
}

interface DeviceConfigRow {
  ver: number;
  stopCm: number;
  resumeCm: number;
  maxPwm: number;
  manualMaxPwm: number;
  updatedAt: Date;
}

const configSelect = {
  ver: true,
  stopCm: true,
  resumeCm: true,
  maxPwm: true,
  manualMaxPwm: true,
  updatedAt: true,
} as const;

@Injectable()
export class DeviceConfigService {
  private readonly logger = new Logger(DeviceConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
    private readonly mqtt: MqttService,
    private readonly emitter: EventEmitter2,
  ) {}

  async get(deviceId: string): Promise<DeviceConfigItem> {
    await this.devices.ensureDevice(deviceId);
    return this.toItem(await this.getOrCreate(deviceId));
  }

  async getSnapshot(deviceId: string): Promise<Omit<DeviceConfigItem, 'updatedAt'>> {
    await this.devices.ensureDevice(deviceId);
    return this.toSnapshot(await this.getOrCreate(deviceId));
  }

  async update(deviceId: string, body: UpdateConfigDto): Promise<DeviceConfigItem> {
    await this.devices.ensureDevice(deviceId);
    this.validateRanges(body);

    const current = await this.getOrCreate(deviceId);

    const row = await this.prisma.deviceConfig.update({
      where: { deviceId },
      data: {
        ver: current.ver + 1,
        stopCm: body.stopCm,
        resumeCm: body.resumeCm,
        maxPwm: body.maxPwm,
        manualMaxPwm: body.manualMaxPwm,
      },
      select: configSelect,
    });

    const config = this.toSnapshot(row);

    this.mqtt.publish(configTopic(deviceId), config, { qos: 1, retain: true });

    const event: ConfigUpdatedEvent = { deviceId, config };
    this.emitter.emit(APP_EVENTS.configUpdated, event);

    return this.toItem(row);
  }

  private validateRanges(body: UpdateConfigDto): void {
    const details: { field: string; issue: string }[] = [];

    if (body.resumeCm < body.stopCm + 3) {
      details.push({ field: 'resume_cm', issue: `min ${body.stopCm + 3}` });
    }

    if (body.manualMaxPwm > body.maxPwm) {
      details.push({ field: 'manual_max_pwm', issue: `max ${body.maxPwm}` });
    }

    if (details.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'config values are out of range',
        details,
      });
    }
  }

  private toSnapshot(row: DeviceConfigRow): Omit<DeviceConfigItem, 'updatedAt'> {
    return {
      ver: row.ver,
      stopCm: row.stopCm,
      resumeCm: row.resumeCm,
      maxPwm: row.maxPwm,
      manualMaxPwm: row.manualMaxPwm,
    };
  }

  private toItem(row: DeviceConfigRow): DeviceConfigItem {
    return { ...this.toSnapshot(row), updatedAt: row.updatedAt.toISOString() };
  }

  private async getOrCreate(deviceId: string): Promise<DeviceConfigRow> {
    const existing = await this.prisma.deviceConfig.findUnique({
      where: { deviceId },
      select: configSelect,
    });

    if (existing !== null) {
      return existing;
    }

    try {
      return await this.prisma.deviceConfig.create({
        data: { deviceId },
        select: configSelect,
      });
    } catch (error) {
      this.logger.warn(`Failed to create config for ${deviceId}: ${errorMessage(error)}`);
      const retry = await this.prisma.deviceConfig.findUnique({
        where: { deviceId },
        select: configSelect,
      });

      if (retry === null) {
        throw new InternalServerErrorException({
          code: 'INTERNAL',
          message: `Failed to load config for ${deviceId}`,
        });
      }

      return retry;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
