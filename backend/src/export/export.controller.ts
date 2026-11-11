import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ExportCommandsQueryDto,
  ExportEventsQueryDto,
  ExportTelemetryQueryDto,
} from './dto/export-query.dto';
import { ExportService } from './export.service';

@Controller()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('devices/:id/export/telemetry.csv')
  async exportTelemetry(
    @Param('id') id: string,
    @Query() query: ExportTelemetryQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.exportService.exportTelemetry(id, query, res);
  }

  @Get('devices/:id/export/events.csv')
  async exportEvents(
    @Param('id') id: string,
    @Query() query: ExportEventsQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.exportService.exportEvents(id, query, res);
  }

  @Get('devices/:id/export/commands.csv')
  async exportCommands(
    @Param('id') id: string,
    @Query() query: ExportCommandsQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.exportService.exportCommands(id, query, res);
  }

  @Get('sessions/:sid/export.csv')
  async exportSession(
    @Param('sid') sid: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.exportService.exportSession(sid, res);
  }
}
