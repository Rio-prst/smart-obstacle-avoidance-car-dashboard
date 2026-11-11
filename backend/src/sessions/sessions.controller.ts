import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateTrialDto } from './dto/create-trial.dto';
import { SessionQueryDto } from './dto/session-query.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import type { SessionListResult, SessionItem, SessionSummary, TrialItem } from './sessions.service';
import { SessionsService } from './sessions.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; username: string };
}

@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('devices/:id/sessions')
  @HttpCode(201)
  async create(
    @Param('id') id: string,
    @Body() body: CreateSessionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: SessionItem }> {
    return { data: await this.sessions.create(id, req.user.id, body) };
  }

  @Get('devices/:id/sessions')
  async list(
    @Param('id') id: string,
    @Query() query: SessionQueryDto,
  ): Promise<SessionListResult> {
    return await this.sessions.list(id, query);
  }

  @Get('sessions/:sid')
  async getDetail(@Param('sid') sid: string): Promise<{ data: SessionItem }> {
    return { data: await this.sessions.getDetail(sid) };
  }

  @Patch('sessions/:sid')
  async update(@Param('sid') sid: string, @Body() body: UpdateSessionDto): Promise<{ data: SessionItem }> {
    return { data: await this.sessions.update(sid, body) };
  }

  @Post('sessions/:sid/trials')
  @HttpCode(201)
  async createTrial(@Param('sid') sid: string, @Body() body: CreateTrialDto): Promise<{ data: TrialItem }> {
    return { data: await this.sessions.createTrial(sid, body) };
  }

  @Get('sessions/:sid/trials')
  async listTrials(@Param('sid') sid: string): Promise<{ data: TrialItem[] }> {
    return { data: await this.sessions.listTrials(sid) };
  }

  @Delete('sessions/:sid/trials/:tid')
  @HttpCode(204)
  async deleteTrial(@Param('sid') sid: string, @Param('tid') tid: string): Promise<void> {
    await this.sessions.deleteTrial(sid, tid);
  }

  @Get('sessions/:sid/summary')
  async summary(@Param('sid') sid: string): Promise<{ data: SessionSummary }> {
    return { data: await this.sessions.summary(sid) };
  }
}
