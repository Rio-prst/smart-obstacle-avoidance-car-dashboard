import { Module } from '@nestjs/common';
import { DeviceStateModule } from '../device-state/device-state.module';
import { EventsModule } from '../events/events.module';
import { DevicesController } from './devices.controller';
import { DeviceService } from './devices.service';

@Module({
  imports: [DeviceStateModule, EventsModule],
  controllers: [DevicesController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DevicesModule {}
