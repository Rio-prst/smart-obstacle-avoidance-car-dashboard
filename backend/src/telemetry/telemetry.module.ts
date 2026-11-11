import { Module } from '@nestjs/common';
import { DeviceStateModule } from '../device-state/device-state.module';
import { DevicesModule } from '../devices/devices.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [DeviceStateModule, DevicesModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
