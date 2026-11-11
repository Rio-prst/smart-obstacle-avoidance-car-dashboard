import { Controller, Get, Param } from '@nestjs/common';
import { DeviceDetail, DeviceListItem, DeviceService } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DeviceService) {}

  @Get()
  async list(): Promise<{ data: DeviceListItem[] }> {
    return { data: await this.devices.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<{ data: DeviceDetail }> {
    return { data: await this.devices.get(id) };
  }
}
