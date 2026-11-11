import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ControlModule } from '../control/control.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, ControlModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
