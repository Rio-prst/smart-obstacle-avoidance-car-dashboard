import { Module } from '@nestjs/common';
import { DeviceStateService } from './device-state.service';

@Module({
  providers: [DeviceStateService],
  exports: [DeviceStateService],
})
export class DeviceStateModule {}
