import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AnalyticsModule } from './analytics/analytics.module';
import { CommandsModule } from './commands/commands.module';
import { ControlModule } from './control/control.module';
import { validateEnv } from './config/env.validation';
import { DeviceConfigModule } from './device-config/device-config.module';
import { DeviceStateModule } from './device-state/device-state.module';
import { DevicesModule } from './devices/devices.module';
import { EventsModule } from './events/events.module';
import { ExportModule } from './export/export.module';
import { HealthModule } from './health/health.module';
import { MqttModule } from './mqtt/mqtt.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RetentionModule } from './retention/retention.module';
import { SessionsModule } from './sessions/sessions.module';
import { TelemetryModule } from './telemetry/telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    HealthModule,
    MqttModule,
    DeviceStateModule,
    EventsModule,
    DevicesModule,
    TelemetryModule,
    CommandsModule,
    DeviceConfigModule,
    RealtimeModule,
    SessionsModule,
    ExportModule,
    RetentionModule,
    ControlModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
