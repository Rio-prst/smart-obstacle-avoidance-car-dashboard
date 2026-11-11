import { Module } from '@nestjs/common';
import { DeviceConfigModule } from '../device-config/device-config.module';
import { DevicesModule } from '../devices/devices.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [DevicesModule, DeviceConfigModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
