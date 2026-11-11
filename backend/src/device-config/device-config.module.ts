import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { DeviceConfigController } from './device-config.controller';
import { DeviceConfigService } from './device-config.service';

@Module({
  imports: [DevicesModule, MqttModule],
  controllers: [DeviceConfigController],
  providers: [DeviceConfigService],
  exports: [DeviceConfigService],
})
export class DeviceConfigModule {}
