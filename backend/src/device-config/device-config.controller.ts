import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { DeviceConfigItem, DeviceConfigService } from './device-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@Controller('devices/:id/config')
export class DeviceConfigController {
  constructor(private readonly deviceConfig: DeviceConfigService) {}

  @Get()
  async get(@Param('id') id: string): Promise<{ data: DeviceConfigItem }> {
    return { data: await this.deviceConfig.get(id) };
  }

  @Put()
  async update(
    @Param('id') id: string,
    @Body() body: UpdateConfigDto,
  ): Promise<{ data: DeviceConfigItem }> {
    return { data: await this.deviceConfig.update(id, body) };
  }
}
