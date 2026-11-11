import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({
  imports: [DevicesModule, MqttModule],
  controllers: [CommandsController],
  providers: [CommandsService],
})
export class CommandsModule {}
