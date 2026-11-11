import { Controller, Get, Param, Query } from '@nestjs/common';
import { DeviceService } from '../devices/devices.service';
import { TelemetryQueryDto } from './dto/telemetry-query.dto';
import { TelemetryHistoryResult, TelemetryItem, TelemetryService } from './telemetry.service';

@Controller('devices/:id/telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly devices: DeviceService,
  ) {}

  @Get('latest')
  async latest(@Param('id') id: string): Promise<{ data: TelemetryItem | null }> {
    await this.devices.ensureDevice(id);
    return { data: await this.telemetry.latest(id) };
  }

  @Get()
  async history(
    @Param('id') id: string,
    @Query() query: TelemetryQueryDto,
  ): Promise<TelemetryHistoryResult> {
    await this.devices.ensureDevice(id);
    return this.telemetry.history(id, query);
  }
}
