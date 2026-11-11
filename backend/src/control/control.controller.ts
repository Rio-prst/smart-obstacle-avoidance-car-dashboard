import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AcquireResult, ControlStatusItem } from './control.constants';
import { ControlService } from './control.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; username: string };
}

@Controller()
export class ControlController {
  constructor(private readonly controlService: ControlService) {}

  @Get('devices/:id/control')
  async getControl(@Param('id') id: string): Promise<{ data: ControlStatusItem }> {
    return { data: await this.controlService.getControl(id) };
  }

  @Post('devices/:id/control/acquire')
  @HttpCode(200)
  async acquire(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: AcquireResult }> {
    return {
      data: await this.controlService.acquire(id, req.user.id, req.user.username),
    };
  }

  @Post('devices/:id/control/release')
  @HttpCode(204)
  async release(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.controlService.release(id, req.user.id);
  }
}
