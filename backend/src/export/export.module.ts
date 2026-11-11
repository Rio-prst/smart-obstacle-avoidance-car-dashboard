import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [DevicesModule, SessionsModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
