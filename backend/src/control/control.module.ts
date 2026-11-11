import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';

@Module({
  imports: [DevicesModule, MqttModule],
  controllers: [ControlController],
  providers: [ControlService],
  exports: [ControlService],
})
export class ControlModule {}
